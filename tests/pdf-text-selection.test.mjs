/**
 * 선택을 어느 쪽으로 늘리는 중인지 가리는 셈. (2026-10-04, 사용자가 찾음)
 *
 * > pdf에서 인용할 문장을 드래그 할 때 (…) 마우스의 드래그가 그 단어
 * > 앞으로 튄다던지
 *
 * **이 값이 뒤집히면 선택이 반대로 튄다.** 덮개를 고르는 글자 앞에 둘지
 * 뒤에 둘지가 여기서 정해지고, 반대로 두면 그 글자를 건너뛰거나 앞으로
 * 되돌아간다. 오류는 나지 않고 **드래그가 말을 안 들을 뿐**이라, 쓰다가
 * 부딪히기 전에는 모른다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { shouldMoveAnchor } from "../src/app/(app)/sources/[id]/reader/text-selection-rules.ts";

/**
 * 견주기 결과를 미리 정해둔 가짜 범위.
 *
 * 진짜 `Range`는 브라우저에만 있다. 이 셈이 보는 것은 **견준 결과뿐**이라
 * 그 결과를 넣어주면 그대로 검사할 수 있다. 나눠 둔 값이 여기서 나온다.
 */
function range({ endToEnd, startToEnd }) {
  return {
    compareBoundaryPoints(how) {
      // 2가 END_TO_END, 1이 START_TO_END다. 표준이 못박은 값이다.
      return how === 2 ? endToEnd : startToEnd;
    },
  };
}

test("지난 선택이 없으면 뒤로 늘리는 것으로 본다", () => {
  /*
    처음 드래그다. **모르면서 앞으로 보면 첫 드래그마다 튄다.**
    뒤로 늘리는 것이 사람이 더 자주 하는 일이다.
  */
  assert.equal(
    shouldMoveAnchor(range({ endToEnd: 0, startToEnd: 0 }), null),
    false,
  );
});

test("끝이 그대로이면 앞을 움직이는 중이다", () => {
  /*
    드래그를 왼쪽으로 끌 때다. 뒤는 가만히 있고 시작만 앞으로 간다.
    그때 덮개를 고르는 글자 **앞**에 둬야 한다.
  */
  assert.equal(
    shouldMoveAnchor(range({ endToEnd: 0, startToEnd: -1 }), range({})),
    true,
  );
});

test("선택이 접혔다가 반대로 펴지는 것도 앞으로 본다", () => {
  // 앞과 지난 끝이 같은 자리다. 한 점으로 모였다가 반대편으로 펴진다.
  assert.equal(
    shouldMoveAnchor(range({ endToEnd: 1, startToEnd: 0 }), range({})),
    true,
  );
});

test("둘 다 어긋나면 뒤로 늘리는 중이다", () => {
  // 보통의 드래그다. 오른쪽으로 끌면 끝이 계속 움직인다.
  assert.equal(
    shouldMoveAnchor(range({ endToEnd: 1, startToEnd: -1 }), range({})),
    false,
  );
  assert.equal(
    shouldMoveAnchor(range({ endToEnd: -1, startToEnd: 1 }), range({})),
    false,
  );
});

test("견주는 값을 바꿔 묻지 않는다", () => {
  /*
    `END_TO_END`와 `START_TO_END`를 뒤바꿔 쓰면 **앞뒤 판단이 통째로
    뒤집힌다.** 어느 값을 어느 자리에 쓰는지를 여기서 못박는다.

    끝끼리만 같은 경우를 넣는다. 값을 뒤바꿔 읽는 코드라면 이 경우에
    거짓이 나온다.
  */
  const asked = [];

  const spy = {
    compareBoundaryPoints(how) {
      asked.push(how);

      return how === 2 ? 0 : -1;
    },
  };

  assert.equal(shouldMoveAnchor(spy, range({})), true);
  assert.ok(asked.includes(2), "END_TO_END로 물어야 한다");
});
