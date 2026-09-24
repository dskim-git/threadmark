/**
 * 계정 삭제 확인 글자 맞추기 단위 테스트. (17-A)
 *
 * 이 함수가 느슨하면 잘못 누른 사람이 자료를 전부 잃고, 빡빡하면 정말
 * 나가려는 사람이 나가지 못한다. **막는 것과 여는 것을 모두 확인한다.**
 * (보안 원칙 6)
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { matchesAccountEmail } from "../src/lib/account/confirmation.ts";

const EMAIL = "reader@example.com";

test("메일 주소를 그대로 적으면 통과한다", () => {
  assert.equal(matchesAccountEmail(EMAIL, EMAIL), true);
});

test("앞뒤 공백과 대소문자는 무시한다", () => {
  // 휴대폰 자판이 첫 글자를 크게 바꾸거나 붙여넣기에 공백이 따라온다.
  // 그것 때문에 나가려는 사람이 막히면 "왜 안 되지"만 남는다.
  assert.equal(matchesAccountEmail("  Reader@Example.com ", EMAIL), true);
  assert.equal(matchesAccountEmail("READER@EXAMPLE.COM", EMAIL), true);
});

test("다른 주소는 막는다", () => {
  for (const typed of [
    "reader@example.org",
    "reader@example.co",
    "reader@example.comm",
    "eader@example.com",
    "reader @example.com",
  ]) {
    assert.equal(
      matchesAccountEmail(typed, EMAIL),
      false,
      `${typed}가 통과하면 안 된다`,
    );
  }
});

test("빈 값으로는 지울 수 없다", () => {
  for (const typed of ["", "   ", undefined, null]) {
    assert.equal(matchesAccountEmail(typed, EMAIL), false);
  }
});

test("글자가 아닌 것을 보내도 통과하지 않는다", () => {
  // 폼은 파일이나 여러 값을 보낼 수도 있다. 화면에 칸이 하나뿐이라는 것이
  // 서버로 오는 값이 하나뿐이라는 뜻은 아니다.
  for (const typed of [0, 1, {}, [], [EMAIL], true]) {
    assert.equal(matchesAccountEmail(typed, EMAIL), false);
  }
});

test("계정 메일 주소를 모르면 무엇을 적어도 통과하지 않는다", () => {
  // 견줄 기준이 없는데 통과시키면 확인 절차가 있는 척만 하는 셈이다.
  // 이 경우 화면은 폼 대신 문의 안내를 보여준다. (보안 원칙 7)
  for (const email of [null, undefined, "", "   "]) {
    assert.equal(matchesAccountEmail(EMAIL, email), false);
    assert.equal(matchesAccountEmail("", email), false);
  }
});
