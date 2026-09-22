/**
 * 번역 요청 검증. (설계 문서 9.4절)
 *
 * 밖으로 나가는 요청이라 들어오는 값을 화면과 서버 양쪽에서 확인한다.
 * 화면 검사는 사용자에게 왜 안 되는지 알려주려는 것이고,
 * 서버 검사는 화면을 거치지 않은 요청을 막으려는 것이다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import {
  MAX_TRANSLATION_INPUT_LENGTH,
  TRANSLATION_LANGUAGES,
} from "./types.ts";

const languageCodes = TRANSLATION_LANGUAGES.map((language) => language.code);

export const translationRequestSchema = z.object({
  text: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "옮길 글을 고른 뒤에 눌러 주세요.",
    })
    .refine((value) => value.length <= MAX_TRANSLATION_INPUT_LENGTH, {
      message: `한 번에 ${MAX_TRANSLATION_INPUT_LENGTH}자까지 옮길 수 있습니다. 더 짧게 골라 주세요.`,
    }),
  targetLanguage: z.enum(languageCodes as [string, ...string[]], {
    message: "옮길 언어를 골라 주세요.",
  }),
});

/**
 * 번역기가 돌려준 글을 다듬는다.
 *
 * "옮긴 글만 내라"고 시켜도 앞뒤에 빈 줄이나 따옴표가 붙어 오는 일이 있다.
 * 사람이 그것까지 지우게 두지 않는다.
 *
 * 다만 글 안쪽은 건드리지 않는다. 번역문은 그 자체로 하나의 글이고,
 * 우리가 내용을 손대기 시작하면 무엇이 번역기의 결과인지 알 수 없게 된다.
 */
export function tidyTranslationOutput(raw: string): string {
  const trimmed = raw.trim();

  // 글 전체가 따옴표 한 쌍에 싸여 있을 때만 벗긴다.
  // 안쪽에 같은 따옴표가 또 있으면 인용의 일부일 수 있으므로 그대로 둔다.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [open, close] of pairs) {
    if (
      trimmed.length >= 2 &&
      trimmed.startsWith(open) &&
      trimmed.endsWith(close) &&
      !trimmed.slice(1, -1).includes(close)
    ) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}
