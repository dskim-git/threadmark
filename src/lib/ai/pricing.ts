/**
 * 모델마다의 단가와, 쓴 토큰을 돈으로 바꾸는 셈. (19-F 2차례)
 *
 * **이 파일이 ADR 0003의 절반이다.**
 *
 * `limits.ts`가 횟수로 센 까닭이 이것이었다.
 *
 *   금액으로 세려면 모델마다 단가를 코드에 적어야 하고, 단가가 바뀌면
 *   **코드가 조용히 틀린 금액을 말한다.** 틀린 금액은 없는 금액보다 나쁘다.
 *
 * 그 걱정은 맞다. **다만 관리자가 예산을 달러로 적는 순간 단가는 어디든
 * 있어야 한다.** 피할 수 없다. 그러면 **조용하지 않게 두는 것**이 답이다.
 *
 *   1. 단가를 모델 이름에 붙여 한 곳에 둔다. (아래 `MODEL_PRICES`)
 *   2. **모르는 모델로는 부르지 않는다.** 0으로 보지 않는다. 0으로 보면
 *      그 모델을 쓰는 동안 한도가 없는 것과 같아진다.
 *   3. 이미 쌓인 장부에 모르는 모델이 있으면 **가장 비싼 값으로 친다.**
 *      싸게 치면 쓴 돈이 실제보다 적게 보이고, 그것이 가장 나쁘다.
 *
 * 2번과 3번이 반대 방향으로 보이지만 같은 생각이다. **모를 때는 나에게
 * 불리한 쪽으로 센다.** 앞으로 쓸 때는 막고, 이미 쓴 것은 비싸게 친다.
 *
 * 데이터베이스를 물지 않는 순수 모듈이라 단위 검사로 확인한다.
 * (AGENTS.md 2절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 */

/** 백만 토큰당 달러. */
export type ModelPrice = {
  inputPerMTok: number;
  outputPerMTok: number;
};

/**
 * 우리가 아는 단가.
 *
 * **여기 없는 모델로는 부르지 않는다.** 그것이 이 표가 뒤처졌다는 것을
 * 알아채는 유일한 길이다. `ANTHROPIC_MODEL`로 모델을 바꾸면 **그 날로
 * AI 기능이 멈추고** 화면이 까닭을 말한다. 조용히 틀린 금액을 말하는
 * 것보다 낫다.
 *
 * 모델을 바꾸거나 더할 때는 **Anthropic의 가격표를 보고 이 표를 먼저
 * 고친다.**
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  /*
    설계 문서 18.1절이 정한 기본 모델이다. 검색·번역·자리 추천·논문 보조가
    모두 이것을 기본값으로 쓴다.
  */
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
};

/** 아는 모델인가. 모르면 `null`이다. 0이 아니다. */
export function priceFor(model: string): ModelPrice | null {
  return MODEL_PRICES[model.trim()] ?? null;
}

/**
 * 가장 비싼 단가.
 *
 * 장부에 모르는 모델이 적혀 있을 때 쓴다. **모르면 비싸게 친다.**
 */
export function highestPrice(): ModelPrice {
  const prices = Object.values(MODEL_PRICES);

  return {
    inputPerMTok: Math.max(...prices.map((p) => p.inputPerMTok)),
    outputPerMTok: Math.max(...prices.map((p) => p.outputPerMTok)),
  };
}

/**
 * 쓴 토큰을 돈으로 바꾼다.
 *
 * @param model 장부에 적힌 모델 이름. 모르는 이름이면 가장 비싼 단가로 친다.
 */
export function spentUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = priceFor(model) ?? highestPrice();

  /*
    **음수를 0으로 본다.** 장부는 고칠 수 없게 해 두었지만, 셈하는 쪽이
    음수를 그대로 더하면 많이 쓴 사람이 적게 쓴 것으로 보일 수 있다.
  */
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);

  return (
    (input * price.inputPerMTok) / 1_000_000 +
    (output * price.outputPerMTok) / 1_000_000
  );
}

/**
 * 한 번 부를 때 들 수 있는 **가장 큰 값**.
 *
 * 두 곳에 쓴다.
 *
 *   관리자가 더해준 `몇 번 더`를 돈으로 바꿀 때 (19-E)
 *   남은 돈을 **어림 몇 번**으로 보여줄 때
 *
 * 둘 다 어림이다. 실제로 이 상한까지 쓰는 일은 드물다. 문장 하나를
 * 번역하면 들어가는 글이 4,000자가 아니라 200자다. **어림을 어림이라고
 * 말하는 것**이 이 상수의 일이다.
 *
 * 어디서 나온 값인가 (`claude-sonnet-5` 기준)
 *
 *   길             들어가는 글   나오는 글    값
 *   AI 검색·추천   25,000토큰    4,000토큰    $0.050 + $0.040 = $0.090
 *   고른 문장 번역  5,000토큰     8,000토큰    $0.010 + $0.080 = $0.090
 *   논문 서지 보조 15,000토큰    4,000토큰    $0.030 + $0.040 = $0.070
 *
 * **번역이 AI 검색만큼 든다.** 들어가는 글은 5분의 1인데 나오는 글의
 * 상한이 두 배다. 싸다고 생각하기 쉬운 자리인데 아니다.
 *
 * 그 셋 가운데 가장 큰 값을 쓴다. `ai-pricing.test.mjs`가 이 셈을 다시 한다.
 */
export const WORST_CASE_INPUT_TOKENS = 25_000;
export const WORST_CASE_OUTPUT_TOKENS = 8_000;

/**
 * 한 번 상한(USD).
 *
 * **길마다 따로 세지 않는다.** 들어가는 글이 가장 많은 길과 나오는 글이
 * 가장 많은 길이 다른데, 둘을 합쳐 하나로 친다. 그러면 어느 길이든 이
 * 값을 넘지 않는다. **어림을 할 때는 넘치는 쪽으로 어림한다.**
 */
export const WORST_CASE_CALL_USD = spentUsd(
  "claude-sonnet-5",
  WORST_CASE_INPUT_TOKENS,
  WORST_CASE_OUTPUT_TOKENS,
);
