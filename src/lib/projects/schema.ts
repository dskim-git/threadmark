/**
 * Project 입력 검증.
 *
 * 데이터베이스 제약조건과 같은 규칙을 여기서도 확인한다.
 * 데이터베이스가 막아주더라도, 사용자에게는 무엇이 잘못되었는지 알려줄 문구가 필요하다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import { z } from "zod";

export const MAX_NAME_LENGTH = 200;
export const MAX_TYPE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_LONG_TEXT_LENGTH = 2000;

/** 목록에서 프로젝트를 구분하기 위한 색. 화면이 그대로 스타일에 넣는 값이다. */
export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * 미리 고를 수 있는 색.
 *
 * 16진수 색상 코드를 외우고 있는 사람은 드물다. 대부분은 여기서 고르면 되고,
 * 원하는 색이 없으면 색상 선택기로 직접 고른다.
 */
export const PROJECT_COLOR_PRESETS: readonly string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/**
 * 색 선택 결과를 저장할 값으로 바꾼다.
 *
 * 화면은 라디오 버튼(choice)과 색상 선택기(custom) 두 값을 보낸다.
 * 어느 것을 쓸지는 서버가 정한다. 화면이 보낸 값을 그대로 믿지 않기 위해서다.
 *
 *   none    색을 쓰지 않는다
 *   custom  색상 선택기의 값을 쓴다
 *   그 외   미리 고른 색 중 하나여야 한다
 */
export function resolveColor(choice: string, custom: string): string {
  if (choice === "none") {
    return "";
  }

  if (choice === "custom") {
    return custom.trim();
  }

  // 목록에 없는 값을 라디오로 보낸 경우다. 색을 쓰지 않는 것으로 본다.
  return PROJECT_COLOR_PRESETS.includes(choice) ? choice : "";
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max}자를 넘을 수 없습니다.`)
    .transform((value) => (value.length > 0 ? value : null));
}

/** 비어 있으면 null. 값이 있으면 YYYY-MM-DD 형태여야 한다. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    { message: "날짜는 YYYY-MM-DD 형식으로 입력해 주세요." },
  );

export const projectInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "프로젝트 이름을 입력해 주세요.")
      .max(MAX_NAME_LENGTH, `이름은 ${MAX_NAME_LENGTH}자를 넘을 수 없습니다.`),
    projectType: optionalText(MAX_TYPE_LENGTH),
    description: optionalText(MAX_DESCRIPTION_LENGTH),
    researchQuestion: optionalText(MAX_LONG_TEXT_LENGTH),
    targetOutput: optionalText(MAX_LONG_TEXT_LENGTH),
    startDate: optionalDate,
    endDate: optionalDate,
    color: optionalText(7).refine(
      (value) => value === null || isHexColor(value),
      { message: "색은 #RRGGBB 형식으로 입력해 주세요." },
    ),
  })
  .refine(
    (value) =>
      value.startDate === null ||
      value.endDate === null ||
      value.endDate >= value.startDate,
    { message: "종료일은 시작일보다 앞설 수 없습니다.", path: ["endDate"] },
  );

export type ProjectInput = z.infer<typeof projectInputSchema>;

/** 폼 값은 문자열이거나 파일이다. 문자열이 아닌 값은 빈 값으로 본다. */
export function formValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** 첫 번째 오류 메시지만 화면에 보여준다. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}
