/**
 * 운영 설정 읽기와 쓰기.
 *
 * app_settings는 RLS로 관리자만 조회·변경할 수 있다.
 * 이 모듈을 호출하기 전에 호출자가 관리자인지 먼저 확인해야 한다.
 * RLS가 마지막 방어선이지만, 서버 코드가 먼저 막는 것이 원칙이다.
 */

import { createClient } from "@/lib/supabase/server";

/*
  열쇠와 범위는 잎사귀에 있다. **검사가 읽어야 하는 값들**인데 이 파일은
  Supabase 클라이언트를 물고 있어 `node --test`가 읽지 못한다. 여기서 다시
  내보내므로 부르는 쪽은 그대로다. (AGENTS.md 2절)
*/
export {
  AI_BUDGET_MAX_USD,
  AI_BUDGET_MIN_USD,
  AI_MONTHLY_BUDGET_KEY,
  REQUIRE_USER_APPROVAL_KEY,
} from "./settings-keys";

import {
  AI_MONTHLY_BUDGET_KEY as BUDGET_KEY,
  REQUIRE_USER_APPROVAL_KEY as APPROVAL_KEY,
} from "./settings-keys";

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
    .eq("key", APPROVAL_KEY)
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

export type AiBudgetSetting = {
  /** 지금 적혀 있는 값(USD). 읽지 못했으면 null이다. */
  budgetUsd: number | null;
  updatedAt: string | null;
};

/**
 * 한 달 AI 예산을 읽는다.
 *
 * **읽지 못하면 null이다. 0이 아니다.** 0을 돌려주면 "예산이 0"과 "못
 * 읽었다"가 같아진다. 앞엣것은 관리자가 정한 것이고 뒤엣것은 고장이다.
 *
 * 관리자만 부른다. `app_settings_select_admin` 정책이 그 밖을 막는다.
 */
export async function getAiBudgetSetting(): Promise<AiBudgetSetting> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", BUDGET_KEY)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] AI 예산 설정 조회 실패:", error.message);

    return { budgetUsd: null, updatedAt: null };
  }

  if (!data || typeof data.value !== "number") {
    return { budgetUsd: null, updatedAt: null };
  }

  return { budgetUsd: data.value, updatedAt: data.updated_at };
}
