/**
 * 가입 승인 상태 판정.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 * 실제 강제는 서버 코드와 RLS가 하며, 이 모듈은 그 판단 기준을 한곳에 모아둔다.
 */

import type { Database } from "@/lib/supabase/database.types";

/** 데이터베이스의 user_status 열거형과 같은 값을 쓴다. */
export const ACCOUNT_STATUSES = [
  "pending",
  "active",
  "rejected",
  "suspended",
] as const satisfies readonly Database["public"]["Enums"]["user_status"][];

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * 알 수 없는 값을 승인 상태로 받아들이지 않는다.
 *
 * 마이그레이션과 생성된 타입이 어긋나면 컴파일 타임에는 드러나지 않는다.
 * 권한을 좌우하는 값이므로 실행 시점에 한 번 더 확인한다.
 */
export function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === "string" &&
    (ACCOUNT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * 보호된 앱 영역에 들어갈 수 있는지 판정한다.
 *
 * active 하나만 통과시킨다. 상태를 모르거나 프로필이 없으면 거부한다.
 * 새 상태가 추가되어도 명시적으로 허용하기 전에는 막히도록 한 설계다. (fail closed)
 */
export function canAccessProtectedArea(status: unknown): boolean {
  return status === "active";
}

/** 승인 대기 화면에서 상태별로 보여줄 내용. */
export type StatusNotice = {
  title: string;
  description: string;
  /** 운영자 문의가 필요한 상태인지 여부. */
  needsContact: boolean;
};

const STATUS_NOTICES: Record<AccountStatus, StatusNotice> = {
  pending: {
    title: "승인을 기다리는 중입니다",
    description:
      "가입 신청이 접수되었습니다. 운영자가 승인하면 자료 저장 기능을 사용할 수 있습니다.",
    needsContact: false,
  },
  active: {
    title: "승인이 완료되었습니다",
    description: "이제 ThreadMark의 모든 기능을 사용할 수 있습니다.",
    needsContact: false,
  },
  rejected: {
    title: "가입이 승인되지 않았습니다",
    description:
      "이 계정으로는 ThreadMark를 이용할 수 없습니다. 확인이 필요하면 운영자에게 문의해 주세요.",
    needsContact: true,
  },
  suspended: {
    title: "계정 이용이 정지되었습니다",
    description:
      "현재 이 계정의 이용이 중지된 상태입니다. 사유 확인과 해제 요청은 운영자에게 문의해 주세요.",
    needsContact: true,
  },
};

/** 프로필 행이 아직 없을 때 보여줄 내용. */
const UNKNOWN_NOTICE: StatusNotice = {
  title: "계정 정보를 준비하고 있습니다",
  description:
    "계정 설정이 아직 끝나지 않았습니다. 잠시 후 새로고침해도 같은 화면이 보이면 운영자에게 문의해 주세요.",
  needsContact: true,
};

export function getStatusNotice(status: unknown): StatusNotice {
  return isAccountStatus(status) ? STATUS_NOTICES[status] : UNKNOWN_NOTICE;
}
