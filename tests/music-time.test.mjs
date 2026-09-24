/**
 * 재생 시점 읽고 적기 단위 검사. (설계 문서 13.4절)
 *
 * 13.4절의 예가 이 검사가 지키는 것이다.
 *
 *   01:08–01:34 / 2절 후렴
 *
 * 사람은 `1:08`이라고도 `01:08`이라고도 `68`이라고도 친다. 셋을 같은 뜻으로
 * 읽되, **우리가 고쳐서 담지는 않는다.** `1:75`처럼 뜻이 갈리는 값은 받지
 * 않는다. 고쳐 담으면 사용자가 친 것과 담긴 것이 달라진다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_POSITION_SECONDS,
  checkRange,
  formatPosition,
  formatRange,
  parsePosition,
} from "../src/lib/media/time.ts";

// -----------------------------------------------------------------------------
// 읽기
// -----------------------------------------------------------------------------

test("분:초를 읽는다", () => {
  assert.equal(parsePosition("1:08"), 68);
  assert.equal(parsePosition("01:08"), 68);
  assert.equal(parsePosition("0:00"), 0);
  assert.equal(parsePosition("3:45"), 225);
});

test("초만 적은 것도 읽는다", () => {
  assert.equal(parsePosition("68"), 68);
  assert.equal(parsePosition("0"), 0);
});

test("초만 적을 때는 60을 넘어도 된다", () => {
  // 모양이 다르므로 뜻이 분명하다. `75초`는 헷갈릴 것이 없다.
  assert.equal(parsePosition("75"), 75);
  assert.equal(parsePosition("3600"), 3600);
});

test("시:분:초를 읽는다", () => {
  // 한 시간이 넘는 실황 녹음이 있다.
  assert.equal(parsePosition("1:05:30"), 3930);
  assert.equal(parsePosition("0:01:08"), 68);
});

test("앞뒤 공백을 정리한다", () => {
  assert.equal(parsePosition("  1:08  "), 68);
  assert.equal(parsePosition("1 : 08"), 68);
});

test("분과 초가 60을 넘으면 받지 않는다", () => {
  /*
    `1:75`는 `2:15`를 뜻할 수도 있고 잘못 친 것일 수도 있다. 우리가 고쳐
    담으면 사용자가 친 것과 담긴 것이 달라진다. 물을 수 없으면 받지 않는다.
  */
  assert.equal(parsePosition("1:75"), null);
  assert.equal(parsePosition("1:99:00"), null);
  assert.equal(parsePosition("1:00:75"), null);
});

test("읽을 수 없는 값은 null이다", () => {
  for (const input of [
    "",
    "   ",
    "가나다",
    "1:2:3:4",
    "1:",
    ":08",
    "-1:08",
    "1.5",
    "1:0八",
    undefined,
    null,
    68,
    {},
  ]) {
    assert.equal(parsePosition(input), null, JSON.stringify(input));
  }
});

test("터무니없이 긴 값은 받지 않는다", () => {
  // 잘못 친 값을 거르는 것이지 긴 녹음을 막는 것이 아니다.
  assert.equal(parsePosition(String(MAX_POSITION_SECONDS)), MAX_POSITION_SECONDS);
  assert.equal(parsePosition(String(MAX_POSITION_SECONDS + 1)), null);
});

// -----------------------------------------------------------------------------
// 적기
// -----------------------------------------------------------------------------

test("한 시간이 안 되면 분:초로 적는다", () => {
  assert.equal(formatPosition(68), "01:08");
  assert.equal(formatPosition(0), "00:00");
  assert.equal(formatPosition(225), "03:45");
});

test("한 시간이 넘으면 시:분:초로 적는다", () => {
  // 한 시간이 안 되는데 `00:01:08`로 적으면 앞의 `00:`이 자리만 차지한다.
  assert.equal(formatPosition(3930), "1:05:30");
  assert.equal(formatPosition(3600), "1:00:00");
  assert.equal(formatPosition(3599), "59:59");
});

test("분을 두 자리로 맞춘다", () => {
  // 목록에서 자릿수가 들쭉날쭉하면 읽기 어렵다.
  assert.equal(formatPosition(68), "01:08");
  assert.notEqual(formatPosition(68), "1:08");
});

test("이상한 값을 적어도 터지지 않는다", () => {
  assert.equal(formatPosition(-1), "0:00");
  assert.equal(formatPosition(Number.NaN), "0:00");
  assert.equal(formatPosition(Number.POSITIVE_INFINITY), "0:00");
});

test("읽고 적으면 같은 뜻이 나온다", () => {
  for (const input of ["1:08", "01:08", "68"]) {
    assert.equal(formatPosition(parsePosition(input)), "01:08", input);
  }
});

// -----------------------------------------------------------------------------
// 구간
// -----------------------------------------------------------------------------

test("구간을 13.4절의 모양으로 적는다", () => {
  assert.equal(formatRange(68, 94), "01:08–01:34");
});

test("끝이 없으면 한 시점만 적는다", () => {
  // "여기부터"가 아니라 "이 순간"을 가리키는 메모도 있다.
  assert.equal(formatRange(68), "01:08");
  assert.equal(formatRange(68, null), "01:08");
});

test("범위 글자는 붙임표가 아니라 en dash다", () => {
  // 13.4절의 예가 그렇게 적혀 있다.
  assert.ok(formatRange(68, 94).includes("–"));
  assert.ok(!formatRange(68, 94).includes("-"));
});

// -----------------------------------------------------------------------------
// 확인
// -----------------------------------------------------------------------------

test("시작과 끝을 함께 읽는다", () => {
  const result = checkRange("1:08", "1:34");

  assert.equal(result.ok, true);
  assert.equal(result.startSeconds, 68);
  assert.equal(result.endSeconds, 94);
});

test("끝은 비워도 된다", () => {
  for (const end of ["", "   ", undefined, null]) {
    const result = checkRange("1:08", end);

    assert.equal(result.ok, true, JSON.stringify(end));
    assert.equal(result.endSeconds, null);
  }
});

test("시작과 끝이 같아도 된다", () => {
  const result = checkRange("1:08", "1:08");

  assert.equal(result.ok, true);
});

test("끝이 시작보다 앞이면 받지 않는다", () => {
  /*
    담고 나면 화면에 `01:34–01:08`로 보이는데, 잘못 친 것인지 거꾸로 적는
    뜻이 있는 것인지 나중에는 알 수 없다.
  */
  const result = checkRange("1:34", "1:08");

  assert.equal(result.ok, false);
  assert.ok(result.message.length > 0);
});

test("시작을 읽을 수 없으면 이유를 말한다", () => {
  const result = checkRange("가나다", "");

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("1:08"), "어떻게 적어야 하는지 보여준다");
});

test("끝만 읽을 수 없어도 이유를 말한다", () => {
  const result = checkRange("1:08", "가나다");

  assert.equal(result.ok, false);
  assert.ok(result.message.length > 0);
});
