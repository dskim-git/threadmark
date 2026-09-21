/**
 * Source 입력 검증.
 *
 * 화면에서 오는 값은 전부 사용자가 조작할 수 있다.
 * 데이터베이스 제약조건과 같은 한계를 여기서도 확인해, 사용자가 무엇이
 * 잘못되었는지 알 수 있는 메시지를 받도록 한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
// 확장자를 생략하면 Node의 ESM 해석기가 파일을 찾지 못한다.
import { SOURCE_TYPES } from "./types.ts";

export const MAX_TITLE_LENGTH = 300;
export const MAX_SUBTITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_URL_LENGTH = 2000;

/**
 * 링크로 만들어도 안전한 주소인지 확인한다.
 *
 * 저장된 주소는 나중에 화면에서 링크가 된다. `javascript:` 같은 스킴을
 * 그대로 두면 다른 사람이 그 링크를 눌렀을 때 스크립트가 실행될 수 있다.
 * 사용자가 자기 자료만 보는 지금도, 공유 기능이 생기면 바로 문제가 되는 지점이다.
 */
export function isSafeHttpUrl(value: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/** 비어 있으면 null로 바꾼다. 빈 문자열과 "값 없음"을 구분하지 않기 위해서다. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `${max}자를 넘을 수 없습니다.`)
    .transform((value) => (value.length > 0 ? value : null));
}

export const sourceInputSchema = z.object({
  type: z.enum(SOURCE_TYPES, { message: "자료 유형을 선택해 주세요." }),
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(MAX_TITLE_LENGTH, `제목은 ${MAX_TITLE_LENGTH}자를 넘을 수 없습니다.`),
  subtitle: optionalText(MAX_SUBTITLE_LENGTH),
  description: optionalText(MAX_DESCRIPTION_LENGTH),
  originalUrl: optionalText(MAX_URL_LENGTH).refine(
    (value) => value === null || isSafeHttpUrl(value),
    { message: "http 또는 https로 시작하는 주소만 저장할 수 있습니다." },
  ),
});

export type SourceInput = z.infer<typeof sourceInputSchema>;

/** 폼 값은 문자열이거나 파일이다. 문자열이 아닌 값은 빈 값으로 본다. */
export function formValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** 첫 번째 오류 메시지만 화면에 보여준다. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}
