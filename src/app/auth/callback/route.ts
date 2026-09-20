import { NextResponse, type NextRequest } from "next/server";

import { originFromHeaders, sanitizeNextPath } from "@/lib/auth/request-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 콜백.
 *
 * Supabase가 인증을 마치면 이 주소로 authorization code를 붙여 돌려보낸다.
 * 그 code를 세션으로 교환하고 인증 쿠키를 응답에 기록한다.
 *
 * 이 단계에서는 승인 상태를 확인하지 않는다.
 * pending, rejected, suspended 사용자의 접근 차단은 4단계에서 서버와 RLS로 처리한다.
 * 로그인 자체는 누구나 할 수 있고, 할 수 있는 일이 승인 상태에 따라 달라진다.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);

  // 배포 환경에서는 프록시 뒤에 있으므로 요청 헤더의 출처를 우선한다.
  const origin = originFromHeaders(request.headers) ?? requestUrl.origin;

  // 사용자가 조작할 수 있는 값이므로 그대로 쓰지 않는다.
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));

  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    // 공급자가 보낸 설명 문구를 사용자 화면에 그대로 띄우지 않는다.
    console.error("[ThreadMark] OAuth 공급자 오류:", providerError);

    return redirectTo(new URL("/login?error=oauth_denied", origin));
  }

  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectTo(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[ThreadMark] 세션 교환 실패:", error.message);

    return redirectTo(new URL("/login?error=exchange_failed", origin));
  }

  return redirectTo(new URL(next, origin));
}

/**
 * 인증 쿠키가 실린 응답이 CDN이나 프록시에 캐시되지 않게 한다.
 * 캐시되면 다른 사용자에게 남의 세션 쿠키가 전달될 수 있다.
 */
function redirectTo(url: URL): NextResponse {
  const response = NextResponse.redirect(url);

  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
