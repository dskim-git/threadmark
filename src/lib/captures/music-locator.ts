import { z } from "zod";

/*
  상대 경로에 확장자를 붙인다. Node 테스트 러너는 `@/` 별칭을 모르고
  확장자도 요구한다. 순수 모듈끼리는 이렇게 잇는다. (AGENTS.md 6절)
*/
import { MAX_POSITION_SECONDS, formatRange } from "../media/time.ts";

/**
 * 음악 기록의 자리. (설계 문서 13.4절)
 *
 * 13.4절이 "특정 재생 시점 또는 구간 메모"를 들고, 예를 이렇게 적었다.
 *
 *   01:08–01:34 / 2절 후렴
 *   현악기가 들어오면서 분위기가 확장되는 부분.
 *
 * 그 첫 줄이 이 모듈이 담는 것이다. 둘째 줄은 기록의 본문이다.
 *
 * **`locator`는 JSONB라 무엇이든 들어갈 수 있다.** PDF의 자리가 이미 그
 * 칸을 쓰고 있고, 여기에 음악의 자리가 더해진다. 읽는 쪽이 모양을 확인하고
 * 쓴다. `pdf-locator.ts`와 같은 방식이며 `kind`로 갈린다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

export const MUSIC_TIME_KIND = "music-time";

/** `2절 후렴` 같은 이름. 13.4절 예의 슬래시 뒤에 오는 말이다. */
export const MAX_MUSIC_LABEL_LENGTH = 100;

export const musicTimeLocatorSchema = z.object({
  kind: z.literal(MUSIC_TIME_KIND),

  /**
   * 시작 시점(초).
   *
   * 글자가 아니라 초로 담는다. `1:08`과 `01:08`이 같은 값이어야 정렬도
   * 비교도 된다. 사람이 보는 모양은 `music/time.ts`가 만든다.
   */
  startSeconds: z.number().int().min(0).max(MAX_POSITION_SECONDS),

  /**
   * 끝 시점(초). 없을 수 있다.
   *
   * "여기부터 저기까지"가 아니라 **"이 순간"**을 가리키는 메모가 있다.
   * 없는 값을 시작과 같게 채워 넣지 않는다. 그러면 "한 순간을 가리킨 것"과
   * "길이가 0인 구간"을 나중에 구분할 수 없다.
   * PDF의 쪽 메모에서 문맥과 좌표를 비워둔 것과 같은 생각이다.
   */
  endSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_POSITION_SECONDS)
    .nullable()
    .optional(),

  /** 그 대목의 이름. `2절 후렴`, `간주`처럼. 비워도 된다. */
  label: z.string().max(MAX_MUSIC_LABEL_LENGTH).nullable().optional(),
});

export type MusicTimeLocator = z.infer<typeof musicTimeLocatorSchema>;

/**
 * 저장해둔 자리가 음악 시점이면 돌려준다. 아니면 null이다.
 *
 * 끝이 시작보다 앞인 값은 받지 않는다. 화면에서 막지만 데이터베이스에는
 * 예전 값이나 다른 길로 들어온 값이 있을 수 있고, 그대로 그리면
 * `01:34–01:08`이 된다.
 */
export function parseMusicTimeLocator(
  value: unknown,
): MusicTimeLocator | null {
  const parsed = musicTimeLocatorSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const locator = parsed.data;

  if (
    locator.endSeconds !== undefined &&
    locator.endSeconds !== null &&
    locator.endSeconds < locator.startSeconds
  ) {
    return null;
  }

  return locator;
}

/**
 * 13.4절의 첫 줄을 만든다. `01:08–01:34 / 2절 후렴`
 *
 * 이름이 없으면 시간만 적는다. 슬래시 뒤에 아무것도 없는 줄을 두지 않는다.
 */
export function describeMusicTime(locator: MusicTimeLocator): string {
  const range = formatRange(locator.startSeconds, locator.endSeconds ?? null);
  const label = locator.label?.trim();

  return label ? `${range} / ${label}` : range;
}
