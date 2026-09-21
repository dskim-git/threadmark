import { NextResponse, type NextRequest } from "next/server";

import { originFromHeaders } from "@/lib/auth/request-url";
import { getAccount } from "@/lib/auth/account";
import {
  markDriveConnectionState,
  saveDriveConnection,
  saveDriveFolders,
} from "@/lib/drive/connection";
import { ensureThreadMarkFolders } from "@/lib/drive/folders";
import {
  DRIVE_STATE_COOKIE,
  GOOGLE_TOKEN_ENDPOINT,
  grantedDriveAccess,
  isMatchingState,
  parseTokenResponse,
  resolveDriveRedirectUri,
} from "@/lib/drive/oauth";

/**
 * Google Drive 동의 후 돌아오는 자리.
 *
 * 설계 문서 10.6절이 정한 경로다. 로그인 콜백(/auth/callback)과 다른 흐름이며,
 * 여기서 받는 것은 ThreadMark 계정이 아니라 사용자의 Drive 접근 권한이다.
 *
 * 확인하는 순서가 중요하다.
 *   1. 로그인한 사용자인가          권한을 누구에게 붙일지 알아야 한다
 *   2. 우리가 시작한 요청인가        state 확인. 없으면 공격자가 자기 Google
 *                                  계정을 피해자 계정에 연결시킬 수 있다
 *   3. 필요한 권한을 받았는가        요청했다고 받은 것이 아니다
 *   4. refresh token을 받았는가      없으면 다음부터 접근할 수 없다
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const origin = originFromHeaders(request.headers) ?? requestUrl.origin;

  const account = await getAccount();

  if (!account) {
    return finish(origin, { error: "not_signed_in" });
  }

  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    console.error("[ThreadMark] Drive 동의 거부:", providerError);

    return finish(origin, { error: "access_denied" });
  }

  const expectedState = request.cookies.get(DRIVE_STATE_COOKIE)?.value;

  if (!isMatchingState(expectedState, requestUrl.searchParams.get("state"))) {
    return finish(origin, { error: "state_mismatch" });
  }

  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return finish(origin, { error: "missing_code" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[ThreadMark] Google OAuth 환경변수가 없습니다.");

    return finish(origin, { error: "exchange_failed" });
  }

  // 토큰 교환에 쓴 리디렉션 주소는 동의 요청 때와 글자까지 같아야 한다.
  const redirectUri = resolveDriveRedirectUri(
    origin,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
  } catch (error) {
    console.error(
      "[ThreadMark] Google 토큰 교환 요청 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return finish(origin, { error: "exchange_failed" });
  }

  if (!response.ok) {
    // 응답 본문에는 토큰이 들어 있을 수 있으므로 기록하지 않는다.
    console.error("[ThreadMark] Google 토큰 교환 실패, 상태:", response.status);

    return finish(origin, { error: "exchange_failed" });
  }

  const tokens = parseTokenResponse(await response.json().catch(() => null));

  if (!tokens) {
    return finish(origin, { error: "exchange_failed" });
  }

  if (!grantedDriveAccess(tokens.scope)) {
    return finish(origin, { error: "scope_not_granted" });
  }

  if (!tokens.refreshToken) {
    // 이미 연결된 적이 있으면 Google이 refresh token을 생략하기도 한다.
    // prompt=consent로 요청하지만 그래도 오지 않으면 안내한다.
    return finish(origin, { error: "no_refresh_token" });
  }

  const saved = await saveDriveConnection({
    userId: account.userId,
    refreshToken: tokens.refreshToken,
    grantedScope: tokens.scope,
  });

  if (!saved) {
    return finish(origin, { error: "exchange_failed" });
  }

  // 폴더 준비는 실패해도 연결 자체는 살려둔다.
  // 설정 화면에서 다시 시도할 수 있고, 파일을 올릴 때 다시 만들면 된다.
  const folders = await ensureThreadMarkFolders(tokens.accessToken);

  if (folders) {
    await saveDriveFolders({
      userId: account.userId,
      rootFolderId: folders.rootFolderId,
      folderIds: folders.folderIds,
    });
  } else {
    await markDriveConnectionState({
      userId: account.userId,
      status: "connected",
      lastError: "ThreadMark 폴더를 준비하지 못했습니다. 다시 시도해 주세요.",
    });
  }

  return finish(origin, { notice: "connected" });
}

/**
 * 설정 화면으로 돌려보낸다.
 *
 * 한 번 쓰고 끝나는 state 쿠키를 여기서 지운다.
 * 인증 정보가 실린 응답이 캐시되지 않도록 표시한다.
 */
function finish(
  origin: string,
  params: { error?: string; notice?: string },
): NextResponse {
  const url = new URL("/settings/integrations", origin);

  if (params.error) {
    url.searchParams.set("error", params.error);
  }

  if (params.notice) {
    url.searchParams.set("notice", params.notice);
  }

  const response = NextResponse.redirect(url);

  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.delete(DRIVE_STATE_COOKIE);

  return response;
}

// 토큰 복호화에 node:crypto를 쓰므로 Node 런타임에서 실행한다.
export const runtime = "nodejs";
