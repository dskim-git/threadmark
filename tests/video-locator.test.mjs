/**
 * 영상 기록의 자리 단위 검사. (15-E-2b-2)
 *
 * `locator`는 JSONB라 **무엇이든 들어갈 수 있다.** 읽는 쪽이 모양을 확인하지
 * 않으면 엉뚱한 값이 재생기에 넘어가고, 재생기는 조용히 아무 데도 가지
 * 않는다. 오류도 나지 않아서 "눌렀는데 안 움직인다"로만 보인다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  VIDEO_TIME_KIND,
  describeVideoTime,
  parseVideoTimeLocator,
} from "../src/lib/captures/video-locator.ts";

test("영상 시점을 읽는다", () => {
  assert.deepEqual(
    parseVideoTimeLocator({ kind: VIDEO_TIME_KIND, startSeconds: 754 }),
    { kind: VIDEO_TIME_KIND, startSeconds: 754 },
  );
});

test("구간도 읽는다", () => {
  // 설계 문서 6.3절이 적어둔 그 모양이다.
  assert.deepEqual(
    parseVideoTimeLocator({
      kind: VIDEO_TIME_KIND,
      startSeconds: 754,
      endSeconds: 802,
    }),
    { kind: VIDEO_TIME_KIND, startSeconds: 754, endSeconds: 802 },
  );
});

test("음악의 자리를 영상으로 읽지 않는다", () => {
  /*
    **`kind`가 둘을 가른다.** 섞이면 음악 기록에 "눌러서 이동" 단추가
    붙는데, 누를 재생기가 없다. 눌러야만 아무 일도 없다는 것을 알게 된다.
  */
  assert.equal(
    parseVideoTimeLocator({ kind: "music-time", startSeconds: 68 }),
    null,
  );
});

test("PDF의 자리도 영상으로 읽지 않는다", () => {
  assert.equal(
    parseVideoTimeLocator({ kind: "pdf-selection", page: 17 }),
    null,
  );
});

test("빈 자리와 모양이 어긋난 값", () => {
  // 시점 기록이 아닌 기록은 locator가 비어 있다. 대부분이 그렇다.
  assert.equal(parseVideoTimeLocator({}), null);
  assert.equal(parseVideoTimeLocator(null), null);
  assert.equal(parseVideoTimeLocator("12:34"), null);
  assert.equal(parseVideoTimeLocator({ kind: VIDEO_TIME_KIND }), null);
});

test("초가 숫자가 아니면 받지 않는다", () => {
  /*
    글자로 담긴 값이 재생기에 넘어가면 아무 데도 가지 않는다. 오류도 나지
    않아서 "눌렀는데 안 움직인다"로만 보인다.
  */
  assert.equal(
    parseVideoTimeLocator({ kind: VIDEO_TIME_KIND, startSeconds: "754" }),
    null,
  );
  assert.equal(
    parseVideoTimeLocator({ kind: VIDEO_TIME_KIND, startSeconds: 12.5 }),
    null,
  );
});

test("음수와 터무니없이 큰 값은 받지 않는다", () => {
  assert.equal(
    parseVideoTimeLocator({ kind: VIDEO_TIME_KIND, startSeconds: -1 }),
    null,
  );
  assert.equal(
    parseVideoTimeLocator({ kind: VIDEO_TIME_KIND, startSeconds: 99_999_999 }),
    null,
  );
});

test("끝이 시작보다 앞이면 받지 않는다", () => {
  // 그대로 그리면 `13:22–01:08`이 된다.
  assert.equal(
    parseVideoTimeLocator({
      kind: VIDEO_TIME_KIND,
      startSeconds: 802,
      endSeconds: 754,
    }),
    null,
  );
});

test("끝이 시작과 같은 것은 받는다", () => {
  // 앞뒤가 뒤집힌 것이 아니다. 막을 이유가 없다.
  assert.deepEqual(
    parseVideoTimeLocator({
      kind: VIDEO_TIME_KIND,
      startSeconds: 754,
      endSeconds: 754,
    }),
    { kind: VIDEO_TIME_KIND, startSeconds: 754, endSeconds: 754 },
  );
});

test("끝이 비어 있는 것은 구간이 아니라 한 순간이다", () => {
  /*
    없는 값을 시작과 같게 채우지 않는다. 채우면 "이 순간"과 "길이가 0인
    구간"을 나중에 구분할 수 없다.
  */
  const parsed = parseVideoTimeLocator({
    kind: VIDEO_TIME_KIND,
    startSeconds: 754,
    endSeconds: null,
  });

  assert.equal(parsed?.endSeconds, null);
});

test("목록에 붙는 줄을 만든다", () => {
  assert.equal(
    describeVideoTime({ kind: VIDEO_TIME_KIND, startSeconds: 754 }),
    "12:34",
  );
  assert.equal(
    describeVideoTime({
      kind: VIDEO_TIME_KIND,
      startSeconds: 754,
      endSeconds: 802,
    }),
    "12:34–13:22",
  );
});

test("한 시간이 넘으면 시간 칸이 붙는다", () => {
  assert.equal(
    describeVideoTime({ kind: VIDEO_TIME_KIND, startSeconds: 3730 }),
    "1:02:10",
  );
});
