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
  /** 전사문이 나온 파일. 파일을 떼면 비워진다. */
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
 * 자료 하나의 음성 정보를 가져온다. 아직 없으면 null이다.
 *
 * **없는 것이 고장이 아니다.** 녹음을 담기만 하고 아무것도 적지 않은
 * 자료가 보통이다. 화면이 그 경우를 빈 자리로 그린다.
 */
export async function getAudioProfile(
  sourceId: string,
): Promise<AudioProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audio_profiles")
    .select(COLUMNS)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 음성 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    sourceFileId: data.source_file_id,
    transcriptChecksum: data.transcript_checksum,
    transcript: data.transcript,
    durationSeconds: data.duration_seconds,
    verificationStatus: data.verification_status,
    voiceScope: data.voice_scope,
    updatedAt: data.updated_at,
  };
}
