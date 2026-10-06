"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  AI_BUDGET_MAX_USD,
  AI_BUDGET_MIN_USD,
  AI_MONTHLY_BUDGET_KEY,
  REQUIRE_USER_APPROVAL_KEY,
} from "@/lib/admin/settings";
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

/**
 * 한 달 AI 예산을 받는 모양.
 *
 * **글자로 받아 숫자로 바꾼다.** `z.coerce.number()`는 빈 글자를 0으로
 * 바꾸는데, 그러면 **아무것도 안 적은 것과 0을 적은 것이 같아진다.**
 * 앞엣것은 실수이고 뒤엣것은 막겠다는 뜻이다.
 *
 * 범위는 `settings.ts`가 들고 있고 데이터베이스 제약과 같은 값이다.
 * 양쪽이 어긋나면 화면은 받아 놓고 데이터베이스가 거부한다.
 */
const updateAiBudgetSchema = z.object({
  budgetUsd: z
    .string()
    .trim()
    .min(1)
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value))
    .refine(
      (value) => value >= AI_BUDGET_MIN_USD && value <= AI_BUDGET_MAX_USD,
    ),
});

/**
 * 한 달 AI 예산을 바꾼다. (19-F)
 *
 * **이 값 하나가 모두의 몫을 정한다.** 한 사람 몫은 이 값을 AI 허용받은
 * 사람 수로 나눈 것이다. 올리면 모두가 더 쓸 수 있고 내리면 모두가 줄어든다.
 *
 * **Anthropic Console의 예산과 같은 값으로 둔다.** 두 곳을 함께 고쳐야
 * 하는데 한쪽만 고치면 조용히 어긋난다. 앱 쪽이 더 크면 **앱의 한도가
 * 아무것도 막지 못하고**, 어느 날 갑자기 기능이 통째로 안 되는 것으로
 * 나타난다. 화면에 그 말을 적어 두었다.
 *
 * 변경 기록은 이 함수가 남기지 않는다. `audit_app_setting_update` 트리거가
 * 남긴다. 애플리케이션이 기록을 맡으면 호출을 빠뜨렸을 때 드러나지 않는다.
 */
export async function updateAiBudget(formData: FormData): Promise<void> {
  await requireAdminAccount("/admin/settings");

  const parsed = updateAiBudgetSchema.safeParse({
    budgetUsd: formData.get("budgetUsd") ?? "",
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=budget_invalid");
  }

  const supabase = await createClient();

  /*
    `app_settings_update_admin` 정책과 값 모양 제약이 서버 확인이 뚫렸을
    때의 마지막 방어선이다. 제약이 `0 < 값 <= 100`을 본다.
  */
  const { error } = await supabase
    .from("app_settings")
    .update({ value: parsed.data.budgetUsd })
    .eq("key", AI_MONTHLY_BUDGET_KEY);

  if (error) {
    console.error("[ThreadMark] AI 예산 변경 실패:", error.message);
    redirect("/admin/settings?error=budget_failed");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");
  redirect("/admin/settings?notice=budget_updated");
}
