import { redirect } from "next/navigation";

import { getVerifiedClaims } from "@/lib/supabase/claims";
import { createClient } from "@/lib/supabase/server";

import { canAccessProtectedArea, isAccountStatus } from "./status";
import type { AccountStatus } from "./status";

/**
 * 서버에서 판단한 현재 사용자.
 *
 * 화면이 무엇을 보여줄지가 아니라, 서버가 무엇을 허용할지를 정하는 근거다.
 * 클라이언트가 보낸 값은 어떤 것도 신뢰하지 않는다.
 */
export type Account = {
  userId: string;
  email: string | null;
  displayName: string | null;
  /** 프로필 행이 없거나 값이 예상 밖이면 null이다. 이 경우 접근을 허용하지 않는다. */
  status: AccountStatus | null;
};

/**
 * 로그인한 사용자와 승인 상태를 가져온다. 비로그인이면 null을 반환한다.
 *
 * 세션 데이터가 아니라 서명을 검증한 클레임에서 사용자 ID를 얻고,
 * 승인 상태는 그 ID로 데이터베이스에서 다시 읽는다.
 * JWT에 담긴 값으로 권한을 판단하지 않는 이유는, 관리자가 상태를 바꿔도
 * 이미 발급된 토큰에는 반영되지 않기 때문이다.
 */
export async function getAccount(): Promise<Account | null> {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);

  if (!claims) {
    return null;
  }

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;

  // RLS의 profiles_select_own 정책이 본인 행만 돌려준다.
  const { data, error } = await supabase
    .from("profiles")
    .select("email, display_name, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // 조회 실패를 승인으로 해석하지 않는다.
    console.error("[ThreadMark] 프로필 조회 실패:", error.message);

    return { userId, email, displayName: null, status: null };
  }

  return {
    userId,
    email: data?.email ?? email,
    displayName: data?.display_name ?? null,
    status: isAccountStatus(data?.status) ? data.status : null,
  };
}

/**
 * 로그인을 요구한다. 비로그인이면 로그인 화면으로 보낸다.
 *
 * @param returnTo 로그인 후 돌아올 경로
 */
export async function requireAccount(returnTo?: string): Promise<Account> {
  const account = await getAccount();

  if (!account) {
    redirect(loginPathFor(returnTo));
  }

  return account;
}

/**
 * 승인 완료된 사용자를 요구한다.
 *
 * 보호된 데이터를 읽거나 쓰는 모든 페이지, Server Action, Route Handler에서
 * 직접 호출해야 한다. 레이아웃에서 한 번 호출한 것으로 대신하지 않는다.
 * Next.js의 레이아웃은 경로 이동 때마다 다시 실행된다는 보장이 없기 때문이다.
 *
 * 이 함수는 접근 통제의 마지막 방어선이 아니다. 마지막 방어선은 RLS다.
 */
export async function requireActiveAccount(returnTo?: string): Promise<Account> {
  const account = await requireAccount(returnTo);

  if (!canAccessProtectedArea(account.status)) {
    redirect("/pending");
  }

  return account;
}

function loginPathFor(returnTo?: string): string {
  if (!returnTo) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(returnTo)}`;
}
