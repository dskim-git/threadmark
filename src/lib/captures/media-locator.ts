import { z } from "zod";

/*
  상대 경로에 확장자를 붙인다. Node 테스트 러너는 `@/` 별칭을 모르고
  확장자도 요구한다. 순수 모듈끼리는 이렇게 잇는다. (AGENTS.md 6절)
*/
import { MAX_POSITION_SECONDS, formatPosition } from "../media/time.ts";

/**
 * 영화·드라마 기록의 자리. (설계 문서 15절)
 *
 *   "시즌, 회차, 타임코드를 Capture 위치로 저장한다."
 *
 * **세 번째 시점 자리다.** 음악과 YouTube가 이미 있다. 또 만드는 이유는
 * 담는 값이 다르기 때문이다.
 *
 * | 자리 | 담는 것 | 누르면 |
 * | --- | --- | --- |
 * | `music-time` | 시점, 구간, 대목 이름 | 아무 일도 없다 |
 * | `video-time` | 시점 | 재생기가 그리로 간다 |
 * | `media-time` | **시즌·회차**, 시점 | 아무 일도 없다 |
 *
 * **드라마에는 시간 앞에 시즌과 회차가 온다.** `3화 12분`이 `12분`보다
 * 먼저 기억나고, 시즌이 다르면 같은 12분이 전혀 다른 장면이다. 시간만
 * 담으면 나중에 그 장면을 찾을 수 없다.
 *
 * **누를 수 없다.** OTT 영상을 우리가 틀 수 없기 때문이다. 15절이
 * "OTT 영상 자체를 임베드하거나 다운로드하지 않는다"고 못 박았다.
 * 음악과 같은 자리이고, 그래서 화면도 음악처럼 글자로만 보여준다.
 * **갈 곳이 없는데 누를 수 있게 해두면 눌러야만 아무 일도 없다는 것을
 * 알게 된다.**
 *
 * **영화에는 시즌과 회차가 없다.** 둘 다 없을 수 있게 두고, 화면이
 * 작품 갈래를 보고 칸을 보여줄지 정한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

export const MEDIA_TIME_KIND = "media-time";

/** 시즌과 회차의 한계. 넘는 값은 잘못 친 것이다. */
export const MAX_SEASON = 1000;
export const MAX_EPISODE = 100_000;

export const mediaTimeLocatorSchema = z.object({
  kind: z.literal(MEDIA_TIME_KIND),

  /**
   * 시즌. 드라마에만 있다.
   *
   * **비어 있는 것과 1은 다르다.** 시즌이 하나뿐인 드라마에서 사람들은
   * 시즌을 적지 않는다. 그것을 1로 채워 담으면 "적지 않았다"와 "1이라고
   * 적었다"를 나중에 구분할 수 없다.
   */
  season: z.number().int().min(1).max(MAX_SEASON).nullable().optional(),

  /** 회차. 드라마에만 있다. */
  episode: z.number().int().min(1).max(MAX_EPISODE).nullable().optional(),

  /**
   * 그 회차 안에서의 시점(초).
   *
   * **회차 안에서 센다.** 시리즈 전체를 이어 세지 않는다. 사람이 보는
   * 것도 재생기가 보여주는 것도 그 회차의 시간이다.
   *
   * 비어 있을 수 있다. `3화 전체`를 가리키는 메모가 있다. 시즌·회차만
   * 적고 시간을 비우는 것이 그 뜻이다.
   */
  startSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_POSITION_SECONDS)
    .nullable()
    .optional(),
});

export type MediaTimeLocator = z.infer<typeof mediaTimeLocatorSchema>;

/**
 * 저장해둔 자리가 영화·드라마 시점이면 돌려준다. 아니면 null이다.
 *
 * **셋 다 비어 있으면 자리가 아니다.** `{kind: "media-time"}`만 담기면
 * 화면에 빈 꼬리표가 붙는다. 아무것도 가리키지 않는 표시는 잡음이다.
 */
export function parseMediaTimeLocator(
  value: unknown,
): MediaTimeLocator | null {
  const parsed = mediaTimeLocatorSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const locator = parsed.data;

  const empty =
    (locator.season === null || locator.season === undefined) &&
    (locator.episode === null || locator.episode === undefined) &&
    (locator.startSeconds === null || locator.startSeconds === undefined);

  return empty ? null : locator;
}

/**
 * 목록에 붙는 한 줄. `시즌 2 · 3화 · 12:30`
 *
 * **있는 것만 적는다.** 영화는 시간만 나오고, `3화 전체`는 시간 없이
 * 나온다. 없는 칸을 `-`나 `모름`으로 채우면 줄이 길어지기만 하고
 * 읽을 것이 늘지 않는다.
 *
 * 시즌이 하나뿐인 드라마에서는 시즌을 적지 않게 되므로 `3화 · 12:30`이
 * 된다. 그것이 사람이 말하는 모양이다.
 */
export function describeMediaTime(locator: MediaTimeLocator): string {
  const parts: string[] = [];

  if (locator.season !== null && locator.season !== undefined) {
    parts.push(`시즌 ${locator.season}`);
  }

  if (locator.episode !== null && locator.episode !== undefined) {
    parts.push(`${locator.episode}화`);
  }

  if (locator.startSeconds !== null && locator.startSeconds !== undefined) {
    parts.push(formatPosition(locator.startSeconds));
  }

  return parts.join(" · ");
}
