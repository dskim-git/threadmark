"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import {
  isVoiceScope,
  toStoredDuration,
  toStoredTranscript,
} from "@/lib/audio/transcript";
import { formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 음성 자료의 전사문과 녹음 정보. (설계 문서 17절, 17-V 4차례)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. audio_profiles 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 *
 * **무엇을 담아도 되는지는 여기서 정하지 않는다.** `lib/audio/transcript.ts`가
 * 한다. 브라우저도 데이터베이스도 모르는 순수 판단이라 단위 검사로 본다.
 */

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

export async function saveAudioProfile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const returnTo = sanitizeNextPath(formValue(formData.get("returnTo")));
  const sourceId = formValue(formData.get("sourceId"));

  if (!sourceId) {
    redirectWithQuery(returnTo, { error: "잘못된 요청입니다." });
  }

  const transcript = toStoredTranscript(formValue(formData.get("transcript")));

  if (!transcript.ok) {
    redirectWithQuery(returnTo, { error: transcript.message });
  }

  const duration = toStoredDuration(formValue(formData.get("durationSeconds")));

  if (!duration.ok) {
    redirectWithQuery(returnTo, { error: duration.message });
  }

  const scopeInput = formValue(formData.get("voiceScope"));
  const voiceScope = isVoiceScope(scopeInput) ? scopeInput : null;

  /*
    **전사문이 있을 때만 그 출처를 적는다.**

    마이그레이션의 `audio_profiles_checksum_needs_transcript`가 같은 것을
    본다. checksum만 남아 있으면 "그 파일에서 뽑은 무언가가 있었다"는
    말이 되는데 그런 것이 없다.
  */
  const fileId = formValue(formData.get("sourceFileId"));
  const checksum = formValue(formData.get("fileChecksum"));

  /*
    **어느 파일의 전사문인지 없으면 담지 않는다.** (2026-10-05)

    처음에는 자료 하나에 한 줄이라 파일이 없어도 담을 수 있었다. 이제
    파일이 줄을 가리므로, 파일 없이 담으면 **가리킬 자리가 없는 줄**이
    쌓이고 그것은 화면에 보이지도 않는다.
  */
  if (!fileId) {
    redirectWithQuery(returnTo, {
      error: "어느 녹음의 전사문인지 알 수 없습니다. 자료에 녹음 파일을 먼저 붙여 주세요.",
    });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("audio_profiles").upsert(
    {
      source_id: sourceId,
      source_file_id: fileId,
      transcript: transcript.transcript,
      transcript_checksum:
        transcript.transcript === null ? null : (checksum ?? null),
      duration_seconds: duration.seconds,
      voice_scope: voiceScope,
      /*
        **확인 상태는 건드리지 않는다.** 지금은 사람이 적는 길뿐이라 늘
        `user_written`이다. AI 전사가 오면 그쪽이 `machine_generated`로
        담고, 사람이 이 폼에서 고치면 그때 `user_edited`로 올려야 한다.

        그 판단을 지금 적어두면 **아직 없는 기능을 전제한 코드**가 된다.
        17-V.6절이 미룬 자리다.
      */
    },
    /*
      **파일마다 하나다.** (2026-10-05) 자료 단위로 묶어두었더니, 한 자료에
      녹음이 여럿일 때 두 번째에 적으면 첫 번째가 덮였다. 오류가 나지 않아
      적은 사람은 앞의 것이 사라진 줄 몰랐다.
    */
    { onConflict: "source_file_id" },
  );

  if (error) {
    console.error("[ThreadMark] 음성 정보 저장 실패:", error.message);

    redirectWithQuery(returnTo, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(`/sources/${sourceId}`);
  redirect(returnTo);
}

/**
 * 녹음을 저장한 직후에 길이와 목소리 범위를 담는다. (17-V.5절)
 *
 * **녹음 화면이 부른다.** 그 자리가 동의 안내가 떠 있는 자리이고, 길이도
 * 거기서만 안다. 나중에 자료 화면에서 되물으면 **그때는 기억나지 않는다.**
 *
 * 전사문은 건드리지 않는다. 아직 적지 않았다.
 */
export async function saveRecordingFacts(input: {
  sourceId: string;
  sourceFileId: string;
  durationSeconds: number;
  voiceScope: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireActiveAccount();

  const duration = toStoredDuration(input.durationSeconds);

  if (!duration.ok) {
    return { ok: false, message: duration.message };
  }

  if (!isVoiceScope(input.voiceScope)) {
    return { ok: false, message: "누구의 목소리인지 골라 주세요." };
  }

  const supabase = await createClient();

  /*
    **전사문을 비우지 않는다.** 같은 자료에 녹음을 다시 담는 일이 있고,
    그때 앞서 적어둔 전사문까지 지워지면 되살릴 길이 없다. 그래서 담는
    칸을 셋으로 좁힌다.

    `onConflict`로 **파일 하나에 한 줄**을 지킨다. 표의 unique와 같은 자리다.
  */
  const { error } = await supabase.from("audio_profiles").upsert(
    {
      source_id: input.sourceId,
      source_file_id: input.sourceFileId,
      duration_seconds: duration.seconds,
      voice_scope: input.voiceScope,
    },
    // 파일마다 하나다. 위와 같은 까닭이다. (2026-10-05)
    { onConflict: "source_file_id" },
  );

  if (error) {
    console.error("[ThreadMark] 녹음 정보 저장 실패:", error.message);

    return {
      ok: false,
      message: "녹음은 저장했지만 길이와 목소리 범위를 남기지 못했습니다.",
    };
  }

  revalidatePath(`/sources/${input.sourceId}`);

  return { ok: true };
}
