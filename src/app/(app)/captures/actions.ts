"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  captureInputSchema,
  firstIssueMessage,
  formValue,
} from "@/lib/captures/schema";
import { sanitizeNextPath } from "@/lib/auth/request-url";
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
