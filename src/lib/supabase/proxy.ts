import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getVerifiedClaims } from "./claims";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/**
 * 로그인 세션 쿠키를 갱신한다.
 *
 * Server Component는 쿠키를 쓸 수 없으므로, 토큰 갱신 결과를 응답에 기록하는 일은
 * proxy가 담당한다. 갱신된 쿠키는 요청(다음 렌더링용)과 응답(브라우저용) 양쪽에 쓴다.
 *
 * 이번 단계에서는 리디렉션이나 접근 차단을 하지 않고 세션 갱신만 수행한다.
 * 승인 상태와 역할에 따른 접근 통제는 이후 단계에서 서버와 RLS로 강제한다.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const { url, publishableKey } = getPublicSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // 응답이 만들어지기 전에 호출해야 갱신된 토큰이 쿠키에 반영된다.
  await getVerifiedClaims(supabase);

  // 인증 쿠키가 실린 응답이 CDN에 캐시되지 않도록 한다.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
