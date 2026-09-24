/**
 * 중요 표시(별)를 거르고 켜고 끄는 값의 단위 검사. (설계 문서 5.2-1절, 6.2-1절)
 *
 * 두 가지가 중요하다.
 *
 * 하나는 **거르는 값이 주소에 남는다**는 것이다. 즐겨찾기에 담기고 사용자가
 * 손으로 고쳐 쓸 수도 있다. 모르는 값을 "켜짐"으로 읽으면 자료가 사라진 것처럼
 * 보이므로, 어느 쪽으로 틀려야 덜 위험한지가 정해져 있다.
 *
 * 다른 하나는 **단추가 지금 상태가 아니라 바꾸려는 상태를 보낸다**는 것이다.
 * 이 약속이 깨지면 빠르게 두 번 눌렸을 때 결과가 누른 순서에 달리게 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STARRED_ON,
  STARRED_PARAM,
  readStarredInput,
  readStarredOnly,
  starredInputValue,
} from "../src/lib/stars.ts";

// -----------------------------------------------------------------------------
// 주소에서 읽는 값
// -----------------------------------------------------------------------------

test("켜진 값 하나만 켜진 것으로 읽는다", () => {
  assert.equal(readStarredOnly(STARRED_ON), true);
});

test("모르는 값은 전부 꺼진 것으로 본다", () => {
  // 꺼진 쪽으로 틀리면 전부 보일 뿐이라 잃는 것이 없다.
  // 켜진 쪽으로 틀리면 담아둔 자료가 사라진 것처럼 보인다.
  for (const value of [
    undefined,
    null,
    "",
    "0",
    "true",
    "yes",
    "on",
    "1 ",
    1,
    true,
    ["1"],
    {},
  ]) {
    assert.equal(readStarredOnly(value), false, `${JSON.stringify(value)}`);
  }
});

test("주소에 쓰는 이름이 정해져 있다", () => {
  // 화면마다 따로 적으면 한 곳을 바꿨을 때 나머지가 조용히 어긋난다.
  assert.equal(STARRED_PARAM, "starred");
  assert.equal(STARRED_ON, "1");
});

// -----------------------------------------------------------------------------
// 단추가 보내는 값
// -----------------------------------------------------------------------------

test("단추는 지금 상태가 아니라 바꾸려는 상태를 보낸다", () => {
  assert.equal(starredInputValue(false), "on");
  assert.equal(starredInputValue(true), "off");
});

test("보낸 값을 그대로 되읽는다", () => {
  assert.equal(readStarredInput(starredInputValue(false)), true);
  assert.equal(readStarredInput(starredInputValue(true)), false);
});

test("두 번 눌러도 결과가 누른 순서에 달리지 않는다", () => {
  // 같은 값이 두 번 도착해도 도착한 값이 곧 결과다.
  const sent = starredInputValue(false);

  assert.equal(readStarredInput(sent), true);
  assert.equal(readStarredInput(sent), true);
});

test("모르는 값은 받아들이지 않는다", () => {
  // null을 돌려주면 Server Action이 "잘못된 요청"으로 막는다.
  // 기본값을 정해두면 손이 미끄러진 요청이 별을 떼어버릴 수 있다.
  for (const value of [undefined, null, "", "1", "true", "ON", "Off", 1, true]) {
    assert.equal(readStarredInput(value), null, `${JSON.stringify(value)}`);
  }
});
