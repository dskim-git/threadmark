import { cache } from "react";

import { redirect } from "next/navigation";

import {
  DEFAULT_APPEARANCE,
  readThemeFonts,
  readThemeMode,
  readThemePalette,
  type Appearance,
} from "@/lib/appearance/theme";
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
  /** user_roles를 기준으로 한 관리자 여부. 이메일로 판단하지 않는다. */
  isAdmin: boolean;
  /**
   * 화면 취향. (설계 문서 4.2절)
   *
   * 조회에 실패하거나 모르는 값이 들어 있으면 기본값이다. 보기에 관한 값이라
   * 여기서 막을 일이 아니다. 화면은 어떻게든 보여야 한다.
   */
  appearance: Appearance;
};

/**
 * 로그인한 사용자와 승인 상태를 가져온다. 비로그인이면 null을 반환한다.
 *
 * 세션 데이터가 아니라 서명을 검증한 클레임에서 사용자 ID를 얻고,
 * 승인 상태와 역할은 그 ID로 데이터베이스에서 다시 읽는다.
 * JWT에 담긴 값으로 권한을 판단하지 않는 이유는, 관리자가 상태나 역할을 바꿔도
 * 이미 발급된 토큰에는 반영되지 않기 때문이다.
 *
 * React의 cache로 감싸 한 요청 안에서는 한 번만 조회한다.
 * 레이아웃과 페이지가 각각 확인해도 왕복이 늘지 않는다.
 */
/**
 * 프로필을 읽는다. 화면 취향을 읽지 못해도 나머지는 읽어 온다.
 *
 * 2026-09-24에 겪은 일이다. 화면 취향 칸을 코드가 먼저 읽고 마이그레이션은
 * 아직 올리지 않은 상태에서, **앱 전체가 열리지 않았다.** 프로필 조회가
 * 실패하면 승인 상태를 알 수 없다고 보고 접근을 막기 때문이다.
 *
 * 승인 상태를 못 읽었을 때 막는 것은 옳다. (보안 원칙 7) 문제는 막힌 이유가
 * 승인과 아무 상관 없는 **장식용 칸**이었다는 것이다. 색을 못 읽었다고
 * 로그인을 막을 이유는 없다.
 *
 * 그래서 취향 칸까지 한 번에 읽어보고, 실패하면 그 칸을 빼고 다시 읽는다.
 * 두 번째까지 실패하면 그때는 진짜로 못 읽는 것이므로 막는다. 왕복이 느는
 * 것은 어긋났을 때뿐이고, 평소에는 질의 하나 그대로다.
 *
 * 이런 상황은 또 온다. Vercel은 main에 푸시하면 바로 배포하는데, 마이그레이션을
 * 먼저 올리지 않으면 모든 사용자가 같은 화면을 본다. (AGENTS.md 6절)
 */
async function readProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const full = await supabase
    .from("profiles")
    .select("email, display_name, status, theme_mode, theme_palette, theme_fonts")
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) {
    return full;
  }

  console.error(
    "[ThreadMark] 화면 취향을 읽지 못했습니다. 기본값으로 계속합니다:",
    full.error.message,
  );

  /*
    취향 칸 없이 다시 읽는다. 여기서도 실패하면 권한이나 연결의 문제이므로
    막는 것이 맞다. 즉 이 두 번째 시도는 "열어주는" 길이 아니라,
    막아야 할 이유와 막지 않아도 될 이유를 갈라내는 길이다.
  */
  return supabase
    .from("profiles")
    .select("email, display_name, status")
    .eq("id", userId)
    .maybeSingle();
}

export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);

  if (!claims) {
    return null;
  }

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;

  // RLS의 profiles_select_own 정책이 본인 행만 돌려준다.
  // 관리자 판정은 RLS 정책이 쓰는 것과 같은 함수를 호출해 기준을 하나로 유지한다.
  const [profileResult, adminResult] = await Promise.all([
    readProfile(supabase, userId),
    supabase.rpc("is_admin"),
  ]);

  if (profileResult.error) {
    // 조회 실패를 승인으로 해석하지 않는다.
    console.error(
      "[ThreadMark] 프로필 조회 실패:",
      profileResult.error.message,
    );

    return {
      userId,
      email,
      displayName: null,
      status: null,
      isAdmin: false,
      appearance: DEFAULT_APPEARANCE,
    };
  }

  if (adminResult.error) {
    console.error("[ThreadMark] 관리자 판정 실패:", adminResult.error.message);
  }

  const profile = profileResult.data;

  return {
    userId,
    email: profile?.email ?? email,
    displayName: profile?.display_name ?? null,
    status: isAccountStatus(profile?.status) ? profile.status : null,
    // 판정에 실패하면 관리자가 아닌 것으로 본다.
    isAdmin: adminResult.error ? false : adminResult.data === true,
    /*
      취향 칸이 없으면 기본값이다. 위의 두 번째 시도로 돌아온 행에는
      이 칸이 아예 없다. 모르는 값과 없는 값을 같게 본다.
    */
    appearance: {
      mode: readThemeMode(
        (profile as { theme_mode?: unknown } | null)?.theme_mode,
      ),
      palette: readThemePalette(
        (profile as { theme_palette?: unknown } | null)?.theme_palette,
      ),
      fonts: readThemeFonts(
        (profile as { theme_fonts?: unknown } | null)?.theme_fonts,
      ),
    },
  };
});

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

/**
 * 관리자를 요구한다.
 *
 * 관리자 화면의 각 페이지와 관리자 전용 Server Action에서 직접 호출한다.
 * 관리자가 아닌 사용자에게는 관리자 화면의 존재를 드러내지 않기 위해
 * 오류 대신 일반 홈으로 보낸다.
 *
 * 화면을 숨기는 것은 통제가 아니다. 실제 차단은 이 확인과
 * profiles_update_admin 정책, 그리고 가드 트리거가 함께 담당한다.
 */
export async function requireAdminAccount(returnTo?: string): Promise<Account> {
  const account = await requireActiveAccount(returnTo);

  if (!account.isAdmin) {
    redirect("/home");
  }

  return account;
}

function loginPathFor(returnTo?: string): string {
  if (!returnTo) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(returnTo)}`;
}
