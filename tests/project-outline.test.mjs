/**
 * 뼈대 세우기 단위 테스트. (19-A)
 *
 * 화면이 자리를 그리는 순서, 번호, 깊이가 전부 이 셈에서 나온다.
 * 틀리면 자리가 사라지거나 엉뚱한 곳에 붙는데, **브라우저에서 눈으로 찾기
 * 어려운 종류의 잘못**이다. 특히 고리가 생기면 화면이 멈춘다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_INDENT_STEPS,
  buildOutline,
  indentSteps,
  neighborToSwap,
} from "../src/lib/projects/outline.ts";

/** 검사에서 쓰기 편한 자리 하나. */
function node(id, parentId, title, position) {
  return { id, parentId, title, body: null, position };
}

const SAMPLE = [
  node("a", null, "서론", 0),
  node("a1", "a", "연구의 필요성", 0),
  node("a2", "a", "연구 문제", 1),
  node("b", null, "이론적 배경", 1),
  node("b1", "b", "선행 연구", 0),
  node("b1a", "b1", "국내", 0),
];

test("그릴 순서대로 펼친다", () => {
  // 부모 바로 뒤에 그 자손이 온다. 화면은 들여쓰기만 하면 된다.
  assert.deepEqual(
    buildOutline(SAMPLE).map((item) => item.id),
    ["a", "a1", "a2", "b", "b1", "b1a"],
  );
});

test("깊이를 센다", () => {
  assert.deepEqual(
    buildOutline(SAMPLE).map((item) => item.depth),
    [0, 1, 1, 0, 1, 2],
  );
});

test("번호를 매긴다", () => {
  // 담지 않고 순서를 보고 센다. 자리를 옮기면 저절로 따라온다.
  assert.deepEqual(
    buildOutline(SAMPLE).map((item) => item.number),
    ["1", "1.1", "1.2", "2", "2.1", "2.1.1"],
  );
});

test("아래에 몇이 달렸는지 센다", () => {
  const byId = Object.fromEntries(
    buildOutline(SAMPLE).map((item) => [item.id, item.descendantCount]),
  );

  assert.equal(byId.a, 2);
  assert.equal(byId.b, 2);
  assert.equal(byId.b1, 1);
  assert.equal(byId.b1a, 0);
});

test("형제를 순서대로 놓는다", () => {
  // 담긴 차례가 뒤섞여 와도 position대로 그린다.
  const shuffled = [
    node("c", null, "셋", 2),
    node("a", null, "하나", 0),
    node("b", null, "둘", 1),
  ];

  assert.deepEqual(
    buildOutline(shuffled).map((item) => item.title),
    ["하나", "둘", "셋"],
  );
});

test("순서가 같으면 이름으로 가른다", () => {
  /*
    새로 만든 자리들이 같은 순서 값을 가질 수 있다. 그때 그리는 차례가
    새로고침마다 달라지면 사용자는 자리가 움직인다고 느낀다.
  */
  const tied = [node("a", null, "나", 0), node("b", null, "가", 0)];

  assert.deepEqual(
    buildOutline(tied).map((item) => item.title),
    ["가", "나"],
  );
});

test("부모를 못 찾은 자리를 버리지 않는다", () => {
  /*
    조용히 사라지는 것이 가장 나쁘다. 사용자는 지워진 줄 안다.
    맨 윗칸으로 올려서 보이게 한다.
  */
  const orphan = [node("a", null, "있는 부모", 0), node("x", "없음", "고아", 0)];

  const built = buildOutline(orphan);

  /*
    둘 다 보이고 둘 다 맨 윗칸이다. **그리는 차례는 보지 않는다.**
    올라온 자리는 형제들과 같은 순서 값을 갖게 되고, 그러면 이름으로
    갈린다. 여기서 차례를 못 박으면 이름을 바꿀 때마다 검사가 깨진다.
  */
  assert.equal(built.length, 2);
  assert.deepEqual(
    built.map((item) => item.depth),
    [0, 0],
  );
  assert.deepEqual(
    new Set(built.map((item) => item.id)),
    new Set(["a", "x"]),
  );
});

test("자기 자신을 부모로 둔 자리도 보인다", () => {
  const selfParent = [node("a", "a", "나 자신", 0)];

  assert.deepEqual(
    buildOutline(selfParent).map((item) => [item.id, item.depth]),
    [["a", 0]],
  );
});

test("고리가 있어도 멈추지 않는다", () => {
  /*
    데이터베이스가 막고 있지만 화면이 그것에만 기대지 않는다.
    그리다 멈추지 않는 화면은 새로고침으로도 못 고친다.

    a가 b의 자식이고 b가 a의 자식이면 둘 다 부모가 목록에 있으므로
    맨 윗칸으로 올라오지 않는다. 그래도 각 자리를 한 번만 그려야 한다.
  */
  const cycle = [node("a", "b", "가", 0), node("b", "a", "나", 0)];

  const built = buildOutline(cycle);

  assert.ok(built.length <= 2);
  assert.equal(new Set(built.map((item) => item.id)).size, built.length);
});

test("빈 뼈대는 빈 목록이다", () => {
  assert.deepEqual([...buildOutline([])], []);
});

test("깊이가 몇 단이든 센다", () => {
  // 담는 깊이에는 한계가 없다. (설계 문서 7.3절)
  const deep = Array.from({ length: 12 }, (_, index) =>
    node(`n${index}`, index === 0 ? null : `n${index - 1}`, `${index}단`, 0),
  );

  const built = buildOutline(deep);

  assert.equal(built.length, 12);
  assert.equal(built.at(-1).depth, 11);
  assert.equal(built.at(-1).number, "1.1.1.1.1.1.1.1.1.1.1.1");
});

// -----------------------------------------------------------------------------
// 들여쓰기
// -----------------------------------------------------------------------------

test("들여쓰기에는 한계가 있다", () => {
  /*
    담는 깊이에는 한계가 없지만 들여쓰기에는 있다. 좁은 화면에서 계속
    들여쓰면 글자가 설 자리가 없어진다.
  */
  assert.equal(indentSteps(0), 0);
  assert.equal(indentSteps(3), 3);
  assert.equal(indentSteps(MAX_INDENT_STEPS), MAX_INDENT_STEPS);
  assert.equal(indentSteps(MAX_INDENT_STEPS + 5), MAX_INDENT_STEPS);
});

test("이상한 깊이가 와도 음수로 들여쓰지 않는다", () => {
  assert.equal(indentSteps(-3), 0);
});

// -----------------------------------------------------------------------------
// 자리 옮기기
// -----------------------------------------------------------------------------

const SIBLINGS = [
  node("a", null, "가", 0),
  node("b", null, "나", 1),
  node("c", null, "다", 2),
];

test("위아래로 바꿀 이웃을 찾는다", () => {
  assert.equal(neighborToSwap(SIBLINGS, "b", "up").id, "a");
  assert.equal(neighborToSwap(SIBLINGS, "b", "down").id, "c");
});

test("맨 끝에서는 더 가지 않는다", () => {
  // 부르는 쪽이 아무것도 하지 않는다. 오류가 아니다.
  assert.equal(neighborToSwap(SIBLINGS, "a", "up"), null);
  assert.equal(neighborToSwap(SIBLINGS, "c", "down"), null);
});

test("목록에 없는 자리는 옮기지 않는다", () => {
  assert.equal(neighborToSwap(SIBLINGS, "없음", "up"), null);
  assert.equal(neighborToSwap([], "a", "down"), null);
});

test("담긴 차례가 뒤섞여 있어도 이웃을 제대로 찾는다", () => {
  const shuffled = [SIBLINGS[2], SIBLINGS[0], SIBLINGS[1]];

  assert.equal(neighborToSwap(shuffled, "b", "up").id, "a");
});
