/**
 * Capture 입력 검증 단위 테스트.
 *
 * 설계 문서 2.4절은 원문과 사용자의 생각을 구분하라고 한다.
 * 그 구분은 "원문 칸이 있다"로 끝나지 않는다. 인용이라면서 원문을 비워두면
 * 구분은 이름뿐이 된다. 여기서는 그 요구사항이 실제로 강제되는지 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TEXT_LENGTH,
  captureInputSchema,
} from "../src/lib/captures/schema.ts";
import {
  AVAILABLE_CAPTURE_TYPES,
  CAPTURE_TYPES,
  UNAVAILABLE_CAPTURE_TYPES,
  getCaptureTypeHint,
  getCaptureTypeLabel,
  isCaptureType,
  requiresOriginalText,
  requiresTranslation,
} from "../src/lib/captures/types.ts";

const base = {
  captureType: "note",
  sourceId: null,
  content: "생각을 적었다",
  originalText: "",
  translatedText: "",
  translationLanguage: "",
};

test("기록 유형은 설계 문서 6.1절의 12가지다", () => {
  assert.equal(CAPTURE_TYPES.length, 12);
  assert.deepEqual(
    [...CAPTURE_TYPES],
    [
      "quote",
      "translation",
      "summary",
      "paraphrase",
      "interpretation",
      "question",
      "counterpoint",
      "idea",
      "todo",
      "note",
      "handwriting",
      "voice",
    ],
  );
});

test("모든 유형에 표시 이름과 안내 문구가 있다", () => {
  for (const type of CAPTURE_TYPES) {
    assert.notEqual(getCaptureTypeLabel(type), "기록", `${type} 이름 없음`);
    assert.ok(getCaptureTypeHint(type).length > 0, `${type} 안내 없음`);
  }
});

test("파일이 필요한 유형은 화면 목록에서 제외한다", () => {
  // 손글씨와 음성은 Drive 연동이 있어야 의미가 생긴다.
  for (const type of UNAVAILABLE_CAPTURE_TYPES) {
    assert.ok(
      !AVAILABLE_CAPTURE_TYPES.includes(type),
      `${type}이 화면 목록에 남아 있다`,
    );
  }

  assert.equal(
    AVAILABLE_CAPTURE_TYPES.length,
    CAPTURE_TYPES.length - UNAVAILABLE_CAPTURE_TYPES.length,
  );
});

test("제외된 유형도 유형 체계에는 남아 있다", () => {
  // 설계 문서의 분류를 임의로 줄이지 않는다. 화면만 제한한다.
  for (const type of UNAVAILABLE_CAPTURE_TYPES) {
    assert.ok(isCaptureType(type));
  }
});

test("알 수 없는 값은 기록 유형이 아니다", () => {
  for (const value of [null, undefined, "", "QUOTE", "memo", 3, {}]) {
    assert.equal(isCaptureType(value), false);
  }
});

test("인용과 번역만 원문을 요구한다", () => {
  assert.equal(requiresOriginalText("quote"), true);
  assert.equal(requiresOriginalText("translation"), true);

  for (const type of CAPTURE_TYPES) {
    if (type === "quote" || type === "translation") {
      continue;
    }

    assert.equal(
      requiresOriginalText(type),
      false,
      `${type}은 원문을 요구하지 않아야 한다`,
    );
  }
});

test("번역만 번역문을 요구한다", () => {
  assert.equal(requiresTranslation("translation"), true);
  assert.equal(requiresTranslation("quote"), false);
  assert.equal(requiresTranslation("note"), false);
});

test("일반 메모는 내용만으로 통과한다", () => {
  const result = captureInputSchema.safeParse(base);

  assert.equal(result.success, true);
  assert.equal(result.data.content, "생각을 적었다");
  assert.equal(result.data.originalText, null);
});

test("인용에 원문이 없으면 거부한다", () => {
  // 원문 없는 인용은 나중에 무엇을 옮긴 것인지 확인할 수 없다.
  const result = captureInputSchema.safeParse({
    ...base,
    captureType: "quote",
    content: "이 부분이 중요하다",
    originalText: "",
  });

  assert.equal(result.success, false);
});

test("인용에 원문이 있으면 내 메모가 없어도 통과한다", () => {
  const result = captureInputSchema.safeParse({
    ...base,
    captureType: "quote",
    content: "",
    originalText: "학생의 오류는 사고의 흔적이다",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.content, null);
  assert.equal(result.data.originalText, "학생의 오류는 사고의 흔적이다");
});

test("번역은 원문, 번역문, 언어가 모두 필요하다", () => {
  const missing = [
    { originalText: "", translatedText: "옮긴 글", translationLanguage: "한국어" },
    { originalText: "original", translatedText: "", translationLanguage: "한국어" },
    { originalText: "original", translatedText: "옮긴 글", translationLanguage: "" },
  ];

  for (const fields of missing) {
    const result = captureInputSchema.safeParse({
      ...base,
      captureType: "translation",
      content: "",
      ...fields,
    });

    assert.equal(
      result.success,
      false,
      `${JSON.stringify(fields)}는 거부되어야 한다`,
    );
  }
});

test("번역이 모두 갖춰지면 통과한다", () => {
  const result = captureInputSchema.safeParse({
    ...base,
    captureType: "translation",
    content: "",
    originalText: "Errors reveal thinking.",
    translatedText: "오류는 사고를 드러낸다.",
    translationLanguage: "한국어",
  });

  assert.equal(result.success, true);
});

test("아무 내용도 없으면 거부한다", () => {
  const result = captureInputSchema.safeParse({
    ...base,
    content: "",
    originalText: "",
    translatedText: "",
  });

  assert.equal(result.success, false);
});

test("공백만 있는 입력은 비어 있는 것으로 본다", () => {
  const result = captureInputSchema.safeParse({
    ...base,
    content: "   \n  ",
  });

  assert.equal(result.success, false);
});

test("길이 한계를 지킨다", () => {
  const atLimit = captureInputSchema.safeParse({
    ...base,
    content: "가".repeat(MAX_TEXT_LENGTH),
  });
  const overLimit = captureInputSchema.safeParse({
    ...base,
    content: "가".repeat(MAX_TEXT_LENGTH + 1),
  });

  assert.equal(atLimit.success, true);
  assert.equal(overLimit.success, false);
});

test("자료 식별자가 uuid가 아니면 연결하지 않는다", () => {
  // 잘못된 값으로 저장을 막기보다, 자료 없는 기록으로 처리한다.
  // 실제 연결 가능 여부는 데이터베이스 트리거가 소유자까지 확인한다.
  const result = captureInputSchema.safeParse({
    ...base,
    sourceId: "not-a-uuid",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sourceId, null);
});

test("올바른 자료 식별자는 유지한다", () => {
  const id = "85c9f6dd-338b-432d-9131-ae57b1f882ea";
  const result = captureInputSchema.safeParse({ ...base, sourceId: id });

  assert.equal(result.success, true);
  assert.equal(result.data.sourceId, id);
});
