"use server";

import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveAccessToken } from "@/lib/drive/connection";
import { fetchDriveFileContent } from "@/lib/drive/download";
import type { ImportCandidate, ImportedPaper } from "@/lib/papers/crossref";
import {
  lookupByDoi,
  searchByTitle,
} from "@/lib/papers/crossref-lookup";
import { findDois } from "@/lib/papers/doi-scan";
import { readPdfHeadText } from "@/lib/papers/pdf-text";
import { normalizeDoi } from "@/lib/papers/schema";
import { takeSlot } from "@/lib/translation/rate-limit";

/**
 * 서지 정보 가져오기. (설계 문서 8.5절)
 *
 * 세 가지 길이 있고 모두 같은 곳에서 끝난다.
 *
 *   PDF에서 DOI 찾기  ->  Crossref
 *   DOI 직접 입력      ->  Crossref
 *   제목으로 찾기      ->  Crossref (후보 여럿)
 *
 * **어느 길이든 저장하지 않는다.** 찾은 값을 돌려줄 뿐이고, 입력란을 채우는
 * 것도 저장하는 것도 사용자가 한다. 서지 정보는 틀려도 그럴듯해 보이는 것이
 * 가장 위험하다. 그대로 논문 참고문헌에 실리기 때문이다.
 *
 * 첫 번째 길이 국내 논문에서 특히 중요하다. Crossref의 제목 검색은 한글로는
 * 거의 나오지 않는다. 국내 논문이 영문 제목과 로마자 저자명으로 등록되어
 * 있기 때문이다. (2026-09-23 확인) DOI로는 국내 논문도 잘 나온다.
 */

/**
 * 누가 언제 요청했는지.
 *
 * Crossref는 공짜지만 우리 서버 주소로 나가는 요청이다. 예의를 지켜야 하고,
 * 화면을 거치지 않고 쏟아붓는 경우도 막아야 한다.
 *
 * 세는 자리가 서버 프로세스의 기억이라 서버가 여럿이면 헐겁게 걸린다.
 * 번역에 적어둔 것과 같은 한계다. (rate-limit.ts)
 */
const lookupHistory = new Map<string, readonly number[]>();

const LOOKUP_LIMIT = { windowMs: 60_000, max: 20 };

/** PDF를 읽는 것은 무거운 일이라 더 좁게 건다. */
const scanHistory = new Map<string, readonly number[]>();

const SCAN_LIMIT = { windowMs: 60_000, max: 5 };

export type ImportResult =
  | { ok: true; kind: "paper"; paper: ImportedPaper }
  | { ok: true; kind: "candidates"; candidates: ImportCandidate[] }
  /** PDF에서 DOI를 여럿 찾은 경우. 어느 것인지 사용자가 고른다. */
  | { ok: true; kind: "dois"; dois: string[] }
  | { ok: false; message: string };

function checkLimit(
  store: Map<string, readonly number[]>,
  userId: string,
  limit: { windowMs: number; max: number },
): string | null {
  const decision = takeSlot(store.get(userId) ?? [], Date.now(), limit);

  store.set(userId, decision.next);

  if (decision.allowed) {
    return null;
  }

  const seconds = Math.ceil(decision.retryAfterMs / 1000);

  return `요청이 너무 잦습니다. ${seconds}초 뒤에 다시 시도해 주세요.`;
}

/** DOI 하나로 서지 정보를 가져온다. */
export async function importByDoi(input: unknown): Promise<ImportResult> {
  const account = await requireActiveAccount();

  const parsed = z.object({ doi: z.string() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  /*
    주소째 붙여넣어도 되게 한다. 저장할 때 쓰는 것과 같은 함수를 쓴다.
    두 곳이 다른 규칙으로 다듬으면, 가져온 DOI와 저장된 DOI가 달라진다.
  */
  const doi = normalizeDoi(parsed.data.doi);

  if (doi === null) {
    return {
      ok: false,
      message: "DOI는 10.으로 시작하는 형태여야 합니다.",
    };
  }

  const limited = checkLimit(lookupHistory, account.userId, LOOKUP_LIMIT);

  if (limited) {
    return { ok: false, message: limited };
  }

  const result = await lookupByDoi(doi);

  return result.ok
    ? { ok: true, kind: "paper", paper: result.value }
    : { ok: false, message: result.message };
}

/** 제목으로 찾는다. 후보를 돌려주고 고르게 한다. */
export async function importByTitle(input: unknown): Promise<ImportResult> {
  const account = await requireActiveAccount();

  const parsed = z
    .object({
      query: z
        .string()
        .trim()
        .min(2, "두 글자 이상 적어 주세요.")
        .max(300, "검색어가 너무 깁니다."),
    })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
    };
  }

  const limited = checkLimit(lookupHistory, account.userId, LOOKUP_LIMIT);

  if (limited) {
    return { ok: false, message: limited };
  }

  const result = await searchByTitle(parsed.data.query);

  return result.ok
    ? { ok: true, kind: "candidates", candidates: result.value }
    : { ok: false, message: result.message };
}

/**
 * 자료에 붙은 PDF에서 DOI를 찾는다.
 *
 * 하나만 찾으면 바로 Crossref에 물어 서지 정보까지 돌려준다.
 * 여럿이면 목록만 돌려주고 사용자가 고르게 한다. 보통 첫 번째가 그 논문의
 * 것이지만 **보통**이 늘 맞지는 않다. 참고문헌의 DOI를 주울 수 있다.
 */
export async function importFromPdf(input: unknown): Promise<ImportResult> {
  const account = await requireActiveAccount();

  const parsed = z
    .object({ sourceFileId: z.uuid() })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const limited = checkLimit(scanHistory, account.userId, SCAN_LIMIT);

  if (limited) {
    return { ok: false, message: limited };
  }

  /*
    파일이 정말 이 사람 것인지 확인한다.
    RLS의 source_files_select_own 정책이 남의 파일을 돌려주지 않으므로,
    찾지 못하면 없는 것으로 본다. 없는 파일과 남의 파일을 구분하지 않는다.
  */
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: file, error } = await supabase
    .from("source_files")
    .select("id, drive_file_id, mime_type, status")
    .eq("id", parsed.data.sourceFileId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 파일 조회 실패:", error.message);

    return { ok: false, message: "파일을 읽지 못했습니다." };
  }

  if (!file || !file.drive_file_id || file.mime_type !== "application/pdf") {
    return { ok: false, message: "읽을 수 있는 PDF를 찾지 못했습니다." };
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    return {
      ok: false,
      message: "Google Drive 연결을 확인해 주세요.",
    };
  }

  const download = await fetchDriveFileContent({
    accessToken,
    fileId: file.drive_file_id,
    // 앞쪽 몇 장만 필요하지만 PDF는 끝에서부터 읽어야 하는 구조라 통째로 받는다.
    range: null,
  });

  if (download.outcome !== "ok") {
    return {
      ok: false,
      message:
        download.outcome === "missing"
          ? "Drive에서 파일을 찾지 못했습니다."
          : "파일을 내려받지 못했습니다.",
    };
  }

  let text: string;

  try {
    const buffer = await download.response.arrayBuffer();

    text = await readPdfHeadText(new Uint8Array(buffer));
  } catch (caught) {
    console.error(
      "[ThreadMark] PDF 글자 읽기 실패:",
      caught instanceof Error ? caught.message : "알 수 없는 오류",
    );

    return { ok: false, message: "PDF를 읽지 못했습니다." };
  }

  const dois = findDois(text);

  if (dois.length === 0) {
    /*
      글자가 아예 없으면 스캔본이다. 있는데 DOI만 없는 것과 다른 상황이라
      안내도 다르게 한다. 할 수 있는 일이 다르기 때문이다.
    */
    return {
      ok: false,
      message:
        text.trim().length === 0
          ? "이 PDF에서는 글자를 찾지 못했습니다. 스캔한 파일로 보입니다. 서지 정보는 손으로 적어야 합니다."
          : "이 PDF에서 DOI를 찾지 못했습니다. 제목으로 찾거나 손으로 적어 주세요.",
    };
  }

  if (dois.length > 1) {
    return { ok: true, kind: "dois", dois };
  }

  const result = await lookupByDoi(dois[0] as string);

  return result.ok
    ? { ok: true, kind: "paper", paper: result.value }
    : { ok: false, message: result.message };
}
