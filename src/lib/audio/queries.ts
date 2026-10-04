import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 음성 자료의 전사문 조회. (설계 문서 17절, 17-V 4차례)
 *
 * 다른 조회 계층과 같은 규칙을 따른다. 먼저 승인된 계정인지 확인하고,
 * 화면이 이미 확인했으리라 가정하지 않는다. (설계 문서 2.3절, 보안 원칙 5)
 *
 * 사용자 세션 클라이언트를 쓴다. `audio_profiles`는 RLS가 지키므로
 * service role이 필요 없다.
 */

export type AudioProfile = {
  /**
   * 전사문이 나온 파일. 파일을 떼면 비워진다.
   *
   * **이 값이 줄을 가린다.** 파일마다 많아야 하나다.
   */
  sourceFileId: string | null;
  /** 그 시점 파일의 md5. 파일이 교체되었는지 아는 데 쓴다. */
  transcriptChecksum: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  /** 누가 쓴 글인가. `captures`와 같은 갈래다. */
  verificationStatus: "user_written" | "machine_generated" | "user_edited";
  /** 누구의 목소리인가. 비어 있으면 모른다. */
  voiceScope: "self_only" | "others_included" | null;
  updatedAt: string;
};

const COLUMNS =
  "source_file_id, transcript_checksum, transcript, duration_seconds, verification_status, voice_scope, updated_at";

/**
 * 자료 하나에 담긴 **파일마다의** 음성 정보를 파일 번호로 찾아 돌려준다.
 *
 * **처음에는 자료 하나에 한 줄이었다.** (2026-10-04) 한 자료에 녹음이
 * 여럿일 때 **두 번째 녹음에 적으면 첫 번째 것이 덮였다.** 오류가 나지
 * 않아서 적은 사람은 앞의 것이 사라진 줄 몰랐다. 사용자가 쓰다가 찾았다.
 *
 * 블루프린트 17-V.2절이 그 전제와 나갈 길을 함께 적어 두었고 그대로 했다.
 *
 * 없는 것이 고장이 아니다. 녹음을 담기만 하고 아무것도 적지 않은 자료가
 * 보통이다. 화면이 그 경우를 빈 자리로 그린다.
 *
 * **파일이 떨어진 줄은 돌려주지 않는다.** 가리킬 파일이 없어 화면에 놓을
 * 자리가 없다. 담긴 글은 그대로 남아 있고, 파일을 다시 이으면 돌아온다.
 */
export async function getAudioProfiles(
  sourceId: string,
): Promise<Map<string, AudioProfile>> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audio_profiles")
    .select(COLUMNS)
    .eq("source_id", sourceId);

  if (error) {
    console.error("[ThreadMark] 음성 정보 조회 실패:", error.message);

    return new Map();
  }

  const byFile = new Map<string, AudioProfile>();

  for (const row of data ?? []) {
    if (row.source_file_id === null) {
      continue;
    }

    byFile.set(row.source_file_id, {
      sourceFileId: row.source_file_id,
      transcriptChecksum: row.transcript_checksum,
      transcript: row.transcript,
      durationSeconds: row.duration_seconds,
      verificationStatus: row.verification_status,
      voiceScope: row.voice_scope,
      updatedAt: row.updated_at,
    });
  }

  return byFile;
}
