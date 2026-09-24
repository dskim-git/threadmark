import { z } from "zod";

/*
  상대 경로에 확장자를 붙인다. Node 테스트 러너는 `@/` 별칭을 모르고
  확장자도 요구한다. 순수 모듈끼리는 이렇게 잇는다. (AGENTS.md 6절)
*/
import { MAX_POSITION_SECONDS, formatRange } from "../media/time.ts";

/**
 * 영상 기록의 자리. (설계 문서 6.3절, 14절)
 *
 * 6.3절이 모양을 이렇게 적어두었다.
 *
 *   { "kind": "video-time", "startSeconds": 754, "endSeconds": 802 }
 *
 * **음악의 자리와 나눈다.** 담는 값이 거의 같은데도 `kind`를 따로 두는
 * 이유는, 화면이 이 값을 보고 **무엇을 할지가 다르기** 때문이다.
 *
 *   음악  시간을 적어두기만 한다. 누를 수 없다
 *   영상  누르면 그 시점으로 재생기가 건너뛴다
 *
 * 한 `kind`로 묶으면 화면이 "이게 음악인가 영상인가"를 자료 유형까지
 * 거슬러 올라가 물어야 한다. 그 물음이 화면 여기저기로 번진다.
 * 6.3절도 둘을 나눠 적었다.
 *
 * **`label`을 두지 않는다.** 음악의 `2절 후렴`에 해당하는 칸이다. 음악은
 * 곡의 구조에 이름이 있어(`1절`, `후렴`, `간주`) 그 이름이 시간보다 더
 * 잘 기억된다. 영상에는 그런 이름이 없다. 대신 **눌러서 그 시점으로 갈 수
 * 있으므로** 이름이 할 일을 재생기가 한다.
 * (`AGENTS.md` 2절 "쓰지 않을 값을 미리 넣지 않는다")
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

export const VIDEO_TIME_KIND = "video-time";

export const videoTimeLocatorSchema = z.object({
  kind: z.literal(VIDEO_TIME_KIND),

  /**
   * 시작 시점(초).
   *
   * 글자가 아니라 초로 담는다. `1:08`과 `01:08`이 같은 값이어야 정렬도
   * 비교도 되고, **재생기에 넘길 수 있다.** 사람이 보는 모양은
   * `media/time.ts`가 만든다.
   */
  startSeconds: z.number().int().min(0).max(MAX_POSITION_SECONDS),

  /**
   * 끝 시점(초). 없을 수 있다.
   *
   * 영상에서는 대부분 없다. **재생기를 보다가 "여기다" 싶을 때 누르는
   * 것**이 이 기능의 주된 쓰임이고, 그때 끝을 정하려면 끝날 때까지 기다려야
   * 한다. 그 기다림이 기록을 남기지 않게 만든다.
   *
   * 없는 값을 시작과 같게 채워 넣지 않는다. 그러면 "한 순간을 가리킨 것"과
   * "길이가 0인 구간"을 나중에 구분할 수 없다.
   */
  endSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_POSITION_SECONDS)
    .nullable()
    .optional(),
});

export type VideoTimeLocator = z.infer<typeof videoTimeLocatorSchema>;

/**
 * 저장해둔 자리가 영상 시점이면 돌려준다. 아니면 null이다.
 *
 * 끝이 시작보다 앞인 값은 받지 않는다. 화면에서 막지만 데이터베이스에는
 * 다른 길로 들어온 값이 있을 수 있고, 그대로 그리면 `12:34–01:08`이 된다.
 */
export function parseVideoTimeLocator(
  value: unknown,
): VideoTimeLocator | null {
  const parsed = videoTimeLocatorSchema.safeParse(value);

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

/** 목록에 붙는 한 줄. `12:34` 또는 `12:34–13:22`. */
export function describeVideoTime(locator: VideoTimeLocator): string {
  return formatRange(locator.startSeconds, locator.endSeconds ?? null);
}
