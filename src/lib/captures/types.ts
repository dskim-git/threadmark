/**
 * Capture 유형 정의.
 *
 * 설계 문서 2.4절은 원문과 사용자의 생각을 구분하라고 한다.
 * 그 구분이 유형마다 어떤 입력을 요구하는지를 이 모듈이 한곳에서 정한다.
 * 화면은 이 정의로 입력란을 그리고, 검증 스키마는 같은 정의로 요구사항을 확인한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import type { Database } from "@/lib/supabase/database.types";

type DatabaseCaptureType = Database["public"]["Enums"]["capture_type"];

/** 설계 문서 6.1절의 기록 유형. 순서는 화면에 보여줄 순서다. */
export const CAPTURE_TYPES = [
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
] as const satisfies readonly DatabaseCaptureType[];

export type CaptureType = (typeof CAPTURE_TYPES)[number];

/**
 * 파일 저장이 필요해 아직 화면에서 제공하지 않는 유형.
 *
 * 유형 체계는 설계 문서를 그대로 따르되, 입력 화면은 실제로 동작하는 것만 보여준다.
 * 손글씨와 음성은 Google Drive 연동(12단계)이 있어야 의미가 생긴다.
 */
export const UNAVAILABLE_CAPTURE_TYPES = ["handwriting", "voice"] as const;

/** 지금 화면에서 만들 수 있는 유형. */
export const AVAILABLE_CAPTURE_TYPES = CAPTURE_TYPES.filter(
  (type) =>
    !(UNAVAILABLE_CAPTURE_TYPES as readonly string[]).includes(type),
);

const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  quote: "직접 인용",
  translation: "번역",
  summary: "요약",
  paraphrase: "바꾸어 쓰기",
  interpretation: "나의 해석",
  question: "질문",
  counterpoint: "반론",
  idea: "활용 아이디어",
  todo: "후속 할 일",
  note: "일반 메모",
  handwriting: "손글씨",
  voice: "음성 메모",
};

/** 유형마다 무엇을 적는 자리인지 짧게 안내한다. */
const CAPTURE_TYPE_HINTS: Record<CaptureType, string> = {
  quote: "원문을 그대로 옮깁니다. 내 생각은 아래 메모란에 따로 적습니다.",
  translation: "원문과 옮긴 글을 함께 남깁니다.",
  summary: "원문을 줄여 정리한 내용입니다.",
  paraphrase: "원문을 내 표현으로 바꾼 내용입니다.",
  interpretation: "이 자료를 어떻게 읽었는지 적습니다.",
  question: "확인하거나 더 알아볼 점을 적습니다.",
  counterpoint: "동의하기 어려운 점과 그 근거를 적습니다.",
  idea: "수업이나 연구에 어떻게 쓸지 적습니다.",
  todo: "이어서 할 일을 적습니다.",
  note: "자유롭게 적습니다.",
  handwriting: "손으로 쓴 기록입니다.",
  voice: "말로 남긴 기록입니다.",
};

export function isCaptureType(value: unknown): value is CaptureType {
  return (
    typeof value === "string" &&
    (CAPTURE_TYPES as readonly string[]).includes(value)
  );
}

export function getCaptureTypeLabel(value: unknown): string {
  return isCaptureType(value) ? CAPTURE_TYPE_LABELS[value] : "기록";
}

export function getCaptureTypeHint(value: CaptureType): string {
  return CAPTURE_TYPE_HINTS[value];
}

/**
 * 원문을 반드시 함께 남겨야 하는 유형.
 *
 * 인용과 번역이 그렇다. 원문이 없으면 나중에 무엇을 옮긴 것인지 확인할 수 없고,
 * 내가 쓴 글과 구분되지도 않는다. 데이터베이스 제약조건과 같은 규칙이다.
 */
export function requiresOriginalText(type: CaptureType): boolean {
  return type === "quote" || type === "translation";
}

/** 번역문과 대상 언어를 함께 남겨야 하는 유형. */
export function requiresTranslation(type: CaptureType): boolean {
  return type === "translation";
}
