/**
 * 운영 설정 읽기와 쓰기.
 *
 * app_settings는 RLS로 관리자만 조회·변경할 수 있다.
 * 이 모듈을 호출하기 전에 호출자가 관리자인지 먼저 확인해야 한다.
 * RLS가 마지막 방어선이지만, 서버 코드가 먼저 막는 것이 원칙이다.
 */

import { createClient } from "@/lib/supabase/server";

/**
 * 신규 가입자를 승인 대기 상태로 둘지 결정하는 설정 키.
 *
 * 값을 실제로 사용하는 곳은 애플리케이션이 아니라 데이터베이스의
 * handle_new_user 트리거다. 화면은 그 값을 보여주고 바꿀 뿐이다.
 */
export const REQUIRE_USER_APPROVAL_KEY = "require_user_approval";

export type ApprovalSetting = {
  requireApproval: boolean;
  updatedAt: string | null;
  /** 설정 행을 읽지 못했는지 여부. 이 경우 화면에서 상태를 단정하지 않는다. */
  unavailable: boolean;
};

/**
 * 신규 가입 승인 필요 설정을 읽는다.
 *
 * 읽지 못하면 "승인 필요"로 간주한다. 데이터베이스 트리거도 같은 규칙으로
 * 동작하므로(coalesce(..., true)) 화면과 실제 동작이 어긋나지 않는다.
 */
export async function getApprovalSetting(): Promise<ApprovalSetting> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", REQUIRE_USER_APPROVAL_KEY)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 운영 설정 조회 실패:", error.message);

    return { requireApproval: true, updatedAt: null, unavailable: true };
  }

  if (!data || typeof data.value !== "boolean") {
    return { requireApproval: true, updatedAt: null, unavailable: true };
  }

  return {
    requireApproval: data.value,
    updatedAt: data.updated_at,
    unavailable: false,
  };
}
