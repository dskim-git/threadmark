"use server";

import { requireActiveAccount } from "@/lib/auth/account";
import { firstIssueMessage } from "@/lib/captures/schema";
import {
  createAnthropicTranslationProvider,
  isTranslationConfigured,
} from "@/lib/translation/anthropic";
import {
  takeTranslationSlot,
  TRANSLATION_MAX_PER_WINDOW,
} from "@/lib/translation/rate-limit";
import { translationRequestSchema } from "@/lib/translation/schema";
import type {
  TranslationLanguageCode,
  TranslationResult,
} from "@/lib/translation/types";

/**
 * 고른 문장을 옮긴다. (설계 문서 9.4절)
 *
 * 여기서 옮기기만 하고 저장하지 않는다. 9.4절의 흐름이
 * "번역해서 보여준 뒤, 사용자가 `번역과 함께 저장`을 고르면 저장"이기 때문이다.
 * 마음에 들지 않는 번역이 기록에 남지 않는다.
 *
 * 밖으로 나가는 요청이므로 앞에 세 겹을 둔다.
 *   1. 로그인과 승인 상태 확인
 *   2. 길이 제한 (types.ts의 MAX_TRANSLATION_INPUT_LENGTH)
 *   3. 건수 제한 (rate-limit.ts)
 *
 * 9.4절의 "논문 전체를 자동 전송하지 않는다"를 지키는 것이 2번이다.
 * 사용자가 고른 만큼만, 그것도 문단 하나 크기까지만 나간다.
 */

/**
 * 누가 언제 요청했는지.
 *
 * 서버 프로세스의 기억이다. 서버가 여럿이면 각자 따로 센다.
 * 이 한도가 헐겁게 걸린다는 것은 rate-limit.ts에 적어두었다.
 * 진짜 상한은 16단계에서 데이터베이스에 둔다.
 */
const requestHistory = new Map<string, readonly number[]>();

export type TranslateSelectionResult = TranslationResult;

export async function translateSelection(input: {
  text: string;
  targetLanguage: TranslationLanguageCode;
}): Promise<TranslateSelectionResult> {
  const account = await requireActiveAccount();

  if (!isTranslationConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "번역 기능이 아직 설정되지 않았습니다.",
    };
  }

  const parsed = translationRequestSchema.safeParse(input);

  if (!parsed.success) {
    /*
      길이를 넘긴 것인지 아닌지를 구분해서 돌려준다.
      화면이 "더 짧게 고르세요"와 "다시 시도하세요"를 다르게 안내한다.
    */
    const tooLong = parsed.error.issues.some(
      (issue) => issue.path[0] === "text" && issue.code === "custom",
    );

    return {
      ok: false,
      reason: tooLong ? "too_long" : "failed",
      message: firstIssueMessage(parsed.error),
    };
  }

  const decision = takeTranslationSlot(
    requestHistory.get(account.userId) ?? [],
    Date.now(),
  );

  requestHistory.set(account.userId, decision.next);

  if (!decision.allowed) {
    const seconds = Math.ceil(decision.retryAfterMs / 1000);

    return {
      ok: false,
      reason: "rate_limited",
      message: `번역은 1분에 ${TRANSLATION_MAX_PER_WINDOW}번까지 할 수 있습니다. ${seconds}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const provider = createAnthropicTranslationProvider();

  return provider.translate({
    text: parsed.data.text,
    targetLanguage: parsed.data.targetLanguage as TranslationLanguageCode,
  });
}
