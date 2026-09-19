/**
 * Supabase 환경변수 접근 지점.
 *
 * - 값은 모듈 로드 시점이 아니라 실제 호출 시점에 읽는다.
 *   (빌드 타임에 환경변수가 없다는 이유로 build가 깨지지 않게 한다.)
 * - 누락 시 어떤 변수가 비었는지 이름만 알려주고, 값 자체는 절대 출력하지 않는다.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[ThreadMark] 환경변수 ${name}이(가) 설정되지 않았습니다. .env.local 또는 배포 환경의 환경변수 설정을 확인하세요.`,
    );
  }

  return value;
}

/**
 * 브라우저 번들에 포함되어도 되는 공개 설정.
 *
 * Next.js는 `process.env.NEXT_PUBLIC_*`를 정적으로 치환하므로
 * 변수명을 문자열로 조합하지 않고 그대로 참조한다.
 */
export function getPublicSupabaseEnv(): {
  url: string;
  publishableKey: string;
} {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
