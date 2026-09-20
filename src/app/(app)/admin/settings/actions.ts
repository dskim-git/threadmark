"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { REQUIRE_USER_APPROVAL_KEY } from "@/lib/admin/settings";
import { requireAdminAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 체크박스는 켜져 있을 때만 값을 보낸다. 없으면 꺼진 것으로 본다.
 * 그래서 문자열 하나를 불리언으로 바꾸는 대신, 존재 여부를 명시적으로 읽는다.
 */
const updateApprovalSchema = z.object({
  requireApproval: z.enum(["on", "off"]),
});

/**
 * 신규 가입 승인 필요 설정을 변경한다.
 *
 * 이 설정은 앞으로 가입하는 사람에게만 적용된다.
 * 이미 승인 대기 중인 계정은 이 값을 꺼도 자동으로 승인되지 않는다.
 * handle_new_user 트리거가 가입 시점에 한 번만 실행되기 때문이며,
 * 개인정보 처리방침 1절이 약속한 동작이기도 하다.
 *
 * 변경 기록은 이 함수가 남기지 않는다. app_settings_audit_update 트리거가 남긴다.
 */
export async function updateApprovalSetting(formData: FormData): Promise<void> {
  await requireAdminAccount("/admin/settings");

  const parsed = updateApprovalSchema.safeParse({
    requireApproval: formData.get("requireApproval") ?? "off",
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=invalid_request");
  }

  const requireApproval = parsed.data.requireApproval === "on";

  const supabase = await createClient();

  // app_settings_update_admin 정책과 guard_app_setting_update 트리거가
  // 서버 확인이 뚫렸을 때의 마지막 방어선이다.
  const { error } = await supabase
    .from("app_settings")
    .update({ value: requireApproval })
    .eq("key", REQUIRE_USER_APPROVAL_KEY);

  if (error) {
    console.error("[ThreadMark] 운영 설정 변경 실패:", error.message);
    redirect("/admin/settings?error=update_failed");
  }

  revalidatePath("/admin/settings");
  redirect(
    `/admin/settings?notice=${requireApproval ? "approval_on" : "approval_off"}`,
  );
}
