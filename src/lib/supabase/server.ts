import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { getVerifiedClaims, type VerifiedClaims } from "./claims";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/**
 * Server Component, Server Action, Route Handler에서 사용하는 Supabase 클라이언트.
 *
 * 요청마다 새로 생성해야 하며 모듈 스코프에 캐시하지 않는다.
 *
 * publishable key를 사용하므로 이 클라이언트의 모든 질의에는 RLS가 적용된다.
 * 서비스 권한이 필요한 작업은 이후 단계에서 별도의 서버 전용 클라이언트로 분리한다.
 */
export async function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 src/proxy.ts가 담당하므로 여기서는 무시해도 안전하다.
        }
      },
    },
  });
}

/**
 * 서버에서 현재 요청의 검증된 인증 클레임을 가져온다.
 *
 * 비로그인 또는 토큰이 유효하지 않으면 `null`을 반환한다.
 */
export async function getServerClaims(): Promise<VerifiedClaims | null> {
  const supabase = await createClient();

  return getVerifiedClaims(supabase);
}
