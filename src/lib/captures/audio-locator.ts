import { z } from "zod";

/*
  상대 경로에 확장자를 붙인다. Node 테스트 러너는 `@/` 별칭을 모르고
  확장자도 요구한다. 순수 모듈끼리는 이렇게 잇는다. (AGENTS.md 6절)
*/
import { MAX_POSITION_SECONDS, formatRange } from "../media/time.ts";

/**
 * 음성에서 남긴 기록의 자리. (설계 문서 17-4절, 2026-10-04, 사용자 요청)
 *
 * > 음성을 들으면서 지점을 멈추면 그 지점의 위치가 나오면서 그 위치에
 * > 메모를 기록하게 연결하는거지. 마찬가지로 구간반복(또는 구간 설정)의
 * > 기능도 만들어서 그 구간에 대해 메모를 기록하도록 연결하는 기능도
 * > 있으면 좋겠어. (마치 pdf에서 페이지의 위치에 기록을 남기는 것처럼)
 *
 * **마이그레이션이 없다.** `captures.locator`가 jsonb라 갈래를 하나 더하는
 * 것으로 끝난다. 16-2(그림의 한 부분)가 같은 길이었다.
 *
 * 만들기 전에 세어 보니 거의 다 있었다
 *   `music-locator.ts`가 **이미 시점과 구간을 담고 있었다.** 13.4절의
 *   `01:08–01:34 / 2절 후렴`이 그것이다. 시간을 읽고 적는 일은
 *   `media/time.ts`가 음악과 영상을 위해 벌써 하고 있었다.
 *
 *   그래서 이 모듈이 새로 정하는 것은 **어느 파일의 몇 초인가**뿐이다.
 *
 * 왜 `music-time`을 같이 쓰지 않는가
 *   값의 모양이 거의 같아서 그러고 싶어진다. 16-2가 `pdf-page`를 같이 쓰지
 *   않은 것과 같은 까닭으로 나눈다.
 *
 *   **음악 기록에는 파일이 없다.** 음악은 곡의 시점을 적는 일이고 들을
 *   파일이 우리에게 없다. 음성은 **Drive에 있는 그 파일의 몇 초**다.
 *   그리고 기록 목록에서 `03:20`이라고 적힌 것이 음악인지 녹음인지 가릴 수
 *   없게 되고, 되짚어 가는 화면도 다르다.
 *
 * 왜 시점과 구간을 한 갈래로 두는가
 *   그림은 `image-page`와 `image-region`으로 **갈랐다.** 목록에서 둘 다
 *   `3장`으로 보여서 가릴 수 없었기 때문이다.
 *
 *   음성은 다르다. `03:20`과 `03:20–04:10`은 **적힌 글자가 이미 다르다.**
 *   갈래를 나누지 않아도 보는 사람이 구분한다. 음악이 같은 판단을 했고
 *   (`endSeconds`를 비워 두는 것으로) 그것이 잘 돌고 있다.
 *
 * 이 파일은 `zod`와 시간 모듈만 쓴다. 데이터베이스와 화면을 모른다.
 */

export const AUDIO_TIME_KIND = "audio-time";

/**
 * 구간의 가장 짧은 길이. 1초다.
 *
 * **16-2의 `MIN_REGION_SIZE`와 같은 생각이다.** 거기서는 크기 0인 상자가
 * "보이지 않으면서 `한 부분`이라고 적힌다"고 했다. 여기도 같다.
 * `03:20–03:20`은 **구간이라고 적혀 있으면서 아무 길이도 없다.** 반복을
 * 걸면 그 자리에서 제자리걸음을 한다.
 *
 * 시작과 끝을 같은 자리에 찍었다면 그것은 **시점**이다. 구간인 척하지
 * 않는다.
 */
export const MIN_AUDIO_RANGE_SECONDS = 1;

export const audioTimeLocatorSchema = z
  .object({
    kind: z.literal(AUDIO_TIME_KIND),

    /**
     * 어느 파일인지. **이 값 하나가 녹음을 가린다.**
     *
     * 16-1에서 그림의 `몇 번째 장인지`를 담지 않은 것과 달리 여기서는 파일
     * 번호를 담는다. 번호가 아니라 **지워지기 전까지 변하지 않는 식별자**라
     * 밀릴 일이 없다. 16-2의 영역 기록도 같은 값을 담는다.
     */
    sourceFileId: z.uuid(),

    /**
     * 그 시점 파일의 md5Checksum.
     *
     * 파일이 교체되면 값이 달라진다. **그러면 `03:20`이 다른 말을 가리킨다.**
     * 그림의 상자가 다른 자리를 가리키게 되는 것과 같고, 오류는 나지 않는다.
     * (설계 문서 9.2절) 바이너리가 아닌 파일에는 값이 없어 null을 허용한다.
     */
    fileChecksum: z.string().max(128).nullable(),

    /**
     * 시작 시점(초).
     *
     * **글자가 아니라 초로 담는다.** `3:20`과 `03:20`이 같은 값이어야 정렬도
     * 비교도 된다. 사람이 보는 모양은 `media/time.ts`가 만든다.
     *
     * 그림과 달리 **상대값(0~1)으로 담지 않는다.** 그림을 상대값으로 담은
     * 까닭은 같은 그림을 여러 크기로 보기 때문인데, **소리에는 그런 일이
     * 없다.** 화면이 넓든 좁든 `3분 20초`는 같은 자리다.
     *
     * 그리고 소리에서 비율은 뜻이 없다. 그림의 `가운데`는 어느 그림에서나
     * 가운데지만, **소리의 50%는 전혀 다른 말이다.** `3분 20초`는 사람이
     * 읽을 수 있고 비율은 읽을 수 없다.
     */
    startSeconds: z.number().int().min(0).max(MAX_POSITION_SECONDS),

    /**
     * 끝 시점(초). 없으면 **그 순간**을 가리키는 메모다.
     *
     * 음악과 같은 판단이다. 없는 값을 시작과 같게 채워 넣지 않는다. 그러면
     * "한 순간을 가리킨 것"과 "길이가 0인 구간"을 나중에 구분할 수 없다.
     */
    endSeconds: z
      .number()
      .int()
      .min(0)
      .max(MAX_POSITION_SECONDS)
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.endSeconds === undefined ||
      value.endSeconds === null ||
      value.endSeconds >= value.startSeconds + MIN_AUDIO_RANGE_SECONDS,
    {
      message: "구간이 너무 짧습니다. 끝을 시작보다 1초 이상 뒤에 두세요.",
    },
  );

export type AudioTimeLocator = z.infer<typeof audioTimeLocatorSchema>;

/**
 * 담긴 값에서 음성 자리를 읽는다. **모르는 모양은 null이다.**
 *
 * `locator`는 jsonb라 무엇이든 들어갈 수 있다. PDF나 음악의 자리가 여기로
 * 들어와도 `kind`가 달라 걸러진다.
 *
 * **거꾸로 된 구간과 너무 짧은 구간도 걸러진다.** 화면에서 막지만 예전
 * 값이나 다른 길로 들어온 값이 있을 수 있고, 그대로 그리면 `04:10–03:20`이
 * 된다. (음악 쪽에서 같은 자리를 막아 두었다)
 */
export function parseAudioTimeLocator(value: unknown): AudioTimeLocator | null {
  const parsed = audioTimeLocatorSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * 사람이 읽을 말로. `03:20` 또는 `03:20–04:10`
 *
 * 시간을 적는 일은 `media/time.ts`의 `formatRange`가 한다. **음악과 영상이
 * 쓰는 것을 그대로 쓴다.** 녹음의 `3분 20초`가 음악의 `3분 20초`와 다르게
 * 보일 이유가 없다.
 */
export function describeAudioTime(locator: AudioTimeLocator): string {
  return formatRange(locator.startSeconds, locator.endSeconds ?? null);
}

/**
 * 구간인가. 시점인가.
 *
 * 화면이 갈리는 자리라 이름을 붙여 둔다. 구간이면 반복을 걸 수 있고
 * 시점이면 그 자리로 옮기기만 한다.
 */
export function isAudioRange(locator: AudioTimeLocator): boolean {
  return locator.endSeconds !== undefined && locator.endSeconds !== null;
}

/**
 * 자리를 주소에 실어 보내는 글자.
 *
 * **왜 주소에 싣는가.** 기록 목록의 `03:20으로`를 누르면 그 파일이 열리는데,
 * **그 자리로 가 있지 않으면 누른 뜻이 없다.** 처음부터 다시 들으며 찾게
 * 된다. 16-2에서 상자를 주소에 실은 것과 같은 자리다.
 *
 * `시작` 또는 `시작-끝` 모양이다. 칸을 둘로 나누지 않고 하나에 담는 까닭은
 * 읽고 쓰는 자리가 한 곳이면 어긋날 자리도 한 곳이어서다.
 *
 * **초는 정수다.** 소수점을 담지 않는다. 사람이 `3분 20.37초`를 가리키려고
 * 하지 않고, 재생기도 그만큼 정확히 멈추지 못한다.
 */
export function formatAudioTimeParam(locator: {
  startSeconds: number;
  endSeconds?: number | null;
}): string {
  const start = Math.floor(locator.startSeconds);

  if (locator.endSeconds === undefined || locator.endSeconds === null) {
    return String(start);
  }

  return `${start}-${Math.floor(locator.endSeconds)}`;
}

/**
 * 주소에 실린 자리를 읽는다. **모르는 모양은 `null`이다.**
 *
 * 주소는 사람이 손으로 고칠 수 있는 자리다. **담길 때와 같은 규칙을 쓴다.**
 * 16-2에서 `imageRegionLocatorSchema`와 `parseRegionParam` 둘이 같은 규칙
 * 셋을 지킨 것과 같다. **한쪽만 느슨하면 그 길로 들어온다.**
 *
 * 지어내지 않는다. 잘못된 값으로 엉뚱한 자리에서 재생을 시작하면, 보는
 * 사람은 그것이 틀렸다는 것을 알 수 없다.
 */
export function parseAudioTimeParam(
  value: string | null | undefined,
): { startSeconds: number; endSeconds: number | null } | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parts = trimmed.split("-");

  if (parts.length > 2) {
    return null;
  }

  const numbers: number[] = [];

  for (const part of parts) {
    /*
      정수만 받는다. `3.5`나 `1e3`이나 `-5`를 받지 않는다. `Number()`는
      그런 것을 조용히 받아들이므로 모양부터 본다.
    */
    if (!/^\d{1,7}$/u.test(part.trim())) {
      return null;
    }

    numbers.push(Number(part.trim()));
  }

  const [startSeconds, endSeconds = null] = numbers;

  if (startSeconds > MAX_POSITION_SECONDS) {
    return null;
  }

  if (endSeconds === null) {
    return { startSeconds, endSeconds: null };
  }

  if (endSeconds > MAX_POSITION_SECONDS) {
    return null;
  }

  // 담길 때와 같은 규칙이다. 너무 짧은 구간은 구간이 아니다.
  if (endSeconds < startSeconds + MIN_AUDIO_RANGE_SECONDS) {
    return null;
  }

  return { startSeconds, endSeconds };
}
