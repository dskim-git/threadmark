"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  NEXT_PATH_COOKIE,
  NEXT_PATH_COOKIE_MAX_AGE_SECONDS,
  originFromHeaders,
  sanitizeNextPath,
} from "@/lib/auth/request-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Google 로그인을 시작한다.
 *
 * 브라우저가 아니라 서버에서 인증 URL을 만든다. PKCE code verifier가
 * 서버가 관리하는 쿠키에 저장되고, 자바스크립트 없이도 로그인이 시작된다.
 *
 * 이 단계에서는 로그인에 필요한 기본 권한만 요청한다.
 * Google Drive 권한은 설계 문서 4.1절에 따라 별도의 동의 과정으로 분리하며,
 * 여기서 scope나 offline 접근을 미리 요구하지 않는다.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = sanitizeNextPath(formData.get("next"));
  const origin = originFromHeaders(await headers());

  if (!origin) {
    redirect("/login?error=unknown_origin");
  }

  // 돌아갈 경로는 쿠키로 전달한다. 공급자에게 넘기는 주소는 항상 같아야
  // Supabase의 Redirect URL 허용 목록과 정확히 일치시킬 수 있다.
  const cookieStore = await cookies();

  cookieStore.set(NEXT_PATH_COOKIE, next, {
    httpOnly: true,
    // 인증 공급자에서 돌아오는 요청은 다른 사이트에서 출발한 최상위 이동이다.
    // strict로 두면 그 요청에 쿠키가 실리지 않는다.
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: NEXT_PATH_COOKIE_MAX_AGE_SECONDS,
  });

  const supabase = await createClient();

  const redirectTo = `${origin}/auth/callback`;

  // Supabase는 redirect_to가 Redirect URLs 허용 목록에 없으면 오류를 내지 않고
  // 조용히 Site URL로 돌려보낸다. 개발 중에는 포트가 바뀌는 일이 흔한데,
  // 그때마다 원인을 찾느라 헤매지 않도록 등록해야 할 주소를 그대로 알려준다.
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[ThreadMark] Supabase Redirect URLs에 이 주소가 등록되어 있어야 합니다: ${redirectTo}`,
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error || !data.url) {
    // 인증 URL에는 PKCE 값이 들어 있으므로 기록하지 않는다.
    console.error(
      "[ThreadMark] Google 로그인 시작 실패:",
      error?.message ?? "인증 URL이 반환되지 않았습니다.",
    );
    redirect("/login?error=oauth_start_failed");
  }

  redirect(data.url);
}
