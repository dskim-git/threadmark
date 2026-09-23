"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { formValue } from "@/lib/sources/schema";
import { SOURCE_RELATION_TYPES } from "@/lib/sources/relation-types";
import { createClient } from "@/lib/supabase/server";

/**
 * 자료끼리의 관계 잇기와 끊기. (설계 문서 8.4절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. source_relations_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·**양쪽** 참조 확인 트리거
 *
 * 양쪽 확인을 여기서 흉내 내지 않는다. 두 벌이 되면 한쪽만 고쳐졌을 때
 * 어느 쪽이 맞는지 알 수 없다. 여기서는 요청 값의 형태만 본다.
 * 프로젝트 연결(11단계)과 같은 생각이다.
 *
 * 고치는 길은 두지 않는다. 관계를 잘못 골랐다면 끊고 다시 잇는다.
 * 데이터베이스도 UPDATE 권한을 주지 않는다.
 */

/**
 * 조회 문자열을 붙여 이동한다.
 *
 * Server Action의 리디렉션 주소는 HTTP 헤더로 전달되고, 헤더 값에는 ASCII만
 * 들어갈 수 있다. 한글 메시지를 주소에 그대로 넣으면 응답 자체가 깨진다.
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

const linkSchema = z.object({
  fromSourceId: z.uuid(),
  toSourceId: z.uuid(),
  relationType: z.enum(SOURCE_RELATION_TYPES),
  returnTo: z.string(),
});

export async function linkSourceRelation(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = linkSchema.safeParse({
    fromSourceId: formValue(formData.get("fromSourceId")),
    toSourceId: formValue(formData.get("toSourceId")),
    relationType: formValue(formData.get("relationType")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const { fromSourceId, toSourceId, relationType } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);

  /*
    자기 자신과 잇는 것은 데이터베이스도 막지만 여기서 먼저 걸러 말로
    알려준다. 제약조건에 걸리면 사용자에게는 "잇지 못했습니다"만 남는데,
    왜 안 되는지는 그 문구로 알 수 없다.
  */
  if (fromSourceId === toSourceId) {
    redirectWithQuery(destination, {
      error: "같은 자료끼리는 이을 수 없습니다.",
    });
  }

  const supabase = await createClient();

  // owner_id는 보내지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
  const { error } = await supabase.from("source_relations").insert({
    from_source_id: fromSourceId,
    to_source_id: toSourceId,
    relation_type: relationType,
  });

  if (error) {
    // 이미 이어둔 경우와 권한이 없는 경우를 구분해 알려준다.
    const message =
      error.code === "23505"
        ? "이미 같은 관계로 이어둔 자료입니다."
        : "잇지 못했습니다. 둘 다 내 자료인지 확인해 주세요.";

    console.error("[ThreadMark] 자료 관계 저장 실패:", error.message);
    redirectWithQuery(destination, { error: message });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "자료를 이었습니다." });
}

const unlinkSchema = z.object({
  relationId: z.uuid(),
  returnTo: z.string(),
});

export async function unlinkSourceRelation(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = unlinkSchema.safeParse({
    relationId: formValue(formData.get("relationId")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const { relationId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  /*
    관계의 id로 지운다. 화면은 나간 관계와 들어온 관계를 함께 보여주는데,
    짝으로 지우면 어느 방향인지를 폼마다 다시 실어 보내야 한다.
    소유자 조건은 RLS의 source_relations_delete_own 정책이 건다.
  */
  const { error } = await supabase
    .from("source_relations")
    .delete()
    .eq("id", relationId);

  if (error) {
    console.error("[ThreadMark] 자료 관계 삭제 실패:", error.message);
    redirectWithQuery(destination, { error: "관계를 끊지 못했습니다." });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "관계를 끊었습니다." });
}
