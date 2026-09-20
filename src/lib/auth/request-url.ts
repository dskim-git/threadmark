/**
 * 인증 리디렉션에 사용하는 URL 유틸리티.
 *
 * next/headers 같은 런타임 의존성을 두지 않는다.
 * 로그인 흐름에서 가장 사고가 나기 쉬운 부분이라 단위 테스트로 검증한다.
 */

/**
 * 이동할 곳을 판단할 수 없을 때 보낼 기본 경로.
 *
 * 보호된 앱 영역의 첫 화면이다. 승인되지 않은 계정은 그곳에서 다시
 * 승인 상태 안내 화면으로 이동한다.
 */
export const DEFAULT_REDIRECT_PATH = "/home";

/**
 * 로그인 후 돌아갈 경로를 잠시 담아두는 쿠키 이름.
 *
 * 이 값을 OAuth redirectTo의 쿼리 문자열에 실으면 인증 공급자에게 넘기는 주소가
 * 요청마다 달라진다. 그러면 Supabase의 Redirect URL 허용 목록과 맞추기 까다롭고,
 * 맞지 않으면 Supabase가 Site URL로 되돌려 보내 로그인이 조용히 실패한다.
 *
 * 그래서 공급자에게는 고정된 콜백 주소만 넘기고, 돌아갈 경로는 쿠키로 전달한다.
 */
export const NEXT_PATH_COOKIE = "threadmark-next-path";

/** 쿠키 유효 시간. 로그인 한 번을 마치기에 충분하고 그 이상 남지 않을 만큼만 둔다. */
export const NEXT_PATH_COOKIE_MAX_AGE_SECONDS = 600;

/**
 * 로그인 후 이동할 경로를 안전한 값으로 정리한다.
 *
 * `next` 파라미터는 URL에 그대로 노출되므로 누구나 조작할 수 있다.
 * 검증 없이 리디렉션하면 ThreadMark 링크가 외부 피싱 사이트로 사용자를 보내는
 * 통로가 된다. 그래서 같은 출처의 경로 하나만 통과시키고 나머지는 전부 버린다.
 *
 * 허용: "/", "/home", "/sources/123?tab=notes#top"
 * 거부: "https://evil.example", "//evil.example", "/\\evil.example",
 *       제어 문자가 섞인 값, 경로가 아닌 값
 */
export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_REDIRECT_PATH;
  }

  // 같은 출처의 절대 경로만 허용한다. 스킴이 붙은 URL은 여기서 걸러진다.
  if (!value.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  // "//evil.example"은 스킴 상대 URL이라 브라우저가 외부 출처로 해석한다.
  if (value.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    // 0x5c는 역슬래시다. 일부 브라우저가 "/\evil.example"을 "//evil.example"처럼
    // 다루므로 위의 스킴 상대 URL 검사를 우회하는 수단이 된다.
    if (code === 0x5c) {
      return DEFAULT_REDIRECT_PATH;
    }

    // 제어 문자는 응답 헤더 주입과 검사 우회에 쓰인다.
    if (code < 0x20 || code === 0x7f) {
      return DEFAULT_REDIRECT_PATH;
    }
  }

  return value;
}

/**
 * 요청 헤더에서 현재 배포 환경의 출처를 계산한다.
 *
 * localhost, Vercel Preview, Production이 각각 다른 주소를 쓰므로
 * 환경변수에 출처를 고정하지 않고 요청에서 읽는다.
 *
 * Host 헤더는 원칙적으로 신뢰할 수 없는 값이다. 다만 이 값으로 만든 주소는
 * Supabase의 Redirect URL 허용 목록과 대조되므로, 위조된 host로는 인증 흐름을
 * 진행할 수 없다. 실제 방어선은 Supabase 대시보드의 허용 목록이다.
 */
export function originFromHeaders(headers: Headers): string | null {
  const forwardedHost = headers.get("x-forwarded-host");
  const host = firstHeaderValue(forwardedHost) ?? headers.get("host");

  if (!host) {
    return null;
  }

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? defaultProtocolFor(host);

  return `${protocol}://${host}`;
}

/** 프록시를 여러 번 거치면 헤더 값이 쉼표로 이어진다. 첫 값이 원래 요청이다. */
function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0].trim();

  return first.length > 0 ? first : null;
}

function defaultProtocolFor(host: string): "http" | "https" {
  const hostname = host.split(":")[0];

  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "http"
    : "https";
}
