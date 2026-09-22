import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/crypto/secret-box";
import { createServiceClient } from "@/lib/supabase/service";

import {
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  parseTokenResponse,
} from "./oauth";

/**
 * Drive 연결 정보 저장소.
 *
 * google_drive_connections는 authenticated 역할에게 권한이 없다.
 * 그래서 이 파일만 service role 클라이언트를 쓴다.
 *
 * service role은 RLS를 우회하므로, 모든 질의가 user_id로 대상을 좁힌다.
 * 이 조건이 지금까지 RLS가 해주던 일을 대신한다. 빠뜨리면 남의 연결을 건드린다.
 */

/** 사용자에게 보여줄 연결 상태. 토큰은 절대 밖으로 내보내지 않는다. */
export type DriveConnectionSummary = {
  status: "connected" | "revoked" | "error";
  connectedAt: string;
  lastUsedAt: string | null;
  lastError: string | null;
  rootFolderId: string | null;
  folderNames: string[];
};

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "[ThreadMark] 환경변수 TOKEN_ENCRYPTION_KEY가 설정되지 않았습니다.",
    );
  }

  return parseEncryptionKey(raw);
}

/**
 * 연결 상태를 가져온다. 연결이 없으면 null을 돌려준다.
 *
 * 암호화된 토큰은 반환값에 넣지 않는다. 화면이 다룰 일이 없는 값이다.
 */
export async function getDriveConnectionSummary(
  userId: string,
): Promise<DriveConnectionSummary | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("google_drive_connections")
    .select("status, connected_at, last_used_at, last_error, root_folder_id, folder_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] Drive 연결 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  const folderIds =
    data.folder_ids && typeof data.folder_ids === "object"
      ? (data.folder_ids as Record<string, unknown>)
      : {};

  return {
    status: data.status,
    connectedAt: data.connected_at,
    lastUsedAt: data.last_used_at,
    lastError: data.last_error,
    rootFolderId: data.root_folder_id,
    folderNames: Object.keys(folderIds),
  };
}

/**
 * 파일을 넣을 폴더를 찾는다.
 *
 * 업로드가 시작될 때 "이 파일을 Drive 어디에 둘 것인가"를 정하는 데 쓴다.
 * 이름으로 찾지 못하면 루트 폴더를 돌려주고, 그것도 없으면 null이다.
 * null이면 폴더를 지정하지 않고 올리며, 파일은 My Drive 최상위에 놓인다.
 * 폴더가 없다는 이유로 업로드를 막지는 않는다.
 *
 * 폴더 식별자를 화면에 내보내지 않는 이유는 쓸 데가 없기 때문이다.
 * 이 값은 서버가 Drive에 요청을 보낼 때만 필요하다.
 */
export async function getDriveFolderId(options: {
  userId: string;
  folderName: string | null;
}): Promise<string | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("google_drive_connections")
    .select("root_folder_id, folder_ids")
    .eq("user_id", options.userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const folderIds =
    data.folder_ids && typeof data.folder_ids === "object"
      ? (data.folder_ids as Record<string, unknown>)
      : {};

  if (options.folderName) {
    const matched = folderIds[options.folderName];

    if (typeof matched === "string" && matched.length > 0) {
      return matched;
    }
  }

  return data.root_folder_id;
}

/** 연결을 저장한다. 같은 사용자가 다시 연결하면 기존 행을 덮어쓴다. */
export async function saveDriveConnection(options: {
  userId: string;
  refreshToken: string;
  grantedScope: string;
}): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("google_drive_connections").upsert(
    {
      user_id: options.userId,
      status: "connected",
      encrypted_refresh_token: encryptSecret(
        options.refreshToken,
        encryptionKey(),
      ),
      granted_scope: options.grantedScope,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[ThreadMark] Drive 연결 저장 실패:", error.message);

    return false;
  }

  return true;
}

/** 폴더 구성을 기록한다. */
export async function saveDriveFolders(options: {
  userId: string;
  rootFolderId: string;
  folderIds: Record<string, string>;
}): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("google_drive_connections")
    .update({
      root_folder_id: options.rootFolderId,
      folder_ids: options.folderIds,
      last_used_at: new Date().toISOString(),
    })
    .eq("user_id", options.userId);

  if (error) {
    console.error("[ThreadMark] Drive 폴더 정보 저장 실패:", error.message);
  }
}

/** 연결 상태를 바꾼다. 오류 문구에 토큰을 담지 않는다. */
export async function markDriveConnectionState(options: {
  userId: string;
  status: "connected" | "revoked" | "error";
  lastError?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("google_drive_connections")
    .update({
      status: options.status,
      last_error: options.lastError ?? null,
    })
    .eq("user_id", options.userId);

  if (error) {
    console.error("[ThreadMark] Drive 연결 상태 변경 실패:", error.message);
  }
}

/**
 * 연결을 끊는다.
 *
 * Google 쪽 권한도 함께 거둬들인다. 우리 기록만 지우면 사용자의 Google 계정에는
 * ThreadMark 접근 권한이 남아 있게 된다. 사용자가 "연결 해제"를 눌렀을 때
 * 기대하는 것은 그쪽도 정리되는 것이다.
 *
 * Google 호출이 실패해도 우리 기록은 지운다. 남겨두면 쓸 수 없는 토큰만 남는다.
 */
export async function disconnectDrive(userId: string): Promise<void> {
  const token = await readRefreshToken(userId);

  if (token) {
    try {
      await fetch(GOOGLE_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch (error) {
      // 권한 회수 실패를 사용자에게 되돌리지 않는다. 기록은 지운다.
      console.error(
        "[ThreadMark] Google 권한 회수 실패:",
        error instanceof Error ? error.message : "알 수 없는 오류",
      );
    }
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("google_drive_connections")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[ThreadMark] Drive 연결 삭제 실패:", error.message);
  }
}

/**
 * 저장된 refresh token을 읽는다.
 *
 * 이 값은 이 모듈 밖으로 나가지 않는다. 외부에 필요한 것은 access token이다.
 */
async function readRefreshToken(userId: string): Promise<string | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("google_drive_connections")
    .select("encrypted_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  try {
    return decryptSecret(data.encrypted_refresh_token, encryptionKey());
  } catch {
    // 키가 바뀌었거나 값이 손상되었다. 토큰 내용은 기록하지 않는다.
    console.error("[ThreadMark] 저장된 Drive 토큰을 복호화하지 못했습니다.");

    return null;
  }
}

/**
 * Drive API 호출에 쓸 access token을 가져온다.
 *
 * 설계 문서 10.5절에 따라 access token은 저장하지 않는다.
 * 필요할 때마다 refresh token으로 새로 받는다.
 *
 * 권한이 취소되었거나 토큰이 무효해지면 연결 상태를 바꿔 기록한다.
 * 그래야 사용자가 "다시 연결"을 해야 한다는 것을 알 수 있다. (설계 문서 10.4절)
 */
export async function getDriveAccessToken(
  userId: string,
): Promise<string | null> {
  const refreshToken = await readRefreshToken(userId);

  if (!refreshToken) {
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "[ThreadMark] GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 없습니다.",
    );

    return null;
  }

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
  } catch (error) {
    console.error(
      "[ThreadMark] Google 토큰 갱신 요청 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return null;
  }

  if (!response.ok) {
    // 400대 응답은 대개 권한이 취소되었거나 토큰이 무효해진 경우다.
    await markDriveConnectionState({
      userId,
      status: response.status >= 400 && response.status < 500 ? "revoked" : "error",
      lastError:
        response.status >= 400 && response.status < 500
          ? "Google에서 접근 권한이 해제되었습니다. 다시 연결해 주세요."
          : "Google 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.",
    });

    return null;
  }

  const parsed = parseTokenResponse(await response.json().catch(() => null));

  if (!parsed) {
    await markDriveConnectionState({
      userId,
      status: "error",
      lastError: "Google 응답을 이해하지 못했습니다.",
    });

    return null;
  }

  const supabase = createServiceClient();

  await supabase
    .from("google_drive_connections")
    .update({ last_used_at: new Date().toISOString(), last_error: null, status: "connected" })
    .eq("user_id", userId);

  return parsed.accessToken;
}
