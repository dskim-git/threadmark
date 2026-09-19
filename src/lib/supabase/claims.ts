import type { SupabaseClient } from "@supabase/supabase-js";

type GetClaimsResult = Awaited<
  ReturnType<SupabaseClient["auth"]["getClaims"]>
>;

/** 서명 검증을 통과한 JWT 클레임. */
export type VerifiedClaims = NonNullable<GetClaimsResult["data"]>["claims"];

/**
 * 검증된 인증 클레임을 반환한다.
 *
 * 권한 판정에는 `getSession()`이 돌려주는 검증되지 않은 세션 데이터를 쓰지 않고
 * 서명을 검증하는 `getClaims()`만 사용한다.
 * 로그인하지 않았거나 토큰이 유효하지 않으면 `null`을 반환한다.
 *
 * 승인 상태와 역할 판정은 이후 단계에서 서버와 RLS로 재검증한다.
 * 이 함수의 반환값만으로 권한을 부여하지 않는다.
 */
export async function getVerifiedClaims(
  supabase: SupabaseClient,
): Promise<VerifiedClaims | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return null;
  }

  return data.claims;
}
