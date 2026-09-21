/**
 * Project 입력 검증 단위 테스트.
 *
 * 색은 화면이 그대로 스타일 값에 넣고, 날짜는 두 값의 관계가 맞아야 한다.
 * 데이터베이스 제약조건과 같은 규칙이 여기서도 지켜지는지 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NAME_LENGTH,
  PROJECT_COLOR_PRESETS,
  isHexColor,
  projectInputSchema,
  resolveColor,
} from "../src/lib/projects/schema.ts";

const base = {
  name: "석사 논문",
  projectType: "",
  description: "",
  researchQuestion: "",
  targetOutput: "",
  startDate: "",
  endDate: "",
  color: "",
};

test("이름만 있으면 통과한다", () => {
  const result = projectInputSchema.safeParse(base);

  assert.equal(result.success, true);
  assert.equal(result.data.name, "석사 논문");
  assert.equal(result.data.projectType, null);
  assert.equal(result.data.startDate, null);
});

test("이름이 비어 있으면 거부한다", () => {
  for (const name of ["", "   ", "\t"]) {
    const result = projectInputSchema.safeParse({ ...base, name });

    assert.equal(result.success, false, `"${name}"는 거부되어야 한다`);
  }
});

test("이름 길이 한계를 지킨다", () => {
  const atLimit = projectInputSchema.safeParse({
    ...base,
    name: "가".repeat(MAX_NAME_LENGTH),
  });
  const overLimit = projectInputSchema.safeParse({
    ...base,
    name: "가".repeat(MAX_NAME_LENGTH + 1),
  });

  assert.equal(atLimit.success, true);
  assert.equal(overLimit.success, false);
});

test("색은 #RRGGBB 형식만 받는다", () => {
  // 이 값은 화면이 그대로 스타일에 넣는다. 형식을 좁혀두면
  // 예상 밖의 문자열이 스타일 자리에 들어갈 일이 없다.
  for (const color of ["#4f46e5", "#FFFFFF", "#000000", "#AbCdEf"]) {
    assert.equal(isHexColor(color), true, `${color}는 허용되어야 한다`);
  }

  for (const color of [
    "4f46e5",
    "#4f46e",
    "#4f46e55",
    "#gggggg",
    "red",
    "rgb(0,0,0)",
    "#4f46e5; background: url(x)",
    "",
  ]) {
    assert.equal(isHexColor(color), false, `${color}는 막아야 한다`);
  }
});

test("잘못된 색은 저장을 거부한다", () => {
  const result = projectInputSchema.safeParse({ ...base, color: "red" });

  assert.equal(result.success, false);
});

test("올바른 색은 그대로 유지한다", () => {
  const result = projectInputSchema.safeParse({ ...base, color: " #4f46e5 " });

  assert.equal(result.success, true);
  assert.equal(result.data.color, "#4f46e5");
});

test("날짜는 YYYY-MM-DD 형식이어야 한다", () => {
  for (const startDate of ["2026/09/21", "26-09-21", "9월 21일", "20260921"]) {
    const result = projectInputSchema.safeParse({ ...base, startDate });

    assert.equal(result.success, false, `${startDate}는 거부되어야 한다`);
  }
});

test("종료일이 시작일보다 앞서면 거부한다", () => {
  const result = projectInputSchema.safeParse({
    ...base,
    startDate: "2026-09-21",
    endDate: "2026-09-20",
  });

  assert.equal(result.success, false);
});

test("종료일과 시작일이 같으면 통과한다", () => {
  const result = projectInputSchema.safeParse({
    ...base,
    startDate: "2026-09-21",
    endDate: "2026-09-21",
  });

  assert.equal(result.success, true);
});

test("한쪽 날짜만 있어도 통과한다", () => {
  const onlyStart = projectInputSchema.safeParse({
    ...base,
    startDate: "2026-09-21",
  });
  const onlyEnd = projectInputSchema.safeParse({
    ...base,
    endDate: "2026-09-21",
  });

  assert.equal(onlyStart.success, true);
  assert.equal(onlyEnd.success, true);
});

test("빈 선택 항목은 null이 된다", () => {
  const result = projectInputSchema.safeParse({
    ...base,
    projectType: "   ",
    description: "",
    researchQuestion: "  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.projectType, null);
  assert.equal(result.data.description, null);
  assert.equal(result.data.researchQuestion, null);
});

test("연구 질문과 목표 산출물을 저장한다", () => {
  const result = projectInputSchema.safeParse({
    ...base,
    researchQuestion: "오류는 어떻게 학습 자원이 되는가",
    targetOutput: "논문 초고",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.researchQuestion, "오류는 어떻게 학습 자원이 되는가");
  assert.equal(result.data.targetOutput, "논문 초고");
});

test("미리 고르는 색은 모두 올바른 형식이다", () => {
  assert.ok(PROJECT_COLOR_PRESETS.length > 0);

  for (const preset of PROJECT_COLOR_PRESETS) {
    assert.equal(isHexColor(preset), true, `${preset}가 올바르지 않다`);
  }
});

test("색 없음을 고르면 색을 저장하지 않는다", () => {
  assert.equal(resolveColor("none", "#ff0000"), "");
});

test("미리 고른 색을 그대로 쓴다", () => {
  const preset = PROJECT_COLOR_PRESETS[0];

  assert.equal(resolveColor(preset, "#ff0000"), preset);
});

test("직접 고르기를 선택하면 색상 선택기 값을 쓴다", () => {
  assert.equal(resolveColor("custom", " #123abc "), "#123abc");
});

test("목록에 없는 값을 라디오로 보내면 색을 쓰지 않는다", () => {
  // 화면이 보낸 값을 그대로 믿지 않는다. 라디오 값은 조작할 수 있다.
  for (const forged of ["#000000", "javascript:alert(1)", "red", ""]) {
    assert.equal(
      resolveColor(forged, "#ff0000"),
      "",
      `${forged}는 무시되어야 한다`,
    );
  }
});

test("직접 고른 색도 형식 검사를 통과해야 저장된다", () => {
  const bad = projectInputSchema.safeParse({
    ...base,
    color: resolveColor("custom", "not-a-color"),
  });
  const good = projectInputSchema.safeParse({
    ...base,
    color: resolveColor("custom", "#123abc"),
  });

  assert.equal(bad.success, false);
  assert.equal(good.success, true);
  assert.equal(good.data.color, "#123abc");
});
