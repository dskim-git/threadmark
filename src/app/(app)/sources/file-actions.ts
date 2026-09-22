"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { originFromHeaders } from "@/lib/auth/request-url";
import { getDriveAccessToken, getDriveFolderId } from "@/lib/drive/connection";
import { createResumableUploadSession, fetchDriveFile } from "@/lib/drive/files";
import {
  STALE_PENDING_MINUTES,
  describePickedFileProblem,
  describeUploadRejection,
  folderNameForUpload,
  isTrustedUploadSessionUrl,
  sanitizeFileName,
  uploadStartSchema,
  verifyUploadedFile,
} from "@/lib/drive/upload";
import { firstIssueMessage, formValue } from "@/lib/sources/schema";
import { getSourceById } from "@/lib/sources/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * 자료에 Drive 파일을 붙이고 떼는 동작. (설계 문서 10.3절)
 *
 * 업로드는 두 번에 나뉘어 일어난다.
 *
 *   1. startFileUpload   자리를 잡고, DB에 pending 행을 만들고, 자리 주소를 준다.
 *   2. 브라우저가 그 주소로 파일을 직접 보낸다.
 *   3. finishFileUpload  Drive에 직접 물어 확인하고 ready로 바꾼다.
 *
 * 왜 파일이 우리 서버를 거치지 않는가
 *   Vercel 함수는 큰 본문을 받지 못한다. 서버를 거치게 만들면 웬만한 논문 PDF가
 *   막힌다. 설계 문서 10.3절이 resumable upload를 지정한 이유이기도 하다.
 *
 * 그러면 브라우저에 무엇을 주는가
 *   토큰이 아니라 자리 주소뿐이다. 그 주소는 이 파일 하나에만 쓰이고 만료된다.
 *   설계 문서 9.2절의 "브라우저에 장기 refresh token을 전달하지 않는다"보다
 *   한 걸음 더 나아가, access token도 주지 않는다.
 *
 * 왜 이 동작들만 값을 돌려주는가
 *   다른 Server Action은 일을 마치고 redirect로 화면을 옮긴다.
 *   업로드는 중간에 브라우저가 할 일이 있어서 화면을 옮길 수 없다.
 *   그래서 이 둘만 결과를 값으로 돌려주고, 화면 이동은 하지 않는다.
 */

const SOURCE_FILES_UNAVAILABLE =
  "Google Drive에 연결되어 있지 않거나 연결이 만료되었습니다. 연결 설정에서 다시 연결해 주세요.";

const GENERIC_FAILURE = "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type UploadStartResult =
  | { ok: true; fileId: string; uploadUrl: string }
  | { ok: false; message: string };

export type UploadFinishResult = { ok: true } | { ok: false; message: string };

/**
 * Drive 파일 식별자의 형태.
 *
 * 이 값은 브라우저가 알려준다. 주소의 일부로 쓰이므로 형태를 먼저 고정한다.
 * Drive 식별자는 영문, 숫자, 밑줄, 붙임표로만 이루어진다.
 */
const driveFileIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,200}$/, "파일 정보를 확인하지 못했습니다.");

const uploadFinishSchema = z.object({
  fileId: z.uuid({ message: "잘못된 요청입니다." }),
  driveFileId: driveFileIdSchema,
});

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/**
 * 업로드 자리를 잡는다.
 *
 * 확인하는 순서에 뜻이 있다.
 *   승인된 계정인가 → 입력이 올바른가 → 그 자료가 내 것인가 → Drive를 쓸 수 있는가
 *
 * 자료 확인을 Drive 호출보다 먼저 한다. 남의 자료에 파일을 붙이려는 요청이
 * 왔을 때, 우리가 Google에 아무것도 묻지 않고 끝나도록 하기 위해서다.
 */
export async function startFileUpload(
  input: unknown,
): Promise<UploadStartResult> {
  const account = await requireActiveAccount();

  const parsed = uploadStartSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const { sourceId, fileName, mimeType, byteSize } = parsed.data;

  // 없는 자료와 남의 자료를 구분하지 않는다. 구분하면 어떤 id가 있는지 알려준다.
  const source = await getSourceById(sourceId);

  if (!source) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }

  const origin = originFromHeaders(await headers());

  if (!origin) {
    return { ok: false, message: GENERIC_FAILURE };
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    return { ok: false, message: SOURCE_FILES_UNAVAILABLE };
  }

  const folderId = await getDriveFolderId({
    userId: account.userId,
    folderName: folderNameForUpload({ sourceType: source.type, mimeType }),
  });

  const supabase = await createClient();

  // 먼저 자리를 DB에 잡는다. 업로드가 끊겨도 "무엇을 올리려 했는지"가 남아,
  // 나중에 정리하거나 다시 시도할 수 있다. (설계 문서 10.3절)
  // owner_id는 보내지 않는다. 트리거가 auth.uid()로 채우고, 같은 트리거가
  // 이 자료가 정말 내 것인지 한 번 더 확인한다.
  const { data: created, error: insertError } = await supabase
    .from("source_files")
    .insert({
      source_id: sourceId,
      file_name: fileName,
      mime_type: mimeType,
      byte_size: byteSize,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    console.error("[ThreadMark] 파일 자리 생성 실패:", insertError?.message);

    return { ok: false, message: GENERIC_FAILURE };
  }

  const uploadUrl = await createResumableUploadSession({
    accessToken,
    origin,
    fileName,
    mimeType,
    byteSize,
    parentFolderId: folderId,
  });

  // Google이 준 주소가 맞는지 확인하고서야 브라우저에 넘긴다.
  // 브라우저는 이 주소로 사용자의 파일을 그대로 보내기 때문이다.
  if (!isTrustedUploadSessionUrl(uploadUrl)) {
    // 자리를 잡지 못했으니 방금 만든 행도 남겨두지 않는다.
    await supabase.from("source_files").delete().eq("id", created.id);

    return { ok: false, message: SOURCE_FILES_UNAVAILABLE };
  }

  return { ok: true, fileId: created.id, uploadUrl };
}

/**
 * 업로드를 마무리한다.
 *
 * 설계 문서 10.3절: 업로드 성공 후에만 ready로 바꾼다.
 *
 * 브라우저는 "다 올렸고 파일 식별자는 이것"이라고 알려준다.
 * 그 말을 그대로 믿지 않는다. 그 식별자로 Drive에 직접 물어서,
 * 시작할 때 기록해둔 이름·크기·폴더와 맞을 때만 완료로 인정한다.
 *
 * 크기와 checksum은 브라우저가 보낸 값이 아니라 Drive가 알려준 값을 적는다.
 * 나중에 파일이 바뀌었는지 판단하는 근거이므로(설계 문서 9.2절),
 * 여기에 부정확한 값이 들어가면 그 판단이 통째로 무의미해진다.
 */
export async function finishFileUpload(
  input: unknown,
): Promise<UploadFinishResult> {
  const account = await requireActiveAccount();

  const parsed = uploadFinishSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await createClient();

  // RLS가 내 행만 보여준다. 남의 행은 여기서 없는 것으로 나온다.
  const { data: row, error } = await supabase
    .from("source_files")
    .select("id, source_id, status, file_name, byte_size")
    .eq("id", parsed.data.fileId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 파일 확인 실패:", error.message);

    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!row) {
    return { ok: false, message: "올리던 파일 정보를 찾을 수 없습니다." };
  }

  // 이미 끝난 것을 다시 확인하지 않는다. 같은 요청이 두 번 와도 문제없게 한다.
  if (row.status === "ready") {
    revalidatePath(`/sources/${row.source_id}`);

    return { ok: true };
  }

  const source = await getSourceById(row.source_id);

  if (!source) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    return { ok: false, message: SOURCE_FILES_UNAVAILABLE };
  }

  const lookup = await fetchDriveFile({
    accessToken,
    fileId: parsed.data.driveFileId,
  });

  if (lookup.outcome === "missing") {
    return {
      ok: false,
      message: "Drive에서 파일을 찾지 못했습니다. 다시 올려 주세요.",
    };
  }

  if (lookup.outcome === "failed") {
    return { ok: false, message: GENERIC_FAILURE };
  }

  // 시작할 때와 같은 규칙으로 폴더를 다시 계산한다.
  // 자료 유형과 파일 종류가 그대로면 같은 폴더가 나온다.
  const folderId = await getDriveFolderId({
    userId: account.userId,
    folderName: folderNameForUpload({
      sourceType: source.type,
      mimeType: lookup.file.mimeType,
    }),
  });

  const rejection = verifyUploadedFile(lookup.file, {
    fileName: row.file_name,
    byteSize: row.byte_size,
    folderId,
  });

  if (rejection) {
    return { ok: false, message: describeUploadRejection(rejection) };
  }

  const { error: updateError } = await supabase
    .from("source_files")
    .update({
      status: "ready",
      drive_file_id: lookup.file.id,
      // Drive가 알려준 값으로 덮는다. 브라우저가 말한 크기가 아니다.
      byte_size: lookup.file.byteSize ?? row.byte_size,
      checksum: lookup.file.checksum,
      drive_modified_at: lookup.file.modifiedAt,
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("id");

  if (updateError) {
    console.error("[ThreadMark] 파일 완료 처리 실패:", updateError.message);

    return { ok: false, message: GENERIC_FAILURE };
  }

  revalidatePath(`/sources/${row.source_id}`);

  return { ok: true };
}

export type PickerSessionResult =
  | { ok: true; accessToken: string; apiKey: string; appId: string }
  | { ok: false; message: string };

/**
 * Google Picker를 열기 위한 값들을 내어준다. (설계 문서 10.2절)
 *
 * 여기서 12-B의 원칙 하나가 깨진다. 솔직하게 적어둔다.
 *
 *   업로드에서는 브라우저에 토큰을 주지 않았다. 자리 주소만 주면 됐기 때문이다.
 *   Picker는 그렇게 할 수 없다. Google이 만든 화면이 브라우저 안에서 직접
 *   Drive에 묻는 방식이라, 서버가 대신 물어줄 수 없다.
 *
 * 그래서 내어주되, 내어주는 것을 최소로 한다.
 *
 *   - refresh token은 절대 나가지 않는다. access token만 나간다.
 *   - access token은 1시간짜리다. 저장하지 않으므로 화면을 닫으면 사라진다.
 *   - 권한 범위는 drive.file 하나다. 이 앱이 만든 파일과 사용자가 직접 고른
 *     파일 바깥은 이 토큰으로도 볼 수 없다. (설계 문서 10.6절)
 *   - 사용자가 Picker를 열 때만 부른다. 화면을 열 때가 아니다.
 *
 * 설계 문서 2.3절이 최소 권한을 고집한 값이 여기서 드러난다.
 * 토큰이 새어나가도 닿는 범위가 사용자의 Drive 전체가 아니라
 * ThreadMark가 다루는 파일로 한정된다.
 *
 * API 키와 App ID는 NEXT_PUBLIC이라 어차피 공개되는 값이다. 그래도 여기서
 * 함께 돌려주는 이유는, 설정이 빠졌을 때 한 자리에서 같은 문구로 알리기 위해서다.
 * 브라우저가 각자 확인하면 "왜 아무 일도 안 일어나지"가 되기 쉽다.
 */
export async function createPickerSession(): Promise<PickerSessionResult> {
  const account = await requireActiveAccount();

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim();
  const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID?.trim();

  if (!apiKey || !appId) {
    console.error(
      "[ThreadMark] NEXT_PUBLIC_GOOGLE_PICKER_API_KEY 또는 NEXT_PUBLIC_GOOGLE_PICKER_APP_ID가 없습니다.",
    );

    return {
      ok: false,
      message: "Drive에서 고르기 설정이 완료되지 않았습니다.",
    };
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    return { ok: false, message: SOURCE_FILES_UNAVAILABLE };
  }

  return { ok: true, accessToken, apiKey, appId };
}

const attachPickedSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  driveFileId: driveFileIdSchema,
});

export type AttachPickedResult =
  | { ok: true; fileName: string }
  | { ok: false; message: string };

/**
 * Picker로 고른 파일을 자료에 붙인다.
 *
 * 브라우저는 "이 식별자를 골랐다"고만 알려준다. 그 말을 그대로 적지 않는다.
 * 업로드 때와 같이 **서버가 Drive에 직접 물어서** 이름·크기·종류를 받아 적는다.
 * 브라우저가 보낸 이름과 크기는 아예 받지도 않는다. 받으면 믿고 싶어지기 때문이다.
 *
 * drive.file 권한이라 Picker에서 고르지 않은 파일은 서버도 읽지 못한다.
 * 그래서 남의 파일 식별자를 넣어 봐야 "찾을 수 없다"로 끝난다.
 *
 * origin은 'picked'다. 사용자가 원래 가지고 있던 파일이라는 뜻이며,
 * 나중에 정리 기능을 만들 때 우리가 손대면 안 되는 쪽이다.
 */
export async function attachPickedFile(
  input: unknown,
): Promise<AttachPickedResult> {
  const account = await requireActiveAccount();

  const parsed = attachPickedSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: firstIssueMessage(parsed.error) };
  }

  // 자료 확인을 Drive 호출보다 먼저 한다. 남의 자료에 붙이려는 요청이면
  // Google에 아무것도 묻지 않고 끝난다.
  const source = await getSourceById(parsed.data.sourceId);

  if (!source) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    return { ok: false, message: SOURCE_FILES_UNAVAILABLE };
  }

  const lookup = await fetchDriveFile({
    accessToken,
    fileId: parsed.data.driveFileId,
  });

  if (lookup.outcome === "missing") {
    return {
      ok: false,
      message: "Drive에서 그 파일을 찾지 못했습니다. 다시 골라 주세요.",
    };
  }

  if (lookup.outcome === "failed") {
    return { ok: false, message: GENERIC_FAILURE };
  }

  const problem = describePickedFileProblem(lookup.file);

  if (problem) {
    return { ok: false, message: problem };
  }

  // describePickedFileProblem이 통과시켰으므로 둘 다 값이 있다.
  const fileName = sanitizeFileName(lookup.file.name) ?? lookup.file.name;
  const byteSize = lookup.file.byteSize ?? 0;

  const supabase = await createClient();

  const { error } = await supabase.from("source_files").insert({
    source_id: parsed.data.sourceId,
    // 고른 파일은 Drive에 이미 있다. 확인도 방금 마쳤으므로 바로 ready다.
    status: "ready",
    origin: "picked",
    drive_file_id: lookup.file.id,
    file_name: fileName,
    mime_type: lookup.file.mimeType,
    byte_size: byteSize,
    checksum: lookup.file.checksum,
    drive_modified_at: lookup.file.modifiedAt,
    last_verified_at: new Date().toISOString(),
  });

  if (error) {
    // 같은 파일을 같은 자료에 두 번 붙이는 경우다.
    // (source_files_source_drive_file_key 부분 고유 인덱스)
    if (error.code === "23505") {
      return { ok: false, message: "이미 이 자료에 붙어 있는 파일입니다." };
    }

    console.error("[ThreadMark] 고른 파일 붙이기 실패:", error.message);

    return { ok: false, message: GENERIC_FAILURE };
  }

  revalidatePath(`/sources/${parsed.data.sourceId}`);

  return { ok: true, fileName };
}

/**
 * 첨부를 해제한다.
 *
 * 설계 문서 10.4절: Drive 파일이 사라져도 Source와 Capture는 유지한다.
 * 그 반대도 같다. 여기서 지우는 것은 "이 파일이 이 자료에 속한다"는 기록뿐이고,
 * Drive의 파일은 그대로 둔다. 사용자의 Drive는 사용자의 것이다.
 *
 * 연결 설정 화면이 "연결을 끊어도 파일은 그대로 남습니다"라고 약속한 것과
 * 같은 태도다. 우리가 만든 파일이라도 우리가 말없이 지우지 않는다.
 */
export async function detachSourceFile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const fileId = z.uuid().safeParse(formValue(formData.get("fileId")));
  const sourceId = z.uuid().safeParse(formValue(formData.get("sourceId")));

  if (!fileId.success || !sourceId.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  // RLS가 내 행만 지우게 한다. 남의 행은 0행이 지워진다.
  const { data, error } = await supabase
    .from("source_files")
    .delete()
    .eq("id", fileId.data)
    .select("id");

  if (error) {
    console.error("[ThreadMark] 첨부 해제 실패:", error.message);
    redirectWithQuery(`/sources/${sourceId.data}`, {
      error: "첨부를 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (!data || data.length === 0) {
    redirectWithQuery(`/sources/${sourceId.data}`, {
      error: "파일을 찾을 수 없습니다.",
    });
  }

  revalidatePath(`/sources/${sourceId.data}`);
  redirectWithQuery(`/sources/${sourceId.data}`, {
    notice: "첨부를 해제했습니다. Drive의 파일은 그대로 있습니다.",
  });
}

/**
 * 끝나지 않은 업로드 기록을 정리한다.
 *
 * 설계 문서 10.3절: 업로드 도중 실패한 DB 레코드를 정리하는 작업을 둔다.
 *
 * 지우는 것은 DB 기록뿐이다. Drive 파일은 건드리지 않는다.
 * 자리만 잡고 끝난 업로드는 Drive에 파일을 만들지 않으므로 대개 남는 것이 없다.
 * 다만 파일이 다 올라간 직후에 브라우저가 멈춘 경우에는 Drive에 파일이 남는다.
 * 그것이 어느 파일인지 우리는 알 수 없으므로 지우지 않는다. 모르면 건드리지 않는다.
 *
 * 오래된 것만 지운다. 지금 올라가는 중인 업로드를 정리해 버리면,
 * 다 올린 뒤에 기록할 자리가 사라져 그 업로드가 통째로 버려진다.
 */
export async function cleanupStaleUploads(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const sourceId = z.uuid().safeParse(formValue(formData.get("sourceId")));

  if (!sourceId.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const cutoff = new Date(
    Date.now() - STALE_PENDING_MINUTES * 60 * 1000,
  ).toISOString();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_files")
    .delete()
    .eq("source_id", sourceId.data)
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[ThreadMark] 업로드 기록 정리 실패:", error.message);
    redirectWithQuery(`/sources/${sourceId.data}`, {
      error: "정리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(`/sources/${sourceId.data}`);
  redirectWithQuery(`/sources/${sourceId.data}`, {
    notice: `끝나지 않은 업로드 기록 ${data?.length ?? 0}건을 정리했습니다.`,
  });
}
