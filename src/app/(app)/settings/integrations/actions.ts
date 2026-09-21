"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { originFromHeaders } from "@/lib/auth/request-url";
import { disconnectDrive, getDriveAccessToken, saveDriveFolders } from "@/lib/drive/connection";
import { ensureThreadMarkFolders } from "@/lib/drive/folders";
import {
  DRIVE_STATE_COOKIE,
  DRIVE_STATE_MAX_AGE_SECONDS,
  buildAuthorizationUrl,
  resolveDriveRedirectUri,
} from "@/lib/drive/oauth";

const SETTINGS_PATH = "/settings/integrations";

function redirectWithQuery(params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${SETTINGS_PATH}?${query}` : SETTINGS_PATH);
}

/**
 * Google Drive 연결을 시작한다.
 *
 * 로그인과는 별개의 동의 과정이다. 설계 문서 4.1절이 둘을 분리하라고 했고,
 * 여기서 요청하는 것은 ThreadMark 계정이 아니라 사용자의 파일 접근 권한이다.
 *
 * state 값을 만들어 쿠키에 담고 Google에도 함께 보낸다.
 * 돌아온 요청이 우리가 시작한 것인지 확인하기 위해서다.
 * 이 확인이 없으면 공격자가 자기 Google 계정을 피해자의 ThreadMark 계정에
 * 연결시켜, 피해자가 올리는 파일을 자기 Drive로 받아볼 수 있다.
 */
export async function connectGoogleDrive(): Promise<void> {
  await requireActiveAccount(SETTINGS_PATH);

  const origin = originFromHeaders(await headers());

  if (!origin) {
    redirectWithQuery({ error: "unknown_origin" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    console.error("[ThreadMark] GOOGLE_CLIENT_ID가 설정되지 않았습니다.");
    redirectWithQuery({ error: "not_configured" });
  }

  const redirectUri = resolveDriveRedirectUri(
    origin,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );

  // Google은 리디렉션 주소를 글자 단위로 비교한다. 개발 중 포트가 바뀌면
  // 등록해야 할 주소가 달라지므로, 무엇을 등록해야 하는지 그대로 알려준다.
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[ThreadMark] Google Cloud에 이 리디렉션 URI가 등록되어 있어야 합니다: ${redirectUri}`,
    );
  }

  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();

  cookieStore.set(DRIVE_STATE_COOKIE, state, {
    httpOnly: true,
    // 동의 후 돌아오는 요청은 다른 사이트에서 출발한 최상위 이동이다.
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: DRIVE_STATE_MAX_AGE_SECONDS,
  });

  redirect(
    buildAuthorizationUrl({
      clientId,
      redirectUri,
      state,
    }),
  );
}

/**
 * 연결을 끊는다.
 *
 * 설계 문서 10.4절: Drive 파일이 사라져도 Source와 Capture는 유지한다.
 * 연결 해제도 마찬가지로 자료를 지우지 않는다. 접근 권한만 거둬들인다.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  const account = await requireActiveAccount(SETTINGS_PATH);

  await disconnectDrive(account.userId);

  revalidatePath(SETTINGS_PATH);
  redirectWithQuery({ notice: "disconnected" });
}

/**
 * ThreadMark 폴더를 다시 준비한다.
 *
 * 연결할 때 폴더 생성이 실패했거나, 사용자가 Drive에서 폴더를 지운 경우에 쓴다.
 * 있으면 그대로 쓰고 없는 것만 만든다.
 */
export async function repairDriveFolders(): Promise<void> {
  const account = await requireActiveAccount(SETTINGS_PATH);

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    redirectWithQuery({ error: "token_unavailable" });
  }

  const folders = await ensureThreadMarkFolders(accessToken);

  if (!folders) {
    redirectWithQuery({ error: "folder_failed" });
  }

  await saveDriveFolders({
    userId: account.userId,
    rootFolderId: folders.rootFolderId,
    folderIds: folders.folderIds,
  });

  revalidatePath(SETTINGS_PATH);
  redirectWithQuery({ notice: "folders_ready" });
}
