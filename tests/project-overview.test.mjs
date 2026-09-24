/**
 * 조망이 세는 숫자의 단위 테스트. (19-C)
 *
 * **틀린 숫자는 화면이 멀쩡해 보인다.** 자리가 사라지거나 화면이 멈추면
 * 바로 알지만, `글을 쓸 곳 9군데 중 6군데`가 8군데 중 6군데여야 했다는
 * 것은 눈으로 알 수 없다. 사용자가 뼈대를 다 세어보지 않는 한 모른다.
 *
 * 그리고 **한 번 거짓말한 숫자는 그 뒤로 아무도 보지 않는다.** 조망의
 * 값어치가 전부 이 한 줄에 걸려 있어서, 이쪽을 검사로 붙잡아 둔다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  nodeState,
  summarizeOutline,
} from "../src/lib/projects/outline-overview.ts";

/** 검사에서 쓰기 편한 자리 하나. */
function row(id, body, descendantCount = 0) {
  return { id, body, descendantCount };
}

/** 놓인 재료 개수표. */
function counts(pairs) {
  return new Map(Object.entries(pairs));
}

// -----------------------------------------------------------------------------
// 자리 하나의 상태
// -----------------------------------------------------------------------------

test("글이 있으면 글을 쓴 자리다", () => {
  assert.equal(nodeState(row("a", "서론을 쓴다"), 0), "written");
});

test("나뉜 자리에 쓴 글도 글이다", () => {
  /*
    나뉘었는지를 먼저 보면 써둔 글이 `branch`에 묻힌다. 장 머리에 한 문단을
    쓰는 일은 흔하고, 그것을 "안 썼다"고 하면 틀린 말이다.
  */
  assert.equal(nodeState(row("a", "이 장에서는", 3), 0), "written");
});

test("아래로 나뉜 빈 자리는 뚫린 것이 아니다", () => {
  // 글은 나뉜 쪽에 있다. `empty`로 묶으면 멀쩡한 자리가 뚫려 보인다.
  assert.equal(nodeState(row("a", null, 2), 0), "branch");
});

test("재료만 놓인 자리를 가려낸다", () => {
  assert.equal(nodeState(row("a", null), 3), "material-only");
});

test("아무것도 없으면 빈 자리다", () => {
  assert.equal(nodeState(row("a", null), 0), "empty");
});

test("빈칸과 줄바꿈만 있는 것은 글로 세지 않는다", () => {
  /*
    글 칸을 열었다 닫으면 줄바꿈 하나가 남는 일이 있다. 그것을 글로 세면
    **쓰지 않은 자리가 썼다고 나온다.** 조망이 거짓말하는 쪽이 아무것도
    안 하는 쪽보다 나쁘다.
  */
  assert.equal(nodeState(row("a", "   \n\n  "), 0), "empty");

  // 빈 글은 없는 글이므로, 나뉜 자리는 나뉜 자리로 남는다.
  assert.equal(nodeState(row("a", "\n", 2), 0), "branch");

  // 끝자리에 재료가 놓여 있으면 빈 글은 `재료만`이다.
  assert.equal(nodeState(row("a", "\n"), 2), "material-only");
});

// -----------------------------------------------------------------------------
// 전체 셈
// -----------------------------------------------------------------------------

const SAMPLE = [
  row("a", null, 2), //          나뉜 자리. 갈래 셈에서 빠진다
  row("a1", "필요성을 쓴다"), //  글 썼음
  row("a2", null), //             재료만
  row("b", "이론 얼개", 1), //    글 있는 나뉜 자리
  row("b1", null), //             아직 빔
];

const SAMPLE_COUNTS = counts({ a2: 2, b1: 0, a: 1 });

test("끝자리만 갈래로 센다", () => {
  const progress = summarizeOutline(SAMPLE, SAMPLE_COUNTS);

  assert.equal(progress.leaves, 3, "a와 b는 나뉜 자리라 빠진다");
  assert.equal(progress.written, 1);
  assert.equal(progress.materialOnly, 1);
  assert.equal(progress.empty, 1);
});

test("갈래를 더하면 끝자리 수가 된다", () => {
  /*
    **이 셋이 끝자리 수와 어긋나면 화면의 막대가 틀린다.** 막대는 이 셋을
    끝자리로 나눠 그린다. 어긋나면 막대가 칸을 넘치거나 모자라는데, 그
    모양만 보고는 어느 숫자가 틀렸는지 알 수 없다.
  */
  for (const rows of [SAMPLE, [], [row("only", null)], [row("only", "x", 4)]]) {
    const progress = summarizeOutline(rows, SAMPLE_COUNTS);

    assert.equal(
      progress.written + progress.materialOnly + progress.empty,
      progress.leaves,
    );
  }
});

test("자리 전부와 글 있는 자리는 따로 센다", () => {
  const progress = summarizeOutline(SAMPLE, SAMPLE_COUNTS);

  assert.equal(progress.total, 5, "나뉜 자리까지 전부 센다");
  assert.equal(progress.withBody, 2, "끝자리인지 보지 않고 글만 본다");
});

test("놓인 재료는 나뉜 자리의 것도 센다", () => {
  /*
    나뉜 자리를 갈래 셈에서 빼는 것이지 없는 것으로 치는 것이 아니다.
    거기 놓아둔 재료는 실제로 놓여 있고, 세지 않으면 화면의 `놓인 재료
    N개`가 자리를 펼쳐 세어본 수와 어긋난다.
  */
  assert.equal(summarizeOutline(SAMPLE, SAMPLE_COUNTS).placedTotal, 3);
});

test("개수표에 없는 자리는 0으로 본다", () => {
  // 재료가 하나도 없는 프로젝트에서 개수표는 비어 있다.
  const progress = summarizeOutline(SAMPLE, new Map());

  assert.equal(progress.placedTotal, 0);
  assert.equal(progress.materialOnly, 0, "a2가 재료를 잃으면 빈 자리가 된다");
  assert.equal(progress.empty, 2);
});

test("자리가 없으면 전부 0이다", () => {
  // 뼈대가 빈 프로젝트에서 화면이 0으로 나누지 않도록 막대를 그리지 않는다.
  assert.deepEqual(summarizeOutline([], new Map()), {
    total: 0,
    withBody: 0,
    placedTotal: 0,
    leaves: 0,
    written: 0,
    materialOnly: 0,
    empty: 0,
  });
});

test("개수표에만 있고 뼈대에 없는 자리는 세지 않는다", () => {
  /*
    지워진 자리의 재료가 개수표에 남아 있어도 총계를 부풀리지 않는다.
    셈의 기준은 늘 뼈대 쪽이다.
  */
  const progress = summarizeOutline([row("a", "글")], counts({ ghost: 9 }));

  assert.equal(progress.placedTotal, 0);
  assert.equal(progress.total, 1);
});
