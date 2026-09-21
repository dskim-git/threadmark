"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  firstIssueMessage,
  formValue,
  sourceInputSchema,
} from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Source 생성·수정·삭제.
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. sources_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·불변 컬럼 가드 트리거
 *
 * owner_id는 어디서도 보내지 않는다. 컬럼 기본값과 트리거가 auth.uid()로 채운다.
 * 설계 문서 2.3절이 요구하는 방식이다.
 */

const idSchema = z.uuid();

/**
 * 조회 문자열을 붙여 이동한다.
 *
 * Server Action의 리디렉션 주소는 HTTP 헤더로 전달되고, 헤더 값에는 ASCII만
 * 들어갈 수 있다. 한글 메시지를 주소에 그대로 넣으면 응답 자체가 깨진다.
 * 모든 값을 여기서 한 번에 인코딩해 그 실수가 되풀이되지 않게 한다.
 */
function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

function readInput(formData: FormData) {
  return sourceInputSchema.safeParse({
    type: formValue(formData.get("type")),
    title: formValue(formData.get("title")),
    subtitle: formValue(formData.get("subtitle")),
    description: formValue(formData.get("description")),
    originalUrl: formValue(formData.get("originalUrl")),
  });
}

export async function createSource(formData: FormData): Promise<void> {
  await requireActiveAccount("/sources/new");

  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery("/sources/new", {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .insert({
      // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
      type: input.type,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      original_url: input.originalUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ThreadMark] 자료 생성 실패:", error?.message);
    redirectWithQuery("/sources/new", {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath("/library");
  redirect(`/sources/${data.id}`);
}

export async function updateSource(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery(`/sources/${id.data}/edit`, {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  // 남의 자료는 정책이 걸러내므로 여기서 소유자를 따로 확인하지 않는다.
  // 대상이 없거나 내 것이 아니면 0행이 갱신된다.
  const { data, error } = await supabase
    .from("sources")
    .update({
      type: input.type,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      original_url: input.originalUrl,
    })
    .eq("id", id.data)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[ThreadMark] 자료 수정 실패:", error.message);
    redirectWithQuery(`/sources/${id.data}/edit`, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (!data || data.length === 0) {
    redirectWithQuery("/library", { error: "자료를 찾을 수 없습니다." });
  }

  revalidatePath("/library");
  revalidatePath(`/sources/${id.data}`);
  redirect(`/sources/${id.data}`);
}

/**
 * 삭제 표시를 남긴다.
 *
 * 행을 지우지 않고 deleted_at만 채운다. 실수로 지운 자료를 되살릴 수 있어야 한다.
 * 조회 정책이 삭제 표시된 행을 제외하므로 화면에서는 즉시 사라진다.
 */
export async function deleteSource(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  // 표 갱신이 아니라 전용 함수를 호출한다.
  //
  // 조회 정책은 deleted_at이 비어 있는 행만 통과시킨다. 그런데 PostgREST는
  // 영향받은 행 수를 세기 위해 갱신을 항상 RETURNING으로 감싸고, PostgreSQL은
  // RETURNING이 있는 UPDATE에 조회 정책을 갱신된 새 행에도 적용한다.
  // 그래서 deleted_at을 채우는 갱신은 PostgREST를 통해서는 언제나 실패한다.
  //
  // 정책을 느슨하게 하면 삭제된 자료를 걸러내는 책임이 질의로 옮겨간다.
  // 질의를 하나라도 빠뜨리면 조용히 새어나가므로, 정책은 그대로 두고
  // 소유자와 승인 상태를 직접 확인하는 함수로 처리한다.
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("soft_delete_source", {
    source_id: id.data,
  });

  if (error) {
    console.error("[ThreadMark] 자료 삭제 실패:", error.message);
    redirectWithQuery(`/sources/${id.data}`, {
      error: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  // 대상이 없거나 내 자료가 아니면 함수가 false를 돌려준다.
  if (data !== true) {
    redirectWithQuery("/library", { error: "자료를 찾을 수 없습니다." });
  }

  revalidatePath("/library");
  redirectWithQuery("/library", { notice: "자료를 삭제했습니다." });
}
