/**
 * 관리자가 수행할 수 있는 승인 상태 변경.
 *
 * 어떤 상태에서 어떤 상태로 갈 수 있는지를 한곳에 모은다.
 * 화면은 이 목록으로 버튼을 그리고, 서버는 같은 목록으로 요청을 검증한다.
 * 버튼이 보이지 않는다고 해서 요청이 막히는 것은 아니기 때문이다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import type { AccountStatus } from "@/lib/auth/status";

export type StatusTransition = {
  to: AccountStatus;
  label: string;
  /** 되돌리기 어렵거나 사용자에게 불리한 처리인지. 화면에서 구분해 표시한다. */
  destructive: boolean;
  /** 사유를 함께 기록하는 것이 바람직한 처리인지. */
  reasonRecommended: boolean;
};

/**
 * 현재 상태별로 허용하는 변경.
 *
 * active에서 pending으로 되돌리는 경로는 두지 않는다.
 * 승인을 취소하려면 정지나 거절이라는 분명한 상태로 표현해야
 * 감사 기록에서 의도가 드러난다.
 */
export const STATUS_TRANSITIONS: Record<AccountStatus, StatusTransition[]> = {
  pending: [
    { to: "active", label: "승인", destructive: false, reasonRecommended: false },
    { to: "rejected", label: "거절", destructive: true, reasonRecommended: true },
  ],
  active: [
    {
      to: "suspended",
      label: "이용 정지",
      destructive: true,
      reasonRecommended: true,
    },
  ],
  rejected: [
    {
      to: "active",
      label: "승인으로 변경",
      destructive: false,
      reasonRecommended: true,
    },
  ],
  suspended: [
    { to: "active", label: "정지 해제", destructive: false, reasonRecommended: true },
  ],
};

/** 지정한 상태에서 수행할 수 있는 처리 목록. */
export function getAvailableTransitions(
  from: AccountStatus,
): readonly StatusTransition[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

/**
 * 요청한 상태 변경이 허용되는지 판정한다.
 *
 * 서버가 요청을 받아들이기 전에 반드시 통과해야 하는 검사다.
 * 목록에 없는 조합은 거부한다. (fail closed)
 */
export function isAllowedTransition(
  from: AccountStatus,
  to: AccountStatus,
): boolean {
  return getAvailableTransitions(from).some(
    (transition) => transition.to === to,
  );
}
