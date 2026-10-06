/**
 * AI를 한 달에 얼마나 쓸 수 있는지. (설계 문서 19절, ADR 0003)
 *
 * **2026-10-06에 횟수에서 쓴 돈으로 뒤집었다.** 까닭은 ADR 0003에 있다.
 * 짧게는 셋이다.
 *
 *   한 사람당 횟수였다   사람이 둘이면 앱이 허락하는 양이 예산의 두 배가 된다
 *   상한으로 깎았다      실제로 그 상한까지 쓰는 일이 드물어 예산이 비워졌다
 *   길마다 무게가 다르다 "번역 한 번은 검색 몇 번어치"는 우리가 정할 값이 아니다
 *
 * 왜 여기서 다시 세지 않는가
 *   `src/lib/translation/rate-limit.ts`가 **연타를 막는** 한도다. 1분에
 *   열 번이고 세는 자리가 서버의 기억이라 헐겁다. 이쪽은 **돈을 막는**
 *   한도이고 세는 자리가 `ai_usage_events` 표다. 서버가 몇 대든 같은
 *   장부를 본다.
 *
 *   둘 다 필요하다. 연타 한도만 있으면 한 달 내내 조금씩 눌러 큰 금액이
 *   나가고, 월 한도만 있으면 한 번에 쏟아부어 하루 만에 소진된다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/*
  **확장자를 붙인다.** `npm test`는 `node --test`로 도는데, 확장자 없는
  상대 경로를 풀지 못한다. `tsconfig`의 `allowImportingTsExtensions`가
  켜져 있어 이렇게 쓸 수 있다.

  `usage-summary.ts` 머리말이 "아무것도 import하지 않는다"고 적어둔 것이
  이 함정 때문인데, **못 하는 것이 아니라 확장자를 붙여야 하는 것**이었다.
  2026-10-06에 확장자 없이 적었다가 검사가 바로 멈췄다.
*/
import { WORST_CASE_CALL_USD } from "./pricing.ts";

/**
 * 달이 바뀌는 자리를 어느 시간대로 보는가.
 *
 * 서버는 UTC로 돈다. 그대로 두면 **한국에서 1일 아침에 물은 것이 지난달로
 * 세어진다.** 9시간 차이만큼 달이 늦게 바뀌기 때문이다. 쓰는 사람이
 * 한국에 있으니 한국 시간으로 가른다.
 *
 * 한국은 서머타임이 없어 늘 UTC+9다. 그래서 시간대 이름을 다루는 무거운
 * 셈 없이 숫자 하나로 끝난다. 다른 나라를 다루게 되면 그때는 이 값 하나로
 * 안 되고 진짜 시간대 계산이 필요하다. **지금 없는 것을 미리 만들지 않는다.**
 */
export const MONTH_BOUNDARY_OFFSET_MINUTES = 9 * 60;

/**
 * 지금이 속한 달이 시작한 순간.
 *
 * 돌려주는 값은 UTC 기준의 한 시점이다. 그대로 데이터베이스에 넘겨
 * `created_at >= 이 값`으로 센다.
 */
export function monthStart(
  now: Date,
  offsetMinutes: number = MONTH_BOUNDARY_OFFSET_MINUTES,
): Date {
  const offsetMs = offsetMinutes * 60 * 1000;

  // 그 나라의 벽시계로 옮겨 놓고, 달의 첫날 0시로 자른 뒤, 다시 되돌린다.
  const local = new Date(now.getTime() + offsetMs);

  const localMonthStart = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    1,
    0,
    0,
    0,
    0,
  );

  return new Date(localMonthStart - offsetMs);
}

export type AiCallDecision = {
  allowed: boolean;
  /** 이번 달에 쓴 돈(USD). */
  spentUsd: number;
  /** 이번 달에 쓸 수 있는 돈(USD). 몫 + 관리자가 더해준 것. */
  allowanceUsd: number;
  /** 남은 돈(USD). 막혔으면 0. */
  remainingUsd: number;
  /**
   * 남은 돈으로 **어림 몇 번** 더 부를 수 있는가.
   *
   * **어림이다.** 한 번 상한으로 나눈 값이라 실제로는 더 많이 쓸 수 있다.
   * 사람에게 보여줄 때 돈보다 횟수가 와닿기 때문에 함께 준다.
   * 막혔으면 0이다.
   */
  remainingCalls: number;
};

/**
 * 한 번 더 불러도 되는지 판단한다.
 *
 * 장부에서 셈한 값을 받아 판단만 한다. 세는 일은 데이터베이스가 하고,
 * 판단은 여기서 한다. 나눠 두어야 검사에서 숫자를 직접 넣어볼 수 있다.
 *
 * **모르면 거부한다.** (AGENTS.md 5절 7번) 쓴 돈이 숫자가 아니면 장부를
 * 읽는 데 실패한 것이므로 막는다. 셈하지 못했는데 통과시키면 한도가 없는
 * 것과 같다.
 *
 * **몫이 숫자가 아니어도 막는다.** 몫은 예산을 인원으로 나눈 값인데,
 * 그것을 못 읽었다는 것은 예산 설정을 못 읽었다는 뜻이다.
 */
export function decideAiCall(
  spentUsd: number,
  allowanceUsd: number,
): AiCallDecision {
  const spent =
    Number.isFinite(spentUsd) && spentUsd >= 0
      ? spentUsd
      : Number.POSITIVE_INFINITY;

  const allowance =
    Number.isFinite(allowanceUsd) && allowanceUsd > 0 ? allowanceUsd : 0;

  if (spent >= allowance) {
    return {
      allowed: false,
      // 셈에 실패한 경우를 "다 썼다"처럼 보이게 하지 않는다.
      spentUsd: Number.isFinite(spent) ? spent : allowance,
      allowanceUsd: allowance,
      remainingUsd: 0,
      remainingCalls: 0,
    };
  }

  const remaining = allowance - spent;

  return {
    allowed: true,
    spentUsd: spent,
    allowanceUsd: allowance,
    remainingUsd: remaining,
    /*
      **내림이다.** 반올림하면 한 번 분량이 안 남았는데 "1번 남음"이라고
      말하게 된다. 눌러야 안 된다는 것을 알게 되는 자리를 만들지 않는다.
    */
    remainingCalls: Math.floor(remaining / WORST_CASE_CALL_USD),
  };
}

/**
 * 관리자가 더해준 허용량을 몫에 얹는다. (19-E, 2026-09-25 사용자 요청)
 *
 * **리셋이 아니다.** `ai_usage_events`는 고칠 수도 지울 수도 없는 장부이고
 * (003의 검사 120·121), 리셋을 만들면 그 보장을 우리 손으로 뚫는 일이 된다.
 *
 * 그래서 장부는 그대로 두고 **쓸 수 있는 양을 늘린다.** 관리자가 보는
 * 결과는 같다. 단추를 누르면 그 사람이 다시 쓴다. 다만 **누가 얼마 썼고
 * 누가 언제 왜 풀어줬는지가 둘 다 남는다.**
 *
 * 횟수를 돈으로 바꾼다
 *   관리자 화면은 지금처럼 `몇 번 더`를 받는다. 돈으로 받게 바꾸지 않았다.
 *   **사람이 "몇 번"으로 생각하기 때문이다.** 여기서 한 번 상한을 곱해
 *   돈으로 바꾼다. 적어도 그만큼은 더 쓸 수 있다는 뜻이고, 실제로는
 *   그보다 더 쓸 때가 많다.
 *
 * 음수를 받는다
 *   잘못 줬을 때 되돌리는 길이다. 줄을 지우는 대신 음수로 한 줄 더 남긴다.
 *   그래서 합이 음수가 될 수 있고, **그때 몫보다 낮추지 않는다.**
 *   되돌리기가 사람을 제 몫 아래로 떨어뜨리는 것은 뜻이 아니다.
 *
 * 모르면 더하지 않는다
 *   허용량을 못 읽었으면 0으로 본다. **막는 쪽으로 기운다.** (보안 원칙 7)
 *   못 읽었는데 넉넉히 준 것으로 보면 한도가 헐거워진다.
 */
export function allowanceWithGrants(
  shareUsd: number | null,
  grantedCalls: number | null,
): number {
  /*
    **몫을 모르면 0이다. 더해준 것이 있어도 그렇다.** (검사가 잡아 준 자리)

    처음에는 몫을 0으로 보고 허용량만 얹었다. 그러면 **예산 설정을 못
    읽었는데 관리자가 준 횟수만으로 돈을 쓰게 된다.** 몫을 모른다는 것은
    예산을 모른다는 뜻이고, 그때는 얼마를 더 줬든 쓸 수 없어야 한다.

    `decideAiCallNow`가 몫이 null이면 먼저 막지만, **이 함수만 떼어 봐도
    안전해야 한다.** 막는 자리가 하나뿐이면 그 한 곳을 고칠 때 조용히
    열린다.
  */
  if (shareUsd === null || !Number.isFinite(shareUsd) || shareUsd <= 0) {
    return 0;
  }

  const share = shareUsd;

  if (grantedCalls === null || !Number.isInteger(grantedCalls)) {
    return share;
  }

  // 되돌리기가 제 몫 아래로 끌어내리지 않는다.
  return Math.max(share, share + grantedCalls * WORST_CASE_CALL_USD);
}
