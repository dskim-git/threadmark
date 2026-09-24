import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { parsePdfLocator, type PdfLocator } from "./pdf-locator";
import {
  isCaptureType,
  isVerificationStatus,
  type CaptureType,
  type VerificationStatus,
} from "./types";

/**
 * Capture 조회 계층.
 *
 * sources와 같은 원칙을 따른다. 모든 함수가 먼저 승인된 계정인지 확인하고,
 * 삭제 표시된 행은 RLS가 걸러내지만 질의에서도 한 번 더 제외한다.
 */

const CAPTURE_COLUMNS =
  "id, source_id, capture_type, content, original_text, translated_text, translation_language, translation_provider, translation_model, translated_at, ai_generated, verification_status, starred, locator, created_at, updated_at";

export type Capture = {
  id: string;
  sourceId: string | null;
  captureType: CaptureType;
  content: string | null;
  originalText: string | null;
  translatedText: string | null;
  translationLanguage: string | null;
  /** 무엇이 이 번역을 만들었는지. (설계 문서 9.4절) */
  translationProvider: string | null;
  translationModel: string | null;
  /** 번역이 만들어진 시각. 나중에 고쳐도 움직이지 않는다. */
  translatedAt: string | null;
  aiGenerated: boolean;
  /** 사람이 쓴 것인지, 기계가 만든 그대로인지, 고친 것인지. */
  verificationStatus: VerificationStatus;
  /** 중요 표시(별). (설계 문서 6.2-1절) */
  starred: boolean;
  /** PDF에서 온 기록의 자리. 고른 문장이거나, 쪽만 가리키거나. 아니면 null. */
  pdfLocation: PdfLocator | null;
  createdAt: string;
  updatedAt: string;
};

type CaptureRow = {
  id: string;
  source_id: string | null;
  capture_type: string;
  content: string | null;
  original_text: string | null;
  translated_text: string | null;
  translation_language: string | null;
  translation_provider: string | null;
  translation_model: string | null;
  translated_at: string | null;
  ai_generated: boolean;
  verification_status: string;
  starred: boolean;
  locator: unknown;
  created_at: string;
  updated_at: string;
};

function toCapture(row: CaptureRow): Capture[] {
  // 알 수 없는 유형은 조용히 버린다. 화면이 무엇을 보여줄지 정할 수 없기 때문이다.
  if (!isCaptureType(row.capture_type)) {
    return [];
  }

  return [
    {
      id: row.id,
      sourceId: row.source_id,
      captureType: row.capture_type,
      content: row.content,
      originalText: row.original_text,
      translatedText: row.translated_text,
      translationLanguage: row.translation_language,
      translationProvider: row.translation_provider,
      translationModel: row.translation_model,
      translatedAt: row.translated_at,
      aiGenerated: row.ai_generated,
      /*
        알 수 없는 값이면 "사람이 썼다"로 본다.
        기계가 만들었다는 표시를 붙이려면 그렇다고 확인되어야 한다.
        모르면서 붙이면 사람이 쓴 글에 기계 꼬리표가 달린다.
      */
      verificationStatus: isVerificationStatus(row.verification_status)
        ? row.verification_status
        : "user_written",
      starred: row.starred,
      // locator는 JSONB라 무엇이든 들어갈 수 있다. 읽는 쪽이 모양을 확인한다.
      pdfLocation: parsePdfLocator(row.locator),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ];
}

/**
 * 특정 자료에 달린 기록. 오래된 것부터 보여준다. 읽은 순서를 따라가기 쉽다.
 *
 * @param starredOnly 참이면 별을 단 기록만 돌려준다. (설계 문서 6.2-1절)
 * @param onlyIds 주면 이 id에 든 기록만 돌려준다. 태그로 거를 때 쓴다.
 *   빈 배열은 "그 태그가 달린 기록이 없다"는 뜻이다. (설계 문서 20-1절)
 */
export async function listCapturesForSource(
  sourceId: string,
  starredOnly = false,
  onlyIds?: readonly string[],
): Promise<Capture[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  let query = supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .eq("source_id", sourceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (starredOnly) {
    query = query.eq("starred", true);
  }

  if (onlyIds !== undefined) {
    query = query.in("id", onlyIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ThreadMark] 기록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap(toCapture);
}

/**
 * 자료에 붙지 않은 기록. Inbox 화면이 쓴다.
 *
 * 자료 없이 남긴 기록은 여기 말고는 볼 곳이 없다.
 * 최신순으로 보여줘 방금 적은 것이 먼저 보이게 한다.
 *
 * @param starredOnly 참이면 별을 단 기록만 돌려준다. (설계 문서 6.2-1절)
 * @param onlyIds 주면 이 id에 든 기록만 돌려준다. 태그로 거를 때 쓴다.
 */
export async function listInboxCaptures(
  starredOnly = false,
  onlyIds?: readonly string[],
): Promise<Capture[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  let query = supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .is("source_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  /*
    거르는 일을 데이터베이스에서 한다.
    captures_owner_starred_created_idx가 이 조건을 받는다.
  */
  if (starredOnly) {
    query = query.eq("starred", true);
  }

  if (onlyIds !== undefined) {
    query = query.in("id", onlyIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ThreadMark] Inbox 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap(toCapture);
}

/** 기록 하나. 없거나 내 것이 아니면 null을 돌려준다. */
export async function getCaptureById(id: string): Promise<Capture | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 기록 조회 실패:", error.message);

    return null;
  }

  return data ? (toCapture(data)[0] ?? null) : null;
}

/** 자료에 붙지 않은 기록 수. 화면 안내에 쓴다. */
export async function countInboxCaptures(): Promise<number> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .is("source_id", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] Inbox 수 조회 실패:", error.message);

    return 0;
  }

  return count ?? 0;
}

export type CaptureCounts = {
  /** 전부 몇 건인지. */
  total: number;
  /** 별을 단 것이 몇 건인지. (설계 문서 6.2-1절) */
  starred: number;
};

/**
 * 기록 목록 위의 고르는 줄에 쓰는 수.
 *
 * @param sourceId 자료에 달린 기록을 센다. null이면 자료에 붙지 않은
 *   기록(빠른 기록)을 센다.
 *
 * 걸러진 목록과 무관하게 **항상 전체**를 센다. 별만 보는 중에도 "전체 몇 건"이
 * 보여야 걸러져 있다는 사실과 돌아갈 곳을 함께 알 수 있다.
 */
export async function countCaptureStars(
  sourceId: string | null,
): Promise<CaptureCounts> {
  await requireActiveAccount();

  const supabase = await createClient();

  const query = supabase
    .from("captures")
    .select("starred")
    .is("deleted_at", null);

  const { data, error } = await (sourceId === null
    ? query.is("source_id", null)
    : query.eq("source_id", sourceId));

  if (error) {
    console.error("[ThreadMark] 기록 수 조회 실패:", error.message);

    return { total: 0, starred: 0 };
  }

  const rows = data ?? [];

  return {
    total: rows.length,
    starred: rows.filter((row) => row.starred).length,
  };
}

/** 삭제하지 않은 기록 수. 첫 화면의 요약에 쓴다. */
export async function countCaptures(): Promise<number> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] 기록 수 조회 실패:", error.message);

    return 0;
  }

  return count ?? 0;
}
