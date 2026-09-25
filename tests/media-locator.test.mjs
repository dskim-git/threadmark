/**
 * 영화·드라마 기록의 자리 단위 검사. (15-E-2c-2b)
 *
 * `locator`는 JSONB라 **무엇이든 들어갈 수 있다.** 이제 그 칸을 네 가지가
 * 나눠 쓴다. PDF, 음악, 영상, 그리고 영화·드라마다. 읽는 쪽이 모양을
 * 확인하지 않으면 **한 갈래의 자리가 다른 갈래로 읽힌다.**
 *
 * 섞이면 눈에 띄는 고장이 아니라 **엉뚱한 꼬리표**가 된다. 음악 기록에
 * `3화`가 붙거나, 드라마 기록에 재생기로 가는 단추가 붙는다. 갈 곳이
 * 없는 단추는 눌러야만 아무 일도 없다는 것을 알게 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_TIME_KIND,
  describeMediaTime,
  parseMediaTimeLocator,
} from "../src/lib/captures/media-locator.ts";

// -----------------------------------------------------------------------------
// 읽기
// -----------------------------------------------------------------------------

test("시즌·회차·시점을 모두 읽는다", () => {
  assert.deepEqual(
    parseMediaTimeLocator({
      kind: MEDIA_TIME_KIND,
      season: 2,
      episode: 3,
      startSeconds: 750,
    }),
    { kind: MEDIA_TIME_KIND, season: 2, episode: 3, startSeconds: 750 },
  );
});

test("영화는 시간만 있어도 된다", () => {
  // 영화에는 시즌과 회차가 없다.
  const parsed = parseMediaTimeLocator({
    kind: MEDIA_TIME_KIND,
    startSeconds: 4320,
  });

  assert.equal(parsed?.startSeconds, 4320);
});

test("회차 전체를 가리키는 것도 자리다", () => {
  /*
    `3화 전체`를 가리키는 메모가 있다. 시간을 비우는 것이 그 뜻이다.
    시간이 없다고 버리면 그 메모의 자리가 사라진다.
  */
  const parsed = parseMediaTimeLocator({
    kind: MEDIA_TIME_KIND,
    episode: 3,
  });

  assert.equal(parsed?.episode, 3);
});

test("셋 다 비어 있으면 자리가 아니다", () => {
  /*
    **아무것도 가리키지 않는 표시는 잡음이다.** 화면에 빈 꼬리표가 붙는다.
  */
  assert.equal(parseMediaTimeLocator({ kind: MEDIA_TIME_KIND }), null);
  assert.equal(
    parseMediaTimeLocator({
      kind: MEDIA_TIME_KIND,
      season: null,
      episode: null,
      startSeconds: null,
    }),
    null,
  );
});

// -----------------------------------------------------------------------------
// 다른 갈래와 섞이지 않는다
// -----------------------------------------------------------------------------

test("음악·영상·PDF의 자리를 영화로 읽지 않는다", () => {
  /*
    **이제 한 칸을 네 가지가 나눠 쓴다.** 섞이면 음악 기록에 `3화`가
    붙거나 드라마 기록에 재생기 단추가 붙는다.
  */
  assert.equal(
    parseMediaTimeLocator({ kind: "music-time", startSeconds: 68 }),
    null,
  );
  assert.equal(
    parseMediaTimeLocator({ kind: "video-time", startSeconds: 754 }),
    null,
  );
  assert.equal(
    parseMediaTimeLocator({ kind: "pdf-selection", page: 17 }),
    null,
  );
});

test("빈 자리와 모양이 어긋난 값", () => {
  assert.equal(parseMediaTimeLocator({}), null);
  assert.equal(parseMediaTimeLocator(null), null);
  assert.equal(parseMediaTimeLocator("시즌 2 3화"), null);
});

// -----------------------------------------------------------------------------
// 받아들이지 않는 값
// -----------------------------------------------------------------------------

test("0화나 0시즌은 없다", () => {
  // 1부터 센다. 0이 담기면 화면에 `0화`가 뜬다.
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, episode: 0 }),
    null,
  );
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, season: 0 }),
    null,
  );
});

test("숫자가 아닌 시즌·회차는 받지 않는다", () => {
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, episode: "3" }),
    null,
  );
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, episode: 3.5 }),
    null,
  );
});

test("터무니없이 큰 값은 받지 않는다", () => {
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, season: 99_999 }),
    null,
  );
  assert.equal(
    parseMediaTimeLocator({ kind: MEDIA_TIME_KIND, startSeconds: 99_999_999 }),
    null,
  );
});

test("시점 0초는 받는다", () => {
  // 맨 처음 장면을 가리키는 것은 뜻이 있다. 비어 있는 것과 다르다.
  const parsed = parseMediaTimeLocator({
    kind: MEDIA_TIME_KIND,
    startSeconds: 0,
  });

  assert.equal(parsed?.startSeconds, 0);
});

// -----------------------------------------------------------------------------
// 보여주기
// -----------------------------------------------------------------------------

test("있는 것만 적는다", () => {
  /*
    **없는 칸을 `-`나 `모름`으로 채우지 않는다.** 줄이 길어지기만 하고
    읽을 것이 늘지 않는다.
  */
  assert.equal(
    describeMediaTime({
      kind: MEDIA_TIME_KIND,
      season: 2,
      episode: 3,
      startSeconds: 750,
    }),
    "시즌 2 · 3화 · 12:30",
  );

  // 시즌이 하나뿐인 드라마. 사람이 말하는 모양이다.
  assert.equal(
    describeMediaTime({ kind: MEDIA_TIME_KIND, episode: 3, startSeconds: 750 }),
    "3화 · 12:30",
  );

  // 영화.
  assert.equal(
    describeMediaTime({ kind: MEDIA_TIME_KIND, startSeconds: 4320 }),
    "1:12:00",
  );

  // 회차 전체.
  assert.equal(
    describeMediaTime({ kind: MEDIA_TIME_KIND, episode: 3 }),
    "3화",
  );
});

test("한 시간이 넘으면 시간 칸이 붙는다", () => {
  assert.equal(
    describeMediaTime({ kind: MEDIA_TIME_KIND, startSeconds: 3730 }),
    "1:02:10",
  );
});
