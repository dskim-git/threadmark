/**
 * 전사문과 녹음 정보의 순수 판단. (설계 문서 17절, 17-V 4차례, 2026-10-04)
 *
 * **브라우저도 데이터베이스도 모른다.** 담아도 되는 모양인지만 정한다.
 * `recording.ts`가 녹음 쪽에서 같은 자리를 맡고 있고, 그 까닭은 2차례에서
 * 배운 것이다. 검사가 불러올 수 없는 파일에 판단을 두면 그 판단은
 * 검사되지 않는다.
 *
 * 여기서 틀리면 조용하다
 *   - 길이가 터무니없이 들어오면 **데이터베이스가 거부해 전사문까지 통째로
 *     저장되지 않는다.** 길이 하나 때문에 한 시간 적은 글을 잃는다
 *   - 목소리 범위를 못 알아보면 **비어 있는 것으로 담기고**, 그러면
 *     영원히 공개할 수 없는 녹음이 된다 (17-V.3절)
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import { MAX_POSITION_SECONDS } from "../media/time.ts";

/**
 * 전사문의 길이 한계. 10만 자다.
 *
 * `captures`의 2만 자로는 **15분쯤이면 찬다.** 한 시간짜리 강의 녹음이
 * 흔하고 그것을 다 옮기면 수만 자가 된다.
 *
 * **마이그레이션의 제약과 같은 숫자여야 한다.** 어긋나면 입력은 되는데
 * 저장이 안 되는 글이 생긴다. (`project-use-fields.ts`가 같은 말을 적었다)
 */
export const MAX_TRANSCRIPT_LENGTH = 100000;

/** 누구의 목소리가 담겼는가. 데이터베이스의 `audio_voice_scope`와 같다. */
export const VOICE_SCOPES = ["self_only", "others_included"] as const;

export type VoiceScope = (typeof VOICE_SCOPES)[number];

const VOICE_SCOPE_LABELS: Record<VoiceScope, string> = {
  self_only: "내 목소리만",
  others_included: "다른 분의 목소리도 담김",
};

/**
 * 고를 때 함께 보여줄 말.
 *
 * **고르는 자리에서 동의를 상기시킨다.** 안내문을 따로 띄우는 것보다
 * 고르는 그 순간에 붙어 있는 편이 읽힌다. (17-V.5절)
 */
const VOICE_SCOPE_HINTS: Record<VoiceScope, string> = {
  self_only: "혼자 말한 것을 남긴 녹음입니다.",
  others_included:
    "수업이나 면담처럼 다른 분이 말한 것이 담긴 녹음입니다. 미리 동의를 받으셔야 합니다.",
};

export function isVoiceScope(value: unknown): value is VoiceScope {
  return (
    typeof value === "string" &&
    (VOICE_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * 담긴 값을 사람이 보는 말로. **모르면 `null`이다.**
 *
 * `안 밝힘`이라고 적지 않는다. 그렇게 적으면 정해야 할 일처럼 보이는데,
 * 혼자 쓰는 녹음에는 이 구분이 쓸모없을 수 있다. 장소의
 * `getPlaceVisitStatusLabel`이 같은 판단을 했다.
 */
export function getVoiceScopeLabel(value: unknown): string | null {
  return isVoiceScope(value) ? VOICE_SCOPE_LABELS[value] : null;
}

export function getVoiceScopeHint(value: VoiceScope): string {
  return VOICE_SCOPE_HINTS[value];
}

/**
 * 밝히지 않은 녹음은 공개할 수 없다. (17-V.3절)
 *
 * **지금은 전사문이 통째로 공개되지 않으므로 아무 데도 쓰이지 않는다.**
 * 그래도 둔다. 나중에 공개를 열 때 **이 판단이 어디에 있었는지 찾게 되고**,
 * 그때 각 화면이 저마다 `=== "self_only"`를 적으면 한 곳만 고쳐진다.
 *
 * 모르면 거부한다. (보안 원칙 7)
 */
export function mayEverBePublic(value: unknown): boolean {
  return value === "self_only";
}

/** 담아도 되는 길이인가. */
export type DurationCheck =
  | { ok: true; seconds: number | null }
  | { ok: false; message: string };

/**
 * 브라우저가 알려준 길이를 담을 수 있는 값으로 바꾼다.
 *
 * **내림해서 정수로 만든다.** 브라우저는 `187.432`처럼 준다. 칸이 정수라
 * 그대로 보내면 데이터베이스가 거부하고, **그러면 전사문까지 통째로
 * 저장되지 않는다.**
 *
 * 1초를 밑도는 녹음은 0이 된다. 그것도 받는다. 실수로 눌렀다 뗀 녹음이
 * 실제로 생기고, 그 녹음에도 메모를 달 수 있어야 한다.
 *
 * `Infinity`가 오는 경우가 있다. 어떤 형식은 끝까지 받기 전에는 길이를
 * 모른다. **모르는 것은 비워 둔다.** 0으로 적으면 "길이 0인 녹음"이라는
 * 거짓말이 담긴다.
 */
export function toStoredDuration(value: unknown): DurationCheck {
  if (value === null || value === undefined || value === "") {
    return { ok: true, seconds: null };
  }

  const number = typeof value === "string" ? Number(value) : value;

  if (typeof number !== "number" || !Number.isFinite(number)) {
    // 모르는 것은 비워 둔다. 고장이 아니다.
    return { ok: true, seconds: null };
  }

  if (number < 0) {
    return { ok: false, message: "녹음 길이를 확인할 수 없습니다." };
  }

  const seconds = Math.floor(number);

  if (seconds > MAX_POSITION_SECONDS) {
    return {
      ok: false,
      message: "녹음 길이가 24시간을 넘습니다. 값을 확인해 주세요.",
    };
  }

  return { ok: true, seconds };
}

/** 담아도 되는 전사문인가. */
export type TranscriptCheck =
  | { ok: true; transcript: string | null }
  | { ok: false; message: string };

/**
 * 적은 전사문을 담을 수 있는 값으로 바꾼다.
 *
 * **빈 글은 `null`로 담는다.** 빈 글자와 `null`이 섞이면 "적었는데 비운
 * 것"과 "아직 안 적은 것"을 가릴 수 없다. 마이그레이션의
 * `audio_profiles_checksum_needs_transcript`도 `null`을 기준으로 본다.
 *
 * 앞뒤 공백만 덜어낸다. **가운데는 건드리지 않는다.** 말을 옮긴 글에는
 * 단락과 들여쓰기가 뜻을 가진다. 누가 말했는지를 줄 앞에 적는 일이 흔하다.
 */
export function toStoredTranscript(value: unknown): TranscriptCheck {
  if (value === null || value === undefined) {
    return { ok: true, transcript: null };
  }

  if (typeof value !== "string") {
    return { ok: false, message: "전사문을 확인할 수 없습니다." };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { ok: true, transcript: null };
  }

  if (trimmed.length > MAX_TRANSCRIPT_LENGTH) {
    return {
      ok: false,
      message: `전사문은 ${MAX_TRANSCRIPT_LENGTH.toLocaleString("ko-KR")}자를 넘을 수 없습니다.`,
    };
  }

  return { ok: true, transcript: trimmed };
}

/**
 * 전사문이 가리키는 파일이 그대로인가. (설계 문서 9.2절)
 *
 * **담을 때의 checksum과 지금 파일의 checksum을 견준다.** 다르면 그 전사문은
 * **다른 녹음의 것**이다. 16-2가 그림 상자에 같은 장치를 둔 것과 같고,
 * 오류는 나지 않는다.
 *
 * 둘 중 하나라도 모르면 **낡았다고 말하지 않는다.** Drive가 md5를 주지 않는
 * 파일이 있고, 전사문을 적을 때 파일이 떨어져 있었을 수도 있다.
 * **모르는 것을 아는 척하지 않는다.** 여기서는 거부가 아니라 침묵이 맞다.
 * 틀린 경고는 사람이 멀쩡한 글을 지우게 만든다.
 */
export function transcriptIsStale(options: {
  storedChecksum: string | null;
  fileChecksum: string | null;
}): boolean {
  if (options.storedChecksum === null || options.fileChecksum === null) {
    return false;
  }

  return options.storedChecksum !== options.fileChecksum;
}
