import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "./env";

/**
 * 브라우저(Client Component)에서 사용하는 Supabase 클라이언트.
 *
 * 공개 가능한 `NEXT_PUBLIC_*` 값만 사용한다.
 * 서버 전용 비밀값(`SUPABASE_SECRET_KEY` 등)은 이 파일에서 참조하지 않는다.
 */
export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
