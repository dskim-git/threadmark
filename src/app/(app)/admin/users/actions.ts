"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAllowedTransition } from "@/lib/admin/transitions";
import { requireAdminAccount } from "@/lib/auth/account";
import { ACCOUNT_STATUSES } from "@/lib/auth/status";
import { createClient } from "@/lib/supabase/server";

/**
 * 폼에서 오는 값은 전부 사용자가 조작할 수 있다.
 * 화면에 버튼이 없다고 해서 요청이 오지 않는 것은 아니므로 서버에서 다시 검증한다.
 */
const updateStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(ACCOUNT_STATUSES),
  reason: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .catch(null),
});

/**
 * 사용자의 승인 상태를 변경한다.
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireAdminAccount
 *   2. profiles_update_admin 정책 (RLS)
 *   3. guard_profile_protected_columns 트리거
 *
 * 감사 기록은 이 함수가 남기지 않는다. 트리거가 남긴다.
 * 애플리케이션이 기록을 맡으면 호출을 빠뜨렸을 때 드러나지 않기 때문이다.
 */
export async function updateUserStatus(formData: FormData): Promise<void> {
  const admin = await requireAdminAccount("/admin/users");

  const parsed = updateStatusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/admin/users?error=invalid_request");
  }

  const { userId, status, reason } = parsed.data;

  // 관리자가 스스로를 정지시켜 잠기는 상황을 막는다.
  // 자기 계정을 정리해야 한다면 다른 관리자나 서비스 컨텍스트에서 처리한다.
  if (userId === admin.userId) {
    redirect("/admin/users?error=self_change_blocked");
  }

  const supabase = await createClient();

  // 현재 상태를 서버에서 다시 읽는다. 화면이 오래되었을 수 있고,
  // 요청에 담긴 "어디서 어디로"를 그대로 믿어서는 안 된다.
  const { data: target, error: readError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[ThreadMark] 대상 사용자 조회 실패:", readError.message);
    redirect("/admin/users?error=update_failed");
  }

  if (!target) {
    redirect("/admin/users?error=user_not_found");
  }

  if (target.status === status) {
    // 이미 같은 상태다. 감사 로그에 의미 없는 기록을 남기지 않는다.
    redirect("/admin/users?notice=unchanged");
  }

  if (!isAllowedTransition(target.status, status)) {
    redirect("/admin/users?error=transition_not_allowed");
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ status, status_reason: reason })
    .eq("id", userId);

  if (updateError) {
    console.error("[ThreadMark] 승인 상태 변경 실패:", updateError.message);
    redirect("/admin/users?error=update_failed");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?notice=updated");
}

/**
 * 허용량은 **더하는 것**이지 리셋이 아니다. (설계 문서 19-E.1절)
 *
 * 요청은 "사용량 리셋"이었지만 그대로 만들지 않았다. `ai_usage_events`는
 * 고칠 수도 지울 수도 없는 장부이고(003의 검사 120·121), 리셋을 만들면
 * **그 보장을 우리 손으로 뚫는 일**이 된다.
 *
 * 관리자가 보는 결과는 같다. 단추를 누르면 그 사람이 다시 쓴다. 다만
 * 누가 얼마 썼고 누가 언제 왜 풀어줬는지가 둘 다 남는다.
 *
 * 음수를 받는다. 잘못 줬을 때 줄을 지우는 대신 되돌린 기록을 한 줄 더
 * 남기는 길이다. 0은 받지 않는다. 아무것도 바꾸지 않는 줄이라 뜻이 없다.
 *
 * 사유를 비울 수 없다. 승인 상태 변경과 다른 점이다. 까닭 없이 풀어준
 * 기록은 나중에 읽을 수 없고, **그 답을 만들려고 이 표가 있다.**
 */
const grantSchema = z.object({
  userId: z.uuid(),
  extraCalls: z.coerce
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(500),
});

/**
 * 한 사람의 이번 달 AI 허용량을 더한다. (19-E)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireAdminAccount
 *   2. ai_usage_grants_insert_admin 정책 (RLS)
 *   3. set_ai_usage_grant_actor 트리거
 *
 * **누가 줬는지와 언제 줬는지는 보내지 않는다.** 트리거가 정한다. 보낸
 * 값을 믿으면 남의 이름으로 풀어준 기록을 남기거나 지난달 줄을 만들어
 * 한도를 비켜 갈 수 있다. (003의 검사 127)
 *
 * 감사 기록도 이 함수가 남기지 않는다. 트리거가 남긴다. 애플리케이션이
 * 기록을 맡으면 호출을 빠뜨렸을 때 드러나지 않는다.
 *
 * 자기 자신에게도 줄 수 있다. 승인 상태와 다른 점이다. 승인 상태를 막는
 * 까닭은 **혼자뿐인 관리자가 스스로 잠기는 것**을 막기 위해서인데, 허용량은
 * 반대로 한도에 걸린 관리자가 스스로 풀 길이 없으면 곤란해진다. 누가
 * 누구에게 줬는지는 어느 쪽이든 장부와 감사 기록에 남는다.
 */
export async function grantAiUsage(formData: FormData): Promise<void> {
  await requireAdminAccount("/admin/users");

  const parsed = grantSchema.safeParse({
    userId: formData.get("userId"),
    extraCalls: formData.get("extraCalls"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/admin/users?error=grant_invalid");
  }

  const { userId, extraCalls, reason } = parsed.data;

  const supabase = await createClient();

  // 없는 사람에게 주려 한 것과 데이터베이스가 거절한 것을 갈라서 말한다.
  // 외래 키가 어차피 막지만, 그때 나오는 말로는 무엇이 잘못됐는지 모른다.
  const { data: target, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[ThreadMark] 대상 사용자 조회 실패:", readError.message);
    redirect("/admin/users?error=grant_failed");
  }

  if (!target) {
    redirect("/admin/users?error=user_not_found");
  }

  const { error: insertError } = await supabase.from("ai_usage_grants").insert({
    owner_id: userId,
    extra_calls: extraCalls,
    reason,
  });

  if (insertError) {
    console.error("[ThreadMark] AI 허용량 더하기 실패:", insertError.message);
    redirect("/admin/users?error=grant_failed");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?notice=granted");
}
