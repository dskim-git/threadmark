import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * RLS를 우회하는 서버 전용 Supabase 클라이언트.
 *
 * 왜 필요한가
 *   google_drive_connections는 authenticated 역할에게 권한이 없다.
 *   설계 문서 10.5절이 "클라이언트가 refresh token 테이블을 select할 수 없어야
 *   한다"고 요구하기 때문이다. 그 표를 다루려면 service role이 필요하다.
 *
 * 무엇이 달라지는가
 *   이 클라이언트에는 RLS가 적용되지 않는다. 지금까지 데이터베이스가 대신
 *   해주던 소유자 확인을 호출하는 코드가 직접 해야 한다.
 *   "이 사용자의 행만 건드린다"를 코드가 보장해야 한다는 뜻이다.
 *
 * 그래서 쓰는 곳을 좁힌다
 *   Drive 연결 정보를 다루는 곳에서만 쓴다.
 *   일반 데이터에는 절대 쓰지 않는다. 그 표들은 RLS가 지키고 있고,
 *   여기를 쓰는 순간 그 보호가 사라진다.
 *   tests/service-client-usage.test.mjs가 사용처를 감시한다.
 */

/**
 * 브라우저에서 이 모듈이 불려 나오면 즉시 멈춘다.
 *
 * 번들러 설정이 바뀌거나 누군가 Client Component에서 불러오면,
 * 서버 전용 키가 브라우저로 넘어갈 수 있다. 조용히 동작하는 것보다
 * 개발 중에 분명하게 실패하는 편이 낫다.
 */
function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "[ThreadMark] service role 클라이언트는 서버에서만 사용할 수 있습니다.",
    );
  }
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[ThreadMark] 환경변수 ${name}이(가) 설정되지 않았습니다. ` +
        ".env.local 또는 배포 환경의 환경변수 설정을 확인하세요.",
    );
  }

  return value;
}

/**
 * service role 클라이언트를 만든다.
 *
 * 세션을 남기지 않고 토큰을 자동 갱신하지도 않는다.
 * 이 클라이언트는 사용자를 대신하는 것이 아니라 서버 자신으로 동작한다.
 */
export function createServiceClient() {
  assertServerOnly();

  const url = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const secretKey = requireEnv(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY,
  );

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
