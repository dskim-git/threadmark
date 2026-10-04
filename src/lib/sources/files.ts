import { requireActiveAccount } from "@/lib/auth/account";
import { isStalePending } from "@/lib/drive/upload";
import { createClient } from "@/lib/supabase/server";

/**
 * 자료에 붙은 Drive 파일 조회.
 *
 * 다른 조회 계층과 같은 규칙을 따른다. 먼저 승인된 계정인지 확인하고,
 * 화면이 이미 확인했으리라 가정하지 않는다. (설계 문서 2.3절, 보안 원칙 5)
 *
 * 여기서는 사용자 세션 클라이언트를 쓴다. source_files는 RLS가 지키므로
 * service role이 필요 없다. Drive 토큰을 읽어야 하는 쪽만 그 클라이언트를 쓴다.
 */

const FILE_COLUMNS =
  "id, source_id, status, origin, file_name, mime_type, byte_size, drive_file_id, checksum, drive_modified_at, last_verified_at, created_at, last_page, last_zoom";

export type SourceFileItem = {
  id: string;
  status: "pending" | "ready" | "missing";
  fileName: string;
  mimeType: string;
  byteSize: number;
  driveFileId: string | null;
  checksum: string | null;
  driveModifiedAt: string | null;
  /** 마지막으로 Drive에 물어본 시각. 없으면 아직 확인한 적이 없다. */
  lastVerifiedAt: string | null;
  createdAt: string;
  /** 업로드가 끝나지 않은 채 오래 남아 있는가. 정리 안내를 띄우는 데 쓴다. */
  stale: boolean;
  /** 마지막으로 보던 페이지. 없으면 1쪽에서 시작한다. (설계 문서 9.1절) */
  lastPage: number | null;
  /** 마지막 확대율. 없으면 화면 너비에 맞춘다. */
  lastZoom: number | null;
};

/*
  파일 갈래를 가리는 순수 판단은 `file-kinds.ts`로 떼어냈다. (17-V 2차례)

  **이 파일은 서버 전용 모듈을 가져온다.** 그래서 여기 있는 동안 그 판단을
  단위 검사로 불러올 수 없었고, `isReadable`에 검사가 하나도 없었다.
  틀려도 오류가 나지 않는 자리라 더 나빴다.

  불러 쓰는 쪽은 고치지 않았다. 여기서 그대로 다시 내보낸다.
*/
export {
  isAudioFile,
  isImageFile,
  isOpenable,
  isPdfFile,
  isReadable,
} from "./file-kinds";

/**
 * 한 자료에 붙은 파일을 오래된 순으로 돌려준다.
 *
 * 최신순이 아닌 이유는, 파일이 여러 개일 때 대개 먼저 올린 것이 본문이고
 * 나중 것이 부록이기 때문이다. 올린 순서대로 보이는 편이 읽기 쉽다.
 */
export async function listSourceFiles(
  sourceId: string,
): Promise<SourceFileItem[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_files")
    .select(FILE_COLUMNS)
    .eq("source_id", sourceId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 파일 목록 조회 실패:", error.message);

    return [];
  }

  const now = new Date();

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    driveFileId: row.drive_file_id,
    checksum: row.checksum,
    driveModifiedAt: row.drive_modified_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    stale: row.status === "pending" && isStalePending(row.created_at, now),
    lastPage: row.last_page,
    lastZoom: row.last_zoom,
  }));
}

/**
 * 파일 하나를 가져온다. 없거나 내 것이 아니면 null이다.
 *
 * 뷰어 화면이 쓴다. 남의 파일을 요청했을 때 "없음"과 "권한 없음"을
 * 구분하지 않는다. 구분하면 어떤 id가 존재하는지 알려주는 셈이 된다.
 */
export async function getSourceFileById(
  id: string,
): Promise<SourceFileItem | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_files")
    .select(FILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 파일 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    status: data.status,
    fileName: data.file_name,
    mimeType: data.mime_type,
    byteSize: data.byte_size,
    driveFileId: data.drive_file_id,
    checksum: data.checksum,
    driveModifiedAt: data.drive_modified_at,
    lastVerifiedAt: data.last_verified_at,
    createdAt: data.created_at,
    stale:
      data.status === "pending" && isStalePending(data.created_at, new Date()),
    lastPage: data.last_page,
    lastZoom: data.last_zoom,
  };
}
