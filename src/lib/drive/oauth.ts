/**
 * Google Drive OAuth 흐름의 순수 로직.
 *
 * 로그인과는 별개의 동의 과정이다. 설계 문서 4.1절이 둘을 분리하라고 한 대로,
 * 로그인했다고 Drive 권한이 생기지 않는다.
 *
 * 네트워크 호출과 환경변수 읽기는 여기에 두지 않는다. 단위 테스트로 검증한다.
 */

/** 설계 문서 10.6절: 최소 권한만 요청한다. 전체 Drive 접근을 요구하지 않는다. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** 설계 문서 10.6절이 정한 콜백 경로. */
export const DRIVE_CALLBACK_PATH = "/api/google-drive/callback";

/**
 * 동의 후 돌아올 주소를 정한다.
 *
 * 기본은 지금 접속한 주소다. 개발 중에는 포트가 바뀌는 일이 흔한데,
 * 설정값이 다른 주소로 고정돼 있으면 Google이 그쪽으로 돌려보내고
 * 우리 앱은 그 요청을 받지 못한다. 그 주소에 다른 앱이 떠 있으면
 * 사용자는 영문 모를 404를 보게 된다.
 *
 * 그래서 설정값은 지금 접속한 주소와 출처가 같을 때만 쓴다.
 * 경로를 다르게 두고 싶은 경우를 위해 남겨두되, 어긋난 값은 조용히 무시한다.
 *
 * 어느 쪽을 쓰든 그 주소가 Google Cloud에 등록되어 있어야 한다.
 * Google은 리디렉션 주소를 글자 단위로 비교하며 와일드카드를 받지 않는다.
 */
export function resolveDriveRedirectUri(
  origin: string,
  configured: string | undefined,
): string {
  const fallback = `${origin}${DRIVE_CALLBACK_PATH}`;
  const trimmed = configured?.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const url = new URL(trimmed);

    return url.origin === origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** 연결 시작과 콜백 사이에 상태 값을 담아두는 쿠키. */
export const DRIVE_STATE_COOKIE = "threadmark-drive-state";

/** 연결 한 번을 마치기에 충분하고, 그 이상 남지 않을 만큼만 둔다. */
export const DRIVE_STATE_MAX_AGE_SECONDS = 600;

/**
 * 동의 화면 주소를 만든다.
 *
 * access_type=offline과 prompt=consent를 함께 쓴다.
 * 이 둘이 있어야 refresh token을 받는다. 두 번째 연결부터는 Google이
 * refresh token을 생략하는 경우가 있어, 다시 연결할 때도 확실히 받도록 한다.
 *
 * state는 돌아온 요청이 우리가 시작한 것인지 확인하는 값이다.
 * 이것이 없으면 공격자가 자기 Google 계정을 피해자 계정에 연결시킬 수 있다.
 */
export function buildAuthorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: options.state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * 돌려받은 state가 우리가 보낸 것과 같은지 확인한다.
 *
 * 길이가 다르면 곧바로 거짓을 돌려준다. 같은 길이일 때는 모든 문자를 비교해
 * 비교에 걸리는 시간이 값에 따라 달라지지 않게 한다.
 */
export function isMatchingState(
  expected: string | undefined,
  received: string | null,
): boolean {
  if (!expected || !received || expected.length !== received.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }

  return difference === 0;
}

/**
 * 허용된 권한 범위에 Drive 권한이 들어 있는지 확인한다.
 *
 * 사용자는 동의 화면에서 일부 권한만 허용할 수 있다.
 * 요청했다는 이유로 받았다고 가정하지 않는다.
 */
export function grantedDriveAccess(scope: string | null | undefined): boolean {
  if (!scope) {
    return false;
  }

  return scope.split(/\s+/).includes(DRIVE_SCOPE);
}

/** Google이 돌려준 토큰 응답 중 우리가 쓰는 부분. */
export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresInSeconds: number;
};

/**
 * 토큰 응답을 검사해 필요한 값만 꺼낸다.
 *
 * 외부 응답을 신뢰 가능한 입력으로 취급하지 않는다. (설계 문서 18절)
 * 형태가 어긋나면 조용히 넘기지 않고 null을 돌려준다.
 */
export function parseTokenResponse(value: unknown): GoogleTokenResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;

  const accessToken = body.access_token;
  const scope = body.scope;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  if (typeof scope !== "string") {
    return null;
  }

  const refreshToken =
    typeof body.refresh_token === "string" && body.refresh_token.length > 0
      ? body.refresh_token
      : null;

  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 0;

  return {
    accessToken,
    refreshToken,
    scope,
    expiresInSeconds: expiresIn,
  };
}

/**
 * 사용자에게 보여줄 오류 문구를 고른다.
 *
 * Google이 보낸 설명을 그대로 띄우지 않는다. 내부 사정을 드러내지 않으면서
 * 다음에 무엇을 하면 되는지만 알려준다.
 */
export function describeOAuthError(code: string | null): string {
  switch (code) {
    case "access_denied":
      return "Google Drive 연결이 취소되었습니다.";
    case "missing_code":
      return "인증 정보가 전달되지 않았습니다. 다시 시도해 주세요.";
    case "state_mismatch":
      return "요청을 확인하지 못했습니다. 처음부터 다시 시도해 주세요.";
    case "scope_not_granted":
      return "파일 접근 권한이 허용되지 않아 연결할 수 없습니다.";
    case "no_refresh_token":
      return "연결 정보를 받지 못했습니다. Google 계정의 기존 연결을 해제한 뒤 다시 시도해 주세요.";
    case "exchange_failed":
      return "Google과 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "Google Drive 연결에 실패했습니다. 다시 시도해 주세요.";
  }
}
