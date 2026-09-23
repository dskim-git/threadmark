/**
 * 목록 정렬과 보기 단위 검사.
 *
 * 이 값들은 **주소에 남는다.** 즐겨찾기에 담기고, 사용자가 손으로 고쳐 쓸 수도
 * 있다. 그래서 모르는 값이 들어왔을 때 멈추지 않고 기본값으로 돌아가는지가
 * 중요하다. 목록에서 항목 하나를 빼면 그 주소를 담아둔 사람이 빈 화면을 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIST_VIEW,
  DEFAULT_PAPER_SORT,
  DEFAULT_SOURCE_SORT,
  PAPER_SORTS,
  SOURCE_SORTS,
  isPaperSort,
  isSourceSort,
  readListView,
  readPaperSort,
  readSourceSort,
  sourceSortOrder,
} from "../src/lib/sources/sorting.ts";

// -----------------------------------------------------------------------------
// 자료 목록
// -----------------------------------------------------------------------------

test("자료 정렬 넷이 있다", () => {
  assert.deepEqual(
    SOURCE_SORTS.map((sort) => sort.value),
    ["recent", "updated", "title", "oldest"],
  );
});

test("정렬마다 우리말 이름이 있다", () => {
  for (const sort of SOURCE_SORTS) {
    assert.ok(sort.label.trim().length > 0, `${sort.value}에 이름이 없다`);
  }
});

test("정렬 이름이 겹치지 않는다", () => {
  // 같은 이름이 둘이면 무엇을 고른 것인지 알 수 없다.
  const labels = SOURCE_SORTS.map((sort) => sort.label);

  assert.equal(new Set(labels).size, labels.length);
});

test("정렬마다 데이터베이스 열과 방향이 정해져 있다", () => {
  for (const sort of SOURCE_SORTS) {
    assert.ok(
      ["created_at", "updated_at", "title"].includes(sort.column),
      `${sort.value}의 열 이름이 이상하다`,
    );
    assert.equal(typeof sort.ascending, "boolean");
  }
});

test("담은 순과 오래된 순은 같은 열을 반대로 본다", () => {
  const recent = sourceSortOrder("recent");
  const oldest = sourceSortOrder("oldest");

  assert.equal(recent.column, oldest.column);
  assert.notEqual(recent.ascending, oldest.ascending);
});

test("제목순은 가나다 방향이다", () => {
  const title = sourceSortOrder("title");

  assert.equal(title.column, "title");
  assert.equal(title.ascending, true);
});

test("모르는 값은 기본 정렬로 본다", () => {
  /*
    주소는 사용자가 고쳐 쓸 수 있고, 오래된 즐겨찾기에는 없어진 값이
    남아 있을 수 있다. 거기서 멈추면 목록 자체를 못 본다.
  */
  assert.equal(readSourceSort("size"), DEFAULT_SOURCE_SORT);
  assert.equal(readSourceSort(""), DEFAULT_SOURCE_SORT);
  assert.equal(readSourceSort(undefined), DEFAULT_SOURCE_SORT);
  assert.equal(readSourceSort(null), DEFAULT_SOURCE_SORT);
  assert.equal(readSourceSort(["title"]), DEFAULT_SOURCE_SORT);
});

test("아는 값은 그대로 통과한다", () => {
  assert.equal(readSourceSort("title"), "title");
  assert.ok(isSourceSort("updated"));
  assert.ok(!isSourceSort("year_desc"));
});

test("기본 정렬이 목록 안에 있다", () => {
  assert.ok(isSourceSort(DEFAULT_SOURCE_SORT));
});

// -----------------------------------------------------------------------------
// 논문 목록
// -----------------------------------------------------------------------------

test("논문 정렬 넷이 있다", () => {
  assert.deepEqual(
    PAPER_SORTS.map((sort) => sort.value),
    ["year_desc", "year_asc", "recent", "citation"],
  );
});

test("논문 정렬은 자료 정렬과 섞이지 않는다", () => {
  /*
    두 화면은 찾는 방법이 다르다. 자료 목록은 제목으로, 논문 목록은
    참고문헌으로 찾는다. 한 목록으로 묶으면 양쪽 모두 어정쩡해진다.
  */
  assert.ok(!isPaperSort("title"));
  assert.ok(!isSourceSort("citation"));
});

test("논문 쪽도 모르는 값은 기본값으로 본다", () => {
  assert.equal(readPaperSort("title"), DEFAULT_PAPER_SORT);
  assert.equal(readPaperSort(undefined), DEFAULT_PAPER_SORT);
  assert.ok(isPaperSort(DEFAULT_PAPER_SORT));
});

// -----------------------------------------------------------------------------
// 보기
// -----------------------------------------------------------------------------

test("보기는 격자가 기본이다", () => {
  assert.equal(DEFAULT_LIST_VIEW, "grid");
  assert.equal(readListView(undefined), "grid");
  assert.equal(readListView("grid"), "grid");
});

test("목록 보기를 고를 수 있다", () => {
  assert.equal(readListView("list"), "list");
});

test("모르는 보기는 격자로 본다", () => {
  assert.equal(readListView("table"), "grid");
  assert.equal(readListView(""), "grid");
  assert.equal(readListView(null), "grid");
});
