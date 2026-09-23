/**
 * 검색어 다듬기 단위 검사. (설계 문서 22절 "기본 키워드 검색")
 *
 * 여기서 틀리면 **오류가 나지 않고 결과만 틀린다.** 화면은 멀쩡히 목록을
 * 보여주는데 있어야 할 것이 없거나 없어야 할 것이 섞인다. 사용자는 검색이
 * 잘못됐다고 생각하지 않고 "그런 자료가 없나 보다" 하고 넘어간다.
 *
 * 그래서 특수 문자마다 하나씩 붙잡아 둔다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SEARCH_LENGTH,
  MIN_SEARCH_LENGTH,
  buildIlikeFilter,
  normalizeSearchTerm,
  toLikePattern,
} from "../src/lib/search/query.ts";

// -----------------------------------------------------------------------------
// 검색어 다듬기
// -----------------------------------------------------------------------------

test("앞뒤 공백을 떼어낸다", () => {
  assert.equal(normalizeSearchTerm("  모델링  "), "모델링");
});

test("가운데 여러 칸은 한 칸으로 줄인다", () => {
  // 붙여넣기로 줄바꿈과 탭이 섞여 들어오는 일이 잦다.
  assert.equal(normalizeSearchTerm("수학적\n\n모델링"), "수학적 모델링");
  assert.equal(normalizeSearchTerm("수학적   모델링"), "수학적 모델링");
  assert.equal(normalizeSearchTerm("수학적\t모델링"), "수학적 모델링");
});

test("한 글자도 찾는다", () => {
  // `김`이나 `AI`처럼 짧은 말이 실제로 쓰인다.
  assert.equal(normalizeSearchTerm("김"), "김");
  assert.equal(MIN_SEARCH_LENGTH, 1);
});

test("찾을 것이 없으면 null이다", () => {
  assert.equal(normalizeSearchTerm(""), null);
  assert.equal(normalizeSearchTerm("   "), null);
  assert.equal(normalizeSearchTerm("\n\t "), null);
  assert.equal(normalizeSearchTerm(undefined), null);
  assert.equal(normalizeSearchTerm(null), null);
  assert.equal(normalizeSearchTerm(["모델링"]), null);
});

test("너무 긴 검색어는 자른다", () => {
  const long = "가".repeat(MAX_SEARCH_LENGTH + 50);

  assert.equal(normalizeSearchTerm(long)?.length, MAX_SEARCH_LENGTH);
});

// -----------------------------------------------------------------------------
// 글자 포함 무늬
// -----------------------------------------------------------------------------

test("앞뒤를 감싸 어디에 있든 찾는다", () => {
  // 붙여 쓴 말 안에서도 찾아야 한다. `모델링`으로 `수학적모델링`을 찾는다.
  assert.equal(toLikePattern("모델링"), "%모델링%");
});

test("퍼센트 기호를 글자 그대로 찾는다", () => {
  /*
    막지 않으면 `50%`의 `%`가 "아무 글자나"로 읽혀 `50`으로 시작하는 것이
    전부 딸려 나온다. 오류가 아니라 결과가 틀린다.
  */
  assert.equal(toLikePattern("50%"), "%50\\%%");
});

test("밑줄을 글자 그대로 찾는다", () => {
  // `_`는 "한 글자"를 뜻한다. `source_id`를 찾으면 `sourceXid`도 걸린다.
  assert.equal(toLikePattern("source_id"), "%source\\_id%");
});

test("역슬래시를 글자 그대로 찾는다", () => {
  assert.equal(toLikePattern("C:\\경로"), "%C:\\\\경로%");
});

// -----------------------------------------------------------------------------
// 조건 만들기
// -----------------------------------------------------------------------------

test("열마다 조건을 만들어 쉼표로 잇는다", () => {
  assert.equal(
    buildIlikeFilter(["title", "description"], "모델링"),
    'title.ilike."%모델링%",description.ilike."%모델링%"',
  );
});

test("검색어의 쉼표가 조건을 쪼개지 않는다", () => {
  /*
    쉼표는 조건을 가르는 표시다. 감싸지 않으면 `Blum, W.`가
    `title.ilike.%Blum` 과 ` W.%` 두 조건으로 쪼개져, 뒤엣것이 열 이름으로
    읽힌다. 참고문헌을 그대로 붙여넣는 일이 잦아서 실제로 만나는 경우다.
  */
  const filter = buildIlikeFilter(["title"], "Blum, W.");

  assert.equal(filter, 'title.ilike."%Blum, W.%"');
  // 조건이 하나여야 한다. 쉼표로 갈라 세어 본다.
  assert.equal(filter.split('",').length, 1);
});

test("검색어의 큰따옴표가 감싼 것을 깨지 않는다", () => {
  assert.equal(
    buildIlikeFilter(["content"], '그는 "모델링"이라 불렀다'),
    'content.ilike."%그는 \\"모델링\\"이라 불렀다%"',
  );
});

test("괄호가 들어가도 조건이 하나로 남는다", () => {
  // PostgREST에서 괄호는 조건을 묶는 표시다.
  const filter = buildIlikeFilter(["title"], "김대수(2021)");

  assert.equal(filter, 'title.ilike."%김대수(2021)%"');
});

test("막는 순서가 뒤바뀌지 않는다", () => {
  /*
    무늬를 먼저 만들고(`%` 막기) 그다음에 감싸야 한다. 반대로 하면 무늬를
    만들며 넣은 `\`가 감싸는 쪽에서 다시 먹혀 사라지고, 퍼센트가 다시
    "아무 글자나"로 살아난다.

    `50%`는 `\%`(글자 그대로의 퍼센트)가 되고, 그 `\`는 감싼 안에서
    `\\`로 한 번 더 막혀야 한다.
  */
  assert.equal(buildIlikeFilter(["title"], "50%"), 'title.ilike."%50\\\\%%"');
});

test("열이 하나여도 여럿이어도 같은 값을 쓴다", () => {
  const one = buildIlikeFilter(["title"], "가,나");
  const many = buildIlikeFilter(["title", "subtitle"], "가,나");

  assert.ok(many.startsWith(one));
  assert.ok(many.includes('subtitle.ilike."%가,나%"'));
});
