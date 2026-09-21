/**
 * Google Drive OAuth 순수 로직 단위 테스트.
 *
 * 이 흐름에서 잘못되면 사용자의 Google Drive 접근 권한이 잘못된 계정에
 * 붙거나, 필요 이상의 권한을 받게 된다. 판단 지점을 하나씩 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DRIVE_SCOPE,
  buildAuthorizationUrl,
  describeOAuthError,
  grantedDriveAccess,
  isMatchingState,
  parseTokenResponse,
  resolveDriveRedirectUri,
} from "../src/lib/drive/oauth.ts";

test("최소 권한만 요청한다", () => {
  // 설계 문서 10.6절: drive.file 하나만 쓴다.
  // 전체 Drive 접근 권한을 요청하면 사용자의 모든 파일을 읽을 수 있게 된다.
  assert.equal(DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.file");

  const url = new URL(
    buildAuthorizationUrl({
      clientId: "client-123",
      redirectUri: "http://localhost:3000/api/google-drive/callback",
      state: "state-abc",
    }),
  );

  assert.equal(url.searchParams.get("scope"), DRIVE_SCOPE);
  assert.ok(!url.searchParams.get("scope").includes("drive.readonly"));
  assert.ok(!url.searchParams.get("scope").includes("auth/drive "));
});

test("동의 주소에 필요한 값이 모두 들어간다", () => {
  const url = new URL(
    buildAuthorizationUrl({
      clientId: "client-123",
      redirectUri: "http://localhost:3001/api/google-drive/callback",
      state: "state-abc",
    }),
  );

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://localhost:3001/api/google-drive/callback",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-abc");
});

test("refresh token을 받기 위한 값을 함께 보낸다", () => {
  // 이 둘이 없으면 refresh token이 오지 않고, 다음부터 Drive에 접근할 수 없다.
  const url = new URL(
    buildAuthorizationUrl({
      clientId: "c",
      redirectUri: "https://example.com/cb",
      state: "s",
    }),
  );

  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
});

test("state가 같을 때만 통과한다", () => {
  assert.equal(isMatchingState("abc123", "abc123"), true);
});

test("state가 다르거나 없으면 거부한다", () => {
  // 이 확인이 없으면 공격자가 자기 Google 계정을 피해자 계정에 연결시켜,
  // 피해자가 올리는 파일을 자기 Drive로 받아볼 수 있다.
  const cases = [
    ["abc123", "abc124"],
    ["abc123", "abc12"],
    ["abc123", ""],
    ["abc123", null],
    ["", "abc123"],
    [undefined, "abc123"],
    [undefined, null],
  ];

  for (const [expected, received] of cases) {
    assert.equal(
      isMatchingState(expected, received),
      false,
      `${expected} / ${received}는 거부되어야 한다`,
    );
  }
});

test("허용된 권한에 Drive가 있어야 통과한다", () => {
  assert.equal(grantedDriveAccess(DRIVE_SCOPE), true);
  assert.equal(
    grantedDriveAccess(`openid email ${DRIVE_SCOPE} profile`),
    true,
  );
});

test("Drive 권한이 없으면 거부한다", () => {
  // 사용자는 동의 화면에서 일부만 허용할 수 있다.
  // 요청했다는 이유로 받았다고 가정하지 않는다.
  for (const scope of [
    null,
    undefined,
    "",
    "openid email profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file.extra",
  ]) {
    assert.equal(grantedDriveAccess(scope), false, `${scope}는 거부되어야 한다`);
  }
});

test("토큰 응답에서 필요한 값을 꺼낸다", () => {
  const parsed = parseTokenResponse({
    access_token: "ya29.token",
    refresh_token: "1//refresh",
    scope: DRIVE_SCOPE,
    expires_in: 3599,
    token_type: "Bearer",
  });

  assert.equal(parsed.accessToken, "ya29.token");
  assert.equal(parsed.refreshToken, "1//refresh");
  assert.equal(parsed.scope, DRIVE_SCOPE);
  assert.equal(parsed.expiresInSeconds, 3599);
});

test("refresh token이 없으면 null로 표시한다", () => {
  // 두 번째 연결부터 Google이 생략하는 경우가 있다.
  // 없다는 사실을 호출한 쪽이 알아야 안내할 수 있다.
  const parsed = parseTokenResponse({
    access_token: "ya29.token",
    scope: DRIVE_SCOPE,
    expires_in: 3599,
  });

  assert.equal(parsed.refreshToken, null);
});

test("형태가 어긋난 응답은 받아들이지 않는다", () => {
  // 외부 응답을 신뢰 가능한 입력으로 취급하지 않는다. (설계 문서 18절)
  for (const body of [
    null,
    undefined,
    "string",
    42,
    {},
    { access_token: "" },
    { access_token: "t" },
    { scope: DRIVE_SCOPE },
    { access_token: 123, scope: DRIVE_SCOPE },
    { access_token: "t", scope: 123 },
  ]) {
    assert.equal(
      parseTokenResponse(body),
      null,
      `${JSON.stringify(body)}는 거부되어야 한다`,
    );
  }
});

test("오류 문구는 상황마다 다르게 안내한다", () => {
  const codes = [
    "access_denied",
    "missing_code",
    "state_mismatch",
    "scope_not_granted",
    "no_refresh_token",
    "exchange_failed",
  ];

  const messages = codes.map((code) => describeOAuthError(code));

  for (const message of messages) {
    assert.ok(message.length > 0);
  }

  // 사용자가 다음에 무엇을 할지 알 수 있어야 하므로 문구가 겹치면 안 된다.
  assert.equal(new Set(messages).size, messages.length);
});

test("알 수 없는 오류 코드에도 문구를 제공한다", () => {
  assert.ok(describeOAuthError(null).length > 0);
  assert.ok(describeOAuthError("something_unexpected").length > 0);
});

test("설정값이 없으면 지금 접속한 주소를 쓴다", () => {
  assert.equal(
    resolveDriveRedirectUri("http://localhost:3001", undefined),
    "http://localhost:3001/api/google-drive/callback",
  );
  assert.equal(
    resolveDriveRedirectUri("http://localhost:3001", "   "),
    "http://localhost:3001/api/google-drive/callback",
  );
});

test("설정값의 출처가 같으면 그대로 쓴다", () => {
  assert.equal(
    resolveDriveRedirectUri(
      "https://thread-mark.vercel.app",
      "https://thread-mark.vercel.app/api/google-drive/callback",
    ),
    "https://thread-mark.vercel.app/api/google-drive/callback",
  );
});

test("설정값의 출처가 다르면 무시한다", () => {
  // 이 값을 그대로 쓰면 Google이 다른 주소로 돌려보내고, 그곳에 다른 앱이
  // 떠 있으면 사용자는 영문 모를 404를 보게 된다.
  const cases = [
    ["http://localhost:3001", "http://localhost:3000/api/google-drive/callback"],
    ["http://localhost:3000", "https://thread-mark.vercel.app/api/google-drive/callback"],
    ["https://thread-mark.vercel.app", "http://localhost:3000/api/google-drive/callback"],
  ];

  for (const [origin, configured] of cases) {
    assert.equal(
      resolveDriveRedirectUri(origin, configured),
      `${origin}/api/google-drive/callback`,
      `${configured}는 무시되어야 한다`,
    );
  }
});

test("설정값이 주소 형식이 아니면 무시한다", () => {
  for (const configured of ["not-a-url", "/api/google-drive/callback", "localhost:3000"]) {
    assert.equal(
      resolveDriveRedirectUri("http://localhost:3001", configured),
      "http://localhost:3001/api/google-drive/callback",
    );
  }
});
