/**
 * 물음에서 낱말 뽑기와 답의 번호 확인. (16-A-2)
 *
 * 두 가지를 본다.
 *
 * **낱말 뽑기가 틀리면 아무것도 못 찾는다.** 글자 포함 검색은 넣은 글자가
 * 통째로 들어 있는 것을 찾으므로, 물음을 그대로 넣으면 0건이 나온다.
 * 오류가 아니라 결과만 비어서 "담아둔 게 없나 보다"로 읽힌다.
 *
 * **번호 확인이 틀리면 엉뚱한 자료를 근거라고 보여준다.** 답이 `[3]`이라고
 * 적었다고 3번이 있는 것이 아니다. 근거가 틀리면 답 전체를 믿을 수 없다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_KEYWORDS,
  MAX_QUESTION_LENGTH,
  extractKeywords,
  normalizeQuestion,
} from "../src/lib/ai/question.ts";
import {
  citedIndices,
  danglingIndices,
  tidyAnswer,
} from "../src/lib/ai/answer.ts";

// -----------------------------------------------------------------------------
// 물음 다듬기
// -----------------------------------------------------------------------------

test("앞뒤 공백을 떼고 가운데를 한 칸으로 줄인다", () => {
  assert.equal(normalizeQuestion("  모델링   오류가   뭐야 "), "모델링 오류가 뭐야");
});

test("줄바꿈도 한 칸이 된다", () => {
  assert.equal(normalizeQuestion("모델링\n오류"), "모델링 오류");
});

test("너무 짧거나 글자가 아니면 null이다", () => {
  for (const value of ["", " ", "가", null, undefined, 42, {}]) {
    assert.equal(normalizeQuestion(value), null, `${String(value)}가 통과했다`);
  }
});

test("너무 길면 자른다", () => {
  const long = "가".repeat(MAX_QUESTION_LENGTH + 100);

  assert.equal(normalizeQuestion(long)?.length, MAX_QUESTION_LENGTH);
});

// -----------------------------------------------------------------------------
// 낱말 뽑기
// -----------------------------------------------------------------------------

test("물음을 낱말로 쪼갠다", () => {
  const found = extractKeywords("모델링 오류 분석");

  assert.ok(found.includes("모델링"));
  assert.ok(found.includes("오류"));
  assert.ok(found.includes("분석"));
});

test("조사를 뗀 것과 떼지 않은 것을 함께 넣는다", () => {
  /*
    이것이 이 모듈의 핵심이다. `모델링에서`로는 `모델링`이 적힌 기록을
    찾지 못한다. 그렇다고 뗀 것만 쓰면 잘못 뗐을 때 되돌릴 길이 없다.
  */
  const found = extractKeywords("모델링에서 학생들이 틀리는 곳");

  assert.ok(found.includes("모델링에서"), "떼지 않은 것이 있어야 한다");
  assert.ok(found.includes("모델링"), "뗀 것도 있어야 한다");
});

test("긴 조사를 먼저 뗀다", () => {
  // `에서는`을 `는`으로 먼저 떼면 `모델링에서`가 남는다.
  const found = extractKeywords("모델링에서는");

  assert.ok(found.includes("모델링"));
});

test("떼고 나서 한 글자만 남으면 떼지 않는다", () => {
  // `시에서`의 `에서`를 떼면 `시`가 남는데, 그것으로는 아무 데나 걸린다.
  const found = extractKeywords("시에서");

  assert.ok(!found.includes("시"));
  assert.ok(found.includes("시에서"));
});

test("묻는 말은 빼고 본다", () => {
  const found = extractKeywords("모델링이 뭐야 알려줘");

  assert.ok(!found.includes("뭐야"));
  assert.ok(!found.includes("알려줘"));
  assert.ok(found.includes("모델링"));
});

test("물음표와 쉼표가 낱말에 붙어 오지 않는다", () => {
  const found = extractKeywords("모델링, 오류는?");

  assert.ok(found.includes("모델링"));
  assert.ok(!found.some((word) => word.includes("?") || word.includes(",")));
});

test("하이픈이 든 낱말은 그대로 둔다", () => {
  const found = extractKeywords("COVID-19 관련 논문");

  assert.ok(found.includes("COVID-19"));
});

test("영문은 조사를 떼지 않는다", () => {
  // `modeling`의 끝 두 글자를 한글 조사로 볼 일이 없다.
  const found = extractKeywords("mathematical modeling");

  assert.deepEqual(found, ["mathematical", "modeling"]);
});

test("같은 낱말을 두 번 넣지 않는다", () => {
  const found = extractKeywords("모델링 모델링 모델링");

  assert.equal(found.filter((word) => word === "모델링").length, 1);
});

test("대소문자만 다른 것도 한 번만 넣는다", () => {
  const found = extractKeywords("Blum blum BLUM");

  assert.equal(found.length, 1);
});

test("낱말 수에 상한이 있다", () => {
  const many = Array.from({ length: 40 }, (_, index) => `낱말${index}`).join(" ");

  assert.equal(extractKeywords(many).length, MAX_KEYWORDS);
});

test("뽑을 것이 없으면 빈 목록이다", () => {
  // 묻는 말만 있는 경우다. 부르는 쪽이 이때 AI에 물어보지 않는다.
  assert.deepEqual(extractKeywords("뭐야 알려줘"), []);
});

// -----------------------------------------------------------------------------
// 답 다듬기
// -----------------------------------------------------------------------------

test("앞뒤 빈 줄을 떼고 긴 빈 줄을 줄인다", () => {
  assert.equal(tidyAnswer("\n\n답입니다.\n\n\n\n둘째 문단.\n\n"), "답입니다.\n\n둘째 문단.");
});

test("글 안쪽은 건드리지 않는다", () => {
  const answer = "첫 줄\n둘째 줄\n\n셋째 문단";

  assert.equal(tidyAnswer(answer), answer);
});

// -----------------------------------------------------------------------------
// 답이 가리킨 번호
// -----------------------------------------------------------------------------

test("가리킨 번호를 나온 순서대로 돌려준다", () => {
  assert.deepEqual(citedIndices("가[2] 나[1] 다[2]", 3), [2, 1]);
});

test("한 괄호에 여럿을 적은 것도 읽는다", () => {
  assert.deepEqual(citedIndices("근거는 [1, 3] 입니다", 5), [1, 3]);
});

test("없는 번호는 빼고 돌려준다", () => {
  /*
    **이 검사가 이 대목의 핵심이다.** 없는 번호를 그리면 누를 데가 없는
    줄이 생기고, 더 나쁘게는 엉뚱한 자료를 근거라고 보여주게 된다.
  */
  assert.deepEqual(citedIndices("가[1] 나[99]", 3), [1]);
});

test("0번과 음수는 번호가 아니다", () => {
  assert.deepEqual(citedIndices("가[0] 나[1]", 3), [1]);
});

test("넘긴 것이 없으면 아무 번호도 받지 않는다", () => {
  assert.deepEqual(citedIndices("가[1]", 0), []);
});

test("없는 번호를 따로 돌려준다", () => {
  // 화면에 쓰려는 것이 아니라 서버 기록에 남기려는 것이다.
  assert.deepEqual(danglingIndices("가[1] 나[99] 다[100]", 3), [99, 100]);
});

test("모두 있는 번호면 없는 번호 목록은 비어 있다", () => {
  assert.deepEqual(danglingIndices("가[1] 나[3]", 3), []);
});

test("번호를 하나도 적지 않은 답도 받는다", () => {
  // 근거를 밝히지 않은 답이다. 막지 않고 화면이 그 사실을 알린다.
  assert.deepEqual(citedIndices("근거 없이 그냥 답했습니다.", 3), []);
  assert.deepEqual(danglingIndices("근거 없이 그냥 답했습니다.", 3), []);
});
