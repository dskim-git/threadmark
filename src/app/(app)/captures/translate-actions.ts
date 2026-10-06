"use server";

import { requireActiveAccount } from "@/lib/auth/account";
import { firstIssueMessage } from "@/lib/captures/schema";
import {
  createAnthropicTranslationProvider,
  ANTHROPIC_PROVIDER_NAME,
  getAnthropicModel,
  isTranslationConfigured,
} from "@/lib/translation/anthropic";
import { aiAvailability, aiBlockedMessage } from "@/lib/ai/access";
import { decideAiCallNow, recordAiUsage } from "@/lib/ai/usage-queries";
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

  /*
    설정과 허용을 한 자리에서 가린다. (19-F)

    **번역도 돈이 든다.** 들어가는 글은 AI 검색의 5분의 1이지만 나오는
    글의 상한이 두 배라 한 번에 드는 값이 비슷하다. 싸다고 생각하기 쉬운
    자리여서 허용 밖에 두지 않는다. (VERIFICATION 4-76절)
  */
  const availability = aiAvailability({
    configured: isTranslationConfigured(),
    allowed: account.aiEnabled,
  });

  if (availability !== "ok") {
    return {
      ok: false,
      reason: availability === "not_configured" ? "not_configured" : "not_allowed",
      message: aiBlockedMessage(availability) ?? "",
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

  /*
    **한 달 장부를 본다.** (19-F 2차례)

    2026-10-06까지 번역은 장부 밖에 있었다. 위의 연타 한도만 걸려 있었고,
    그것은 세는 자리가 서버의 기억이라 Vercel에서 헐겁게 걸린다.
    `rate-limit.ts`가 스스로 "진짜 상한은 데이터베이스에 둔다"고 적어둔
    자리이고, 여기가 그 자리다.

    **연타 한도 다음에 본다.** 장부를 읽는 것은 왕복이 한 번 더 드는 일이라,
    연타로 쏟아지는 요청을 먼저 쳐낸 뒤에 묻는다.
  */
  const budget = await decideAiCallNow();

  if (budget === null) {
    // 모르면 거부한다. (AGENTS.md 5절 7번)
    return {
      ok: false,
      reason: "failed",
      message: "얼마나 쓰셨는지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!budget.allowed) {
    return {
      ok: false,
      reason: "rate_limited",
      message:
        "이번 달에 쓸 수 있는 AI 몫을 다 쓰셨습니다. 다음 달 1일에 다시 채워집니다. 더 쓰셔야 하면 관리자에게 요청해 주세요.",
    };
  }

  const provider = createAnthropicTranslationProvider();

  const result = await provider.translate({
    text: parsed.data.text,
    targetLanguage: parsed.data.targetLanguage as TranslationLanguageCode,
  });

  /*
    **실패해도 남긴다.** 실패한 요청에도 돈이 들 수 있다. 다만 요청이
    아예 못 나간 경우(설정 없음·길이 초과)는 위에서 걸러졌으므로, 여기
    오는 실패는 밖에 다녀온 뒤의 실패다.

    토큰을 모르면 0으로 남는다. **줄 자체는 남겨야** 갈래별 횟수가 맞는다.
  */
  await recordAiUsage({
    feature: "translation",
    provider: ANTHROPIC_PROVIDER_NAME,
    model: getAnthropicModel(),
    inputTokens: result.ok ? result.inputTokens : 0,
    outputTokens: result.ok ? result.outputTokens : 0,
    outcome: result.ok ? "ok" : "failed",
  });

  return result;
}
