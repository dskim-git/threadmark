/**
 * 선택 문장 번역 규칙 단위 검사. (설계 문서 9.4절)
 *
 * 여기서 지키려는 것은 둘이다.
 *
 * 하나, 밖으로 나가는 글의 크기와 건수가 제한된다.
 * 9.4절의 첫 원칙이 "논문 전체를 자동 전송하지 않는다"이고, 이 요청은
 * 한 건마다 돈이 든다. 제한이 느슨해지면 조용히 비싸진다.
 *
 * 둘, 번역기가 돌려준 글을 우리가 함부로 손대지 않는다.
 * 앞뒤에 붙은 군더더기만 떼고, 글 안쪽은 그대로 둔다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRANSLATION_LANGUAGE,
  MAX_TRANSLATION_INPUT_LENGTH,
  TRANSLATION_LANGUAGES,
  getTranslationLanguageLabel,
  isTranslationLanguage,
} from "../src/lib/translation/types.ts";
import {
  tidyTranslationOutput,
  translationRequestSchema,
} from "../src/lib/translation/schema.ts";
import {
  TRANSLATION_MAX_PER_WINDOW,
  TRANSLATION_WINDOW_MS,
  takeTranslationSlot,
} from "../src/lib/translation/rate-limit.ts";

// -----------------------------------------------------------------------------
// 언어
// -----------------------------------------------------------------------------

test("기본 언어는 고를 수 있는 언어 가운데 하나다", () => {
  assert.equal(isTranslationLanguage(DEFAULT_TRANSLATION_LANGUAGE), true);
});

test("모르는 언어 코드는 받지 않는다", () => {
  assert.equal(isTranslationLanguage("kr"), false);
  assert.equal(isTranslationLanguage(""), false);
  assert.equal(isTranslationLanguage(null), false);
  assert.equal(isTranslationLanguage(undefined), false);
  assert.equal(isTranslationLanguage(123), false);
});

test("언어 이름은 사람이 읽는 말로 돌려준다", () => {
  assert.equal(getTranslationLanguageLabel("ko"), "한국어");
  assert.equal(getTranslationLanguageLabel("en"), "English");
});

test("언어 목록에 중복이 없다", () => {
  const codes = TRANSLATION_LANGUAGES.map((language) => language.code);

  assert.equal(new Set(codes).size, codes.length);
});

// -----------------------------------------------------------------------------
// 요청 검증 — 크기 제한
// -----------------------------------------------------------------------------

test("빈 글은 보내지 않는다", () => {
  const result = translationRequestSchema.safeParse({
    text: "   \n  ",
    targetLanguage: "ko",
  });

  assert.equal(result.success, false);
});

test("앞뒤 공백은 보내기 전에 정리한다", () => {
  const result = translationRequestSchema.safeParse({
    text: "  The student's error is  ",
    targetLanguage: "ko",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.text, "The student's error is");
});

test("길이 상한까지는 통과한다", () => {
  const result = translationRequestSchema.safeParse({
    text: "가".repeat(MAX_TRANSLATION_INPUT_LENGTH),
    targetLanguage: "ko",
  });

  assert.equal(result.success, true);
});

test("길이 상한을 한 글자라도 넘으면 거부한다", () => {
  const result = translationRequestSchema.safeParse({
    text: "가".repeat(MAX_TRANSLATION_INPUT_LENGTH + 1),
    targetLanguage: "ko",
  });

  assert.equal(result.success, false);
});

test("길이는 공백을 정리한 뒤에 잰다", () => {
  // 공백으로 상한을 넘기고 알맹이는 짧은 경우. 거부하면 과잉 차단이다.
  const result = translationRequestSchema.safeParse({
    text: `  ${"가".repeat(10)}${" ".repeat(MAX_TRANSLATION_INPUT_LENGTH)}`,
    targetLanguage: "ko",
  });

  assert.equal(result.success, true);
});

test("모르는 언어로는 옮기지 않는다", () => {
  const result = translationRequestSchema.safeParse({
    text: "hello",
    targetLanguage: "kr",
  });

  assert.equal(result.success, false);
});

// -----------------------------------------------------------------------------
// 결과 다듬기
// -----------------------------------------------------------------------------

test("앞뒤 빈 줄을 떼어낸다", () => {
  assert.equal(tidyTranslationOutput("\n\n학생의 오류는\n\n"), "학생의 오류는");
});

test("글 전체를 감싼 따옴표만 벗긴다", () => {
  assert.equal(tidyTranslationOutput('"학생의 오류는"'), "학생의 오류는");
  assert.equal(tidyTranslationOutput("“학생의 오류는”"), "학생의 오류는");
});

test("글 안에 따옴표가 또 있으면 벗기지 않는다", () => {
  // 인용 안의 인용일 수 있다. 벗기면 번역문이 망가진다.
  const value = '"그는 "왜"라고 물었다"';

  assert.equal(tidyTranslationOutput(value), value);
});

test("짝이 맞지 않는 따옴표는 그대로 둔다", () => {
  assert.equal(tidyTranslationOutput('"학생의 오류는'), '"학생의 오류는');
});

test("글 안쪽의 줄바꿈은 건드리지 않는다", () => {
  // 9.4절: 원문은 수정하지 않는다. 번역문의 문단 나눔도 우리가 정하지 않는다.
  assert.equal(
    tidyTranslationOutput("첫째 문단\n\n둘째 문단"),
    "첫째 문단\n\n둘째 문단",
  );
});

// -----------------------------------------------------------------------------
// 건수 제한
// -----------------------------------------------------------------------------

test("한도까지는 통과시킨다", () => {
  let history = [];

  for (let i = 0; i < TRANSLATION_MAX_PER_WINDOW; i += 1) {
    const decision = takeTranslationSlot(history, 1000 + i);

    assert.equal(decision.allowed, true, `${i + 1}번째가 막혔다`);
    history = decision.next;
  }

  assert.equal(history.length, TRANSLATION_MAX_PER_WINDOW);
});

test("한도를 넘으면 막는다", () => {
  const history = Array.from(
    { length: TRANSLATION_MAX_PER_WINDOW },
    (_, i) => 1000 + i,
  );

  const decision = takeTranslationSlot(history, 2000);

  assert.equal(decision.allowed, false);
  assert.ok(decision.retryAfterMs > 0);
});

test("막힌 요청은 세지 않는다", () => {
  // 세면 계속 누르는 동안 가장 오래된 기록이 밀려나지 않아 영영 풀리지 않는다.
  const history = Array.from(
    { length: TRANSLATION_MAX_PER_WINDOW },
    (_, i) => 1000 + i,
  );

  const first = takeTranslationSlot(history, 2000);
  const second = takeTranslationSlot(first.next, 2001);

  assert.equal(first.next.length, TRANSLATION_MAX_PER_WINDOW);
  assert.equal(second.next.length, TRANSLATION_MAX_PER_WINDOW);
});

test("구간이 지나면 다시 통과시킨다", () => {
  const history = Array.from(
    { length: TRANSLATION_MAX_PER_WINDOW },
    (_, i) => 1000 + i,
  );

  const decision = takeTranslationSlot(
    history,
    1000 + TRANSLATION_WINDOW_MS + 1,
  );

  assert.equal(decision.allowed, true);
});

test("구간을 벗어난 기록은 쌓이지 않는다", () => {
  const old = Array.from({ length: 50 }, (_, i) => i);

  const decision = takeTranslationSlot(old, TRANSLATION_WINDOW_MS + 100);

  // 오래된 것이 모두 빠지고 이번 것 하나만 남는다.
  assert.equal(decision.next.length, 1);
});

test("기다려야 하는 시간은 구간을 넘지 않는다", () => {
  const history = Array.from(
    { length: TRANSLATION_MAX_PER_WINDOW },
    () => 1000,
  );

  const decision = takeTranslationSlot(history, 1000);

  assert.equal(decision.allowed, false);
  assert.ok(decision.retryAfterMs <= TRANSLATION_WINDOW_MS);
});

test("받은 기록을 고쳐 쓰지 않는다", () => {
  const history = Object.freeze([1000]);

  const decision = takeTranslationSlot(history, 1001);

  assert.equal(history.length, 1);
  assert.equal(decision.next.length, 2);
});
