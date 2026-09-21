/**
 * Capture 입력 검증.
 *
 * 데이터베이스 제약조건과 같은 규칙을 여기서도 확인한다.
 * 데이터베이스가 막아주더라도, 사용자에게는 무엇이 빠졌는지 알려주는 문구가 필요하다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import {
  CAPTURE_TYPES,
  requiresOriginalText,
  requiresTranslation,
} from "./types.ts";

export const MAX_TEXT_LENGTH = 20000;
export const MAX_LANGUAGE_LENGTH = 35;

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max}자를 넘을 수 없습니다.`)
    .transform((value) => (value.length > 0 ? value : null));
}

const baseCaptureSchema = z.object({
  captureType: z.enum(CAPTURE_TYPES, { message: "기록 유형을 선택해 주세요." }),
  sourceId: z.uuid().nullable().catch(null),
  content: optionalText(MAX_TEXT_LENGTH),
  originalText: optionalText(MAX_TEXT_LENGTH),
  translatedText: optionalText(MAX_TEXT_LENGTH),
  translationLanguage: optionalText(MAX_LANGUAGE_LENGTH),
});

/**
 * 유형별 요구사항까지 확인한다.
 *
 * 설계 문서 2.4절의 구분은 "원문 칸이 있다"로 끝나지 않는다.
 * 인용이라면서 원문을 비워두면 그 구분은 이름뿐이다.
 */
export const captureInputSchema = baseCaptureSchema
  .refine(
    (value) =>
      !requiresOriginalText(value.captureType) || value.originalText !== null,
    {
      message: "원문을 입력해 주세요. 인용과 번역은 원문이 있어야 합니다.",
      path: ["originalText"],
    },
  )
  .refine(
    (value) =>
      !requiresTranslation(value.captureType) || value.translatedText !== null,
    { message: "번역문을 입력해 주세요.", path: ["translatedText"] },
  )
  .refine(
    (value) =>
      !requiresTranslation(value.captureType) ||
      value.translationLanguage !== null,
    {
      message: "어떤 언어로 옮겼는지 입력해 주세요.",
      path: ["translationLanguage"],
    },
  )
  .refine(
    (value) =>
      value.content !== null ||
      value.originalText !== null ||
      value.translatedText !== null,
    { message: "내용을 입력해 주세요.", path: ["content"] },
  );

export type CaptureInput = z.infer<typeof captureInputSchema>;

/** 폼 값은 문자열이거나 파일이다. 문자열이 아닌 값은 빈 값으로 본다. */
export function formValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** 첫 번째 오류 메시지만 화면에 보여준다. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}
