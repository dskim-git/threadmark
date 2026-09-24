"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  pdfPageLocatorSchema,
  pdfSelectionLocatorSchema,
} from "@/lib/captures/pdf-locator";
import {
  MAX_TEXT_LENGTH,
  captureInputSchema,
  firstIssueMessage,
  formValue,
} from "@/lib/captures/schema";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { readStarredInput } from "@/lib/stars";
import {
  ANTHROPIC_PROVIDER_NAME,
  getAnthropicModel,
} from "@/lib/translation/anthropic";
import { isTranslationLanguage } from "@/lib/translation/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Capture 생성·수정·삭제.
 *
 * 네 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. captures_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·불변 컬럼 가드 트리거
 *   4. 연결 자료 소유자 확인 트리거
 *
 * 네 번째가 Capture에만 있는 것이다. 외래키 제약은 RLS를 보지 않아서,
 * source_id 값만 알면 남의 자료에 기록을 붙일 수 있기 때문이다.
 */

const idSchema = z.uuid();

/**
 * 조회 문자열을 붙여 이동한다.
 *
 * Server Action의 리디렉션 주소는 HTTP 헤더로 전달되고, 헤더 값에는 ASCII만
 * 들어갈 수 있다. 모든 값을 여기서 한 번에 인코딩한다.
 */
function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

function readInput(formData: FormData) {
  const sourceId = formValue(formData.get("sourceId"));

  return captureInputSchema.safeParse({
    captureType: formValue(formData.get("captureType")),
    sourceId: sourceId.length > 0 ? sourceId : null,
    content: formValue(formData.get("content")),
    originalText: formValue(formData.get("originalText")),
    translatedText: formValue(formData.get("translatedText")),
    translationLanguage: formValue(formData.get("translationLanguage")),
  });
}

/** 기록을 남긴 뒤 돌아갈 곳. 자료에 붙였으면 그 자료로, 아니면 Inbox로. */
function originFor(sourceId: string | null): string {
  return sourceId ? `/sources/${sourceId}` : "/inbox";
}

export type PdfCaptureResult = { ok: true } | { ok: false; message: string };

/**
 * PDF에서 고른 문장을 기록으로 남긴다. (설계 문서 9.3절, 9.4절)
 *
 * 다른 기록 동작과 달리 redirect를 하지 않고 값을 돌려준다.
 * 읽던 자리를 잃지 않으려는 것이다. 한 문장 남길 때마다 화면이 넘어가면
 * 다시 그 쪽을 찾아가야 한다.
 *
 * 설계 문서 2.4절대로 나눠 담는다.
 *
 *   PDF에서 고른 문장  ->  original_text  (자료가 한 말)
 *   사용자가 쓴 메모    ->  content        (내가 한 말)
 *
 * 유형은 인용이다. 메모를 쓰지 않아도 인용으로 남는다. 인용은 원문이 있어야
 * 하므로 데이터베이스 제약조건도 이 형태를 요구한다.
 *
 * 자료 확인은 따로 하지 않는다. 트리거 assert_source_owned가 남의 자료에
 * 붙이려는 시도를 막는다. 그 확인을 여기서 흉내 내면 두 벌이 되고,
 * 한쪽만 고쳐졌을 때 어느 쪽이 맞는지 알 수 없게 된다.
 */
const pdfCaptureSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  // 사용자가 적은 메모. 비어 있으면 인용만 남는다.
  memo: z
    .string()
    .max(MAX_TEXT_LENGTH, `${MAX_TEXT_LENGTH}자를 넘을 수 없습니다.`)
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : null)),
  locator: pdfSelectionLocatorSchema,
});

export async function createPdfSelectionCapture(
  input: unknown,
): Promise<PdfCaptureResult> {
  await requireActiveAccount();

  const parsed = pdfCaptureSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const { sourceId, memo, locator } = parsed.data;

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
    source_id: sourceId,
    capture_type: "quote",
    original_text: locator.selectedText,
    content: memo,
    // 어디서 가져온 말인지. 설계 문서 6.3절의 모양이다.
    locator,
  });

  if (error) {
    console.error("[ThreadMark] PDF 기록 생성 실패:", error.message);

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 자료 상세의 기록 목록이 바로 반영되게 한다.
  revalidatePath(`/sources/${sourceId}`);

  return { ok: true };
}

/**
 * 고른 문장을 번역과 함께 기록으로 남긴다. (설계 문서 9.4절)
 *
 * 9.4절의 흐름 가운데 마지막 두 걸음이다.
 *   4. 사용자가 `번역과 함께 저장`을 선택하면 Capture로 저장한다.
 *   5. 번역 공급자, 모델, 언어, 생성 시각을 기록한다.
 *
 * 인용 저장과 나눠 담는 자리가 하나 더 있다.
 *
 *   PDF에서 고른 문장  ->  original_text   (자료가 한 말)
 *   옮긴 글            ->  translated_text (기계가 만든 것)
 *   사용자가 쓴 메모    ->  content         (내가 한 말)
 *
 * 세 가지가 섞이지 않는 것이 설계 문서 2.4절이 요구하는 것이다.
 *
 * 공급자와 모델은 화면이 보낸 값을 쓰지 않고 서버가 자기 설정에서 읽는다.
 * 보안 원칙 2와 같은 생각이다. "무엇이 이 번역을 만들었는가"를 화면이 정할 수
 * 있으면 그 값은 기록이 아니라 주장이 된다.
 *
 * 생성 시각만 화면이 보낸 값을 받는다. 번역한 때와 저장하는 때가 다르기
 * 때문이다. 다만 앞날의 시각이거나 형태가 이상하면 버리고 지금 시각을 쓴다.
 */
const pdfTranslationSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  memo: z
    .string()
    .max(MAX_TEXT_LENGTH, `${MAX_TEXT_LENGTH}자를 넘을 수 없습니다.`)
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : null)),
  locator: pdfSelectionLocatorSchema,
  targetLanguage: z.string().refine(isTranslationLanguage, {
    message: "옮긴 언어를 알 수 없습니다.",
  }),
  /** 번역기가 내놓은 그대로. 사람이 손댔는지 판단하는 데만 쓴다. */
  machineTranslatedText: z
    .string()
    .trim()
    .min(1, "번역 결과가 없습니다.")
    .max(MAX_TEXT_LENGTH, `${MAX_TEXT_LENGTH}자를 넘을 수 없습니다.`),
  /** 실제로 저장할 번역문. 사용자가 고쳤다면 고친 것이 여기에 온다. */
  translatedText: z
    .string()
    .trim()
    .min(1, "번역 결과가 없습니다.")
    .max(MAX_TEXT_LENGTH, `${MAX_TEXT_LENGTH}자를 넘을 수 없습니다.`),
  translatedAt: z.string(),
});

/** 앞날의 시각이거나 읽을 수 없는 형태면 지금 시각으로 바꾼다. */
function trustedTranslatedAt(value: string, now: number): string {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed) || parsed > now) {
    return new Date(now).toISOString();
  }

  return new Date(parsed).toISOString();
}

export async function createPdfTranslationCapture(
  input: unknown,
): Promise<PdfCaptureResult> {
  await requireActiveAccount();

  const parsed = pdfTranslationSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const {
    sourceId,
    memo,
    locator,
    targetLanguage,
    machineTranslatedText,
    translatedText,
    translatedAt,
  } = parsed.data;

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
    source_id: sourceId,
    capture_type: "translation",
    original_text: locator.selectedText,
    translated_text: translatedText,
    translation_language: targetLanguage,
    // 화면이 보낸 값이 아니라 서버 설정에서 읽는다.
    translation_provider: ANTHROPIC_PROVIDER_NAME,
    translation_model: getAnthropicModel(),
    translated_at: trustedTranslatedAt(translatedAt, Date.now()),
    content: memo,
    // 기계에서 나온 글이라는 표시. 설계 문서 9.4절의 "기계 번역임을 표시한다".
    ai_generated: true,
    /*
      저장하기 전에 이미 고쳤다면 그 사실을 여기서 남긴다.
      저장한 뒤에 고치는 경우는 트리거가 맡는다. 두 길 모두 막아두지 않으면
      "AI 원본과 수정본을 구분한다"가 한쪽에서만 지켜진다.
    */
    verification_status:
      translatedText === machineTranslatedText
        ? "machine_generated"
        : "user_edited",
    locator,
  });

  if (error) {
    console.error("[ThreadMark] 번역 기록 생성 실패:", error.message);

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath(`/sources/${sourceId}`);

  return { ok: true };
}


/**
 * 지금 보는 쪽에 메모를 남긴다. (설계 문서 22절의 `페이지 메모`)
 *
 * 문장을 고르지 않고 쪽만 가리킨다. 스캔 이미지 PDF에는 고를 글자가 없어서
 * 이 길이 유일하다. 9.5절의 안내문이 약속하는 것이 이것이다.
 *
 * 유형은 일반 메모다. 인용이 아니므로 원문 칸은 비운다.
 * 설계 문서 2.4절의 구분을 지키려면, 자료가 한 말이 없을 때 그 칸을
 * 비워두는 것이 맞다. 내가 쓴 글을 원문 칸에 넣으면 그 구분이 무너진다.
 *
 * 메모는 반드시 있어야 한다. 빈 메모는 남길 이유가 없고, captures 표도
 * 내용이 하나는 있어야 한다는 제약을 걸고 있다.
 */
const pdfPageMemoSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  memo: z
    .string()
    .trim()
    .min(1, "메모를 입력해 주세요.")
    .max(MAX_TEXT_LENGTH, `${MAX_TEXT_LENGTH}자를 넘을 수 없습니다.`),
  locator: pdfPageLocatorSchema,
});

export async function createPdfPageCapture(
  input: unknown,
): Promise<PdfCaptureResult> {
  await requireActiveAccount();

  const parsed = pdfPageMemoSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const { sourceId, memo, locator } = parsed.data;

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
    source_id: sourceId,
    capture_type: "note",
    content: memo,
    locator,
  });

  if (error) {
    console.error("[ThreadMark] 페이지 메모 생성 실패:", error.message);

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath(`/sources/${sourceId}`);

  return { ok: true };
}

export async function createCapture(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const fallback = sanitizeNextPath(formValue(formData.get("returnTo")));
  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery(fallback, { error: firstIssueMessage(parsed.error) });
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
    source_id: input.sourceId,
    capture_type: input.captureType,
    content: input.content,
    original_text: input.originalText,
    translated_text: input.translatedText,
    translation_language: input.translationLanguage,
  });

  if (error) {
    console.error("[ThreadMark] 기록 생성 실패:", error.message);
    redirectWithQuery(fallback, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  const destination = originFor(input.sourceId);

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "기록을 남겼습니다." });
}

export async function updateCapture(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/inbox", { error: "잘못된 요청입니다." });
  }

  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery(`/captures/${id.data}/edit`, {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  // 연결 자료는 바꾸지 않는다. 기록이 어디에 달렸는지는 만들 때 정한다.
  const { data, error } = await supabase
    .from("captures")
    .update({
      capture_type: input.captureType,
      content: input.content,
      original_text: input.originalText,
      translated_text: input.translatedText,
      translation_language: input.translationLanguage,
    })
    .eq("id", id.data)
    .is("deleted_at", null)
    .select("id, source_id");

  if (error) {
    console.error("[ThreadMark] 기록 수정 실패:", error.message);
    redirectWithQuery(`/captures/${id.data}/edit`, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  const updated = data?.[0];

  if (!updated) {
    redirectWithQuery("/inbox", { error: "기록을 찾을 수 없습니다." });
  }

  const destination = originFor(updated.source_id);

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "기록을 수정했습니다." });
}

/**
 * 기록에 별을 달거나 뗀다. (설계 문서 6.2-1절)
 *
 * 자료 쪽(toggleSourceStar)과 같은 규칙이다. 성공하면 아무 말도 하지 않고
 * 화면도 옮기지 않는다. 별이 켜졌는지는 별 모양이 바로 보여준다.
 *
 * 되돌릴 곳을 함께 갱신한다. 같은 기록이 자료 상세와 읽기 화면 양쪽에
 * 보이는데, 한 곳에서 별을 달고 다른 곳으로 가면 옛 모습이 남아 있으면 안 된다.
 */
export async function toggleCaptureStar(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));
  const destination = sanitizeNextPath(formValue(formData.get("returnTo")));
  const starred = readStarredInput(formValue(formData.get("starred")));

  if (!id.success || starred === null) {
    redirectWithQuery(destination, { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("captures")
    .update({ starred })
    .eq("id", id.data)
    .is("deleted_at", null)
    .select("source_id");

  if (error) {
    console.error("[ThreadMark] 기록 별 표시 실패:", error.message);
    redirectWithQuery(destination, {
      error: "중요 표시를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  // revalidatePath는 조회 문자열을 보지 않는다. 경로만 넘긴다.
  revalidatePath(destination.split(/[?#]/, 1)[0] || "/");

  const sourceId = data?.[0]?.source_id;

  if (sourceId) {
    revalidatePath(`/sources/${sourceId}`);
    revalidatePath(`/sources/${sourceId}/reader`);
  } else {
    revalidatePath("/inbox");
  }
}

/**
 * 삭제 표시를 남긴다.
 *
 * sources와 같은 이유로 표 갱신이 아니라 전용 함수를 호출한다.
 * 조회 정책이 삭제되지 않은 행만 통과시키는데, PostgREST는 갱신을 항상
 * RETURNING으로 감싸고 PostgreSQL은 그때 조회 정책을 새 행에 다시 적용한다.
 */
export async function deleteCapture(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));
  const destination = sanitizeNextPath(formValue(formData.get("returnTo")));

  if (!id.success) {
    redirectWithQuery(destination, { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("soft_delete_capture", {
    capture_id: id.data,
  });

  if (error) {
    console.error("[ThreadMark] 기록 삭제 실패:", error.message);
    redirectWithQuery(destination, {
      error: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (data !== true) {
    redirectWithQuery(destination, { error: "기록을 찾을 수 없습니다." });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "기록을 삭제했습니다." });
}
