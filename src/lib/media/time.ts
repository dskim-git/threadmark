/**
 * 재생 시점을 읽고 적는다. (설계 문서 13.4절, 14절)
 *
 * **음악과 영상이 함께 쓴다.** 처음에는 `music/time.ts`였는데, YouTube
 * 기록도 똑같이 "몇 초인가"를 다루게 되어 옮겼다. (15-E-2b-2)
 *
 * 이 모듈에는 음악에만 해당하는 것이 하나도 없었다. **같은 뜻의 것을 두 벌
 * 만들면 한쪽만 고쳐진다.** `1:08`을 읽는 규칙이 음악과 영상에서 달라질
 * 이유가 없다.
 *
 * 13.4절의 예가 이 모듈이 다루는 것이다.
 *
 *   01:08–01:34 / 2절 후렴
 *
 * 사람은 `1:08`이라고도 치고 `01:08`이라고도 치고 `68`이라고도 친다.
 * 한 시간이 넘는 실황 녹음에서는 `1:05:30`이 온다. 셋 다 같은 뜻으로 읽고,
 * 보여줄 때는 한 가지 모양으로 통일한다.
 *
 * **초로 담는다.** 글자로 담으면 `1:08`과 `01:08`이 다른 값이 되어 정렬도
 * 비교도 안 된다. 담는 것은 숫자이고, 사람이 보는 모양은 여기서 만든다.
 * 태그의 이름과 판정값을 나눈 것과 같은 생각이다. (설계 문서 20-1절)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 담을 수 있는 가장 긴 시점.
 *
 * 24시간이다. 음악 한 곡에는 터무니없이 길지만, 실황 전체나 긴 강연 녹음을
 * 담을 수도 있다. 막는 목적은 잘못 친 값(`99999999`)을 거르는 것이지
 * 긴 녹음을 막는 것이 아니다.
 */
export const MAX_POSITION_SECONDS = 24 * 60 * 60;

/**
 * 사람이 친 시점을 초로 바꾼다. 읽을 수 없으면 null이다.
 *
 * 받아들이는 모양
 *
 *   68        초만
 *   1:08      분:초
 *   01:08     앞자리 0이 붙어도 같다
 *   1:05:30   시:분:초
 *
 * 분과 초가 60을 넘으면 받지 않는다. `1:75`는 `2:15`를 뜻할 수도 있고
 * 잘못 친 것일 수도 있는데, **우리가 고쳐서 담으면 사용자가 친 것과 담긴
 * 것이 달라진다.** 무엇을 뜻했는지 물을 수 없으면 받지 않는 편이 낫다.
 * 초만 적은 `75`는 다르다. 그것은 모양이 다르므로 뜻이 분명하다.
 */
export function parsePosition(input: unknown): number | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parts = trimmed.split(":");

  if (parts.length > 3) {
    return null;
  }

  const numbers: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,7}$/u.test(part.trim())) {
      return null;
    }

    numbers.push(Number(part.trim()));
  }

  let seconds: number;

  if (numbers.length === 1) {
    // 초만 적은 것. 60을 넘어도 뜻이 분명하다.
    seconds = numbers[0];
  } else if (numbers.length === 2) {
    if (numbers[1] > 59) {
      return null;
    }

    seconds = numbers[0] * 60 + numbers[1];
  } else {
    if (numbers[1] > 59 || numbers[2] > 59) {
      return null;
    }

    seconds = numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  }

  return seconds <= MAX_POSITION_SECONDS ? seconds : null;
}

/**
 * 초를 사람이 보는 모양으로 바꾼다.
 *
 * 한 시간이 넘으면 `1:05:30`, 아니면 `01:08`이다. 한 시간이 안 되는데
 * `00:01:08`로 적으면 앞의 `00:`이 늘 자리만 차지한다.
 *
 * 분은 두 자리로 맞춘다. `1:08`과 `01:08`이 목록에서 섞이면 자릿수가 들쭉날쭉해
 * 읽기 어렵다.
 */
export function formatPosition(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`;
}

/**
 * 구간을 한 줄로 적는다. (13.4절의 `01:08–01:34`)
 *
 * 끝이 없으면 한 시점만 적는다. "여기부터"가 아니라 "이 순간"을 가리키는
 * 메모도 있다. 끝을 억지로 채우면 없는 정보를 지어내는 셈이다.
 *
 * 가운데 글자는 붙임표(-)가 아니라 en dash(–)다. 범위를 적는 글자이고,
 * 13.4절의 예가 그렇게 적혀 있다.
 */
export function formatRange(
  startSeconds: number,
  endSeconds?: number | null,
): string {
  const start = formatPosition(startSeconds);

  if (endSeconds === undefined || endSeconds === null) {
    return start;
  }

  return `${start}–${formatPosition(endSeconds)}`;
}

export type RangeCheck =
  | { ok: true; startSeconds: number; endSeconds: number | null }
  | { ok: false; message: string };

/**
 * 사람이 친 시작과 끝을 확인한다.
 *
 * 끝이 시작보다 앞이면 받지 않는다. 담고 나면 화면에 `01:34–01:08`로
 * 보이는데, 그것이 잘못 친 것인지 거꾸로 적는 뜻이 있는 것인지 나중에는
 * 알 수 없다.
 *
 * 끝은 비워도 된다. 시작만 있으면 그 순간을 가리키는 메모다.
 */
export function checkRange(start: unknown, end: unknown): RangeCheck {
  const startSeconds = parsePosition(start);

  if (startSeconds === null) {
    return {
      ok: false,
      message: "시점을 `1:08`이나 `68`처럼 적어 주세요.",
    };
  }

  const endText = typeof end === "string" ? end.trim() : "";

  if (endText.length === 0) {
    return { ok: true, startSeconds, endSeconds: null };
  }

  const endSeconds = parsePosition(endText);

  if (endSeconds === null) {
    return {
      ok: false,
      message: "끝 시점을 `1:34`처럼 적거나 비워 주세요.",
    };
  }

  if (endSeconds < startSeconds) {
    return {
      ok: false,
      message: "끝 시점이 시작보다 앞입니다.",
    };
  }

  return { ok: true, startSeconds, endSeconds };
}
