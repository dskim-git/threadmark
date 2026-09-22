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
  "id, source_id, status, origin, file_name, mime_type, byte_size, drive_file_id, checksum, drive_modified_at, created_at";

export type SourceFileItem = {
  id: string;
  status: "pending" | "ready";
  fileName: string;
  mimeType: string;
  byteSize: number;
  driveFileId: string | null;
  checksum: string | null;
  driveModifiedAt: string | null;
  createdAt: string;
  /** 업로드가 끝나지 않은 채 오래 남아 있는가. 정리 안내를 띄우는 데 쓴다. */
  stale: boolean;
};

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
    createdAt: row.created_at,
    stale: row.status === "pending" && isStalePending(row.created_at, now),
  }));
}
