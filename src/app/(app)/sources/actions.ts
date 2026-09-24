"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import {
  firstIssueMessage,
  formValue,
  sourceInputSchema,
} from "@/lib/sources/schema";
import { readStarredInput } from "@/lib/stars";
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

export type CreateSourceResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

/**
 * 자료를 만들고 그 id를 돌려준다.
 *
 * 다른 동작처럼 redirect로 끝내지 않는 이유가 있다.
 * 자료 등록 화면은 파일을 함께 올릴 수 있는데, 파일을 붙이려면 방금 만든
 * 자료의 id가 필요하다. 화면을 먼저 옮겨버리면 브라우저가 들고 있던 파일이
 * 사라져서 붙일 수 없다. 그래서 id를 돌려주고, 화면 이동은 부르는 쪽이 정한다.
 */
export async function createSourceReturningId(
  formData: FormData,
): Promise<CreateSourceResult> {
  await requireActiveAccount("/sources/new");

  const parsed = readInput(formData);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
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

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath("/library");

  return { ok: true, id: data.id };
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
 * 자료에 별을 달거나 뗀다. (설계 문서 5.2-1절)
 *
 * **성공하면 아무 말도 하지 않는다.** 별은 눌렀는지가 별 모양으로 바로
 * 보이는 일이라, "별을 달았습니다" 같은 알림이 뜨면 목록을 훑으며 여러 개에
 * 달 때마다 알림 줄이 나타났다 사라져 화면이 들썩인다. 실패했을 때만 알린다.
 *
 * 돌아갈 곳으로 옮기지도 않는다. 그 자리에 그대로 두어야 방금 별을 단 줄이
 * 눈앞에 남는다. 화면 갱신은 revalidatePath가 맡는다.
 *
 * 소유자와 승인 상태는 sources_update_own 정책이 건다. 별을 다는 갱신은
 * 결과가 조회 정책을 벗어나지 않으므로 보통의 갱신으로 할 수 있다.
 * 손댄 시각은 데이터베이스 가드가 그대로 둔다. (20260924120000)
 */
export async function toggleSourceStar(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));
  const destination = sanitizeNextPath(formValue(formData.get("returnTo")));
  const starred = readStarredInput(formValue(formData.get("starred")));

  if (!id.success || starred === null) {
    redirectWithQuery(destination, { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("sources")
    .update({ starred })
    .eq("id", id.data)
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] 자료 별 표시 실패:", error.message);
    redirectWithQuery(destination, {
      error: "중요 표시를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  // revalidatePath는 조회 문자열을 보지 않는다. 경로만 넘긴다.
  revalidatePath(pathOnly(destination));
  revalidatePath("/library");
  revalidatePath(`/sources/${id.data}`);
}

/** 조회 문자열과 조각을 떼어낸 경로. revalidatePath에 넘길 값이다. */
function pathOnly(value: string): string {
  return value.split(/[?#]/, 1)[0] || "/";
}

/**
 * 읽을 후보를 정식 자료로 바꾼다. (설계 문서 8.4절)
 *
 * 후보는 따로 담는 표가 아니라 상태 하나라서, 전환은 상태를 바꾸는 일이다.
 * 옮겨 담을 것이 없으므로 이어둔 관계와 적어둔 DOI가 그대로 남는다.
 *
 * 한 방향뿐이다. 되돌리는 길은 두지 않았고 데이터베이스 가드도 막는다.
 * 잘못 담아두었다면 지운다. 후보는 제목 한 줄이라 지우는 값이 싸다.
 */
export async function promoteReadingCandidate(
  formData: FormData,
): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const destination = `/sources/${id.data}`;
  const supabase = await createClient();

  /*
    소유자와 승인 상태는 sources_update_own 정책이 건다.
    이미 정식 자료인 것을 다시 바꾸려 하면 가드 트리거가 막는다.
    삭제 표시와 달리 갱신 결과가 조회 정책을 벗어나지 않으므로,
    전용 함수 없이 보통의 갱신으로 할 수 있다.
  */
  const { error } = await supabase
    .from("sources")
    .update({ status: "active" })
    .eq("id", id.data);

  if (error) {
    console.error("[ThreadMark] 읽을 후보 전환 실패:", error.message);
    redirectWithQuery(destination, {
      error: "정식 자료로 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(destination);
  revalidatePath("/library");
  redirectWithQuery(destination, {
    notice: "정식 자료로 바꿨습니다. 논문 정보를 채워 보세요.",
  });
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
