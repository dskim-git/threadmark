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
