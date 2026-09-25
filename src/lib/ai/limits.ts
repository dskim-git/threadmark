/**
 * AI를 한 달에 얼마나 부를 수 있는지. (설계 문서 19절 "AI 사용량 제한과 비용 추적")
 *
 * 왜 또 한도인가
 *   `src/lib/translation/rate-limit.ts`가 이미 있다. 그것은 **연타를 막는**
 *   한도다. 1분에 열 번. 그리고 그 파일이 스스로 이렇게 적어 두었다.
 *   "세는 자리가 서버 프로세스의 기억이다. 서버가 여럿이면 각자 따로 센다.
 *   진짜 상한은 16단계에서 데이터베이스에 둔다."
 *
 *   여기가 그 16단계다. 이쪽은 **돈을 막는** 한도이고, 세는 자리가
 *   `ai_usage_events` 표다. 서버가 몇 대든 같은 장부를 본다.
 *
 *   둘 다 필요하다. 연타 한도만 있으면 한 달 내내 조금씩 눌러 큰 금액이
 *   나가고, 월 한도만 있으면 한 번에 쏟아부어 하루 만에 소진된다.
 *
 * 왜 횟수로 세고 금액으로 세지 않는가
 *   금액으로 세려면 모델마다 단가를 코드에 적어야 하고, 단가가 바뀌면
 *   **코드가 조용히 틀린 금액을 말한다.** 틀린 금액은 없는 금액보다 나쁘다.
 *
 *   횟수는 우리가 아는 값이다. 한 번에 드는 돈의 상한은 보내는 글의 길이가
 *   정하고(요청을 만드는 쪽에서 막는다), 그 상한에 횟수를 곱하면 한 달
 *   상한이 나온다. 아는 것만으로 셈한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 한 달에 부를 수 있는 횟수.
 *
 * **이 숫자는 우리가 고른 것이 아니라 예산에서 거꾸로 나온 값이다.**
 *
 * 설계 문서 18.1절이 정해둔 것이 둘 있다.
 *
 *   Anthropic Workspace 월 예산 상한   USD 5
 *   기본 모델                          claude-sonnet-5
 *
 * 그 상한은 **Anthropic 쪽에 걸려 있다.** 넘으면 우리 코드와 상관없이
 * 요청이 거부된다. 앱의 한도가 그보다 크면 한도는 아무것도 막지 못하고,
 * 어느 날 갑자기 기능이 통째로 안 되는 것으로 나타난다. **막는 자리가
 * 둘일 때는 안쪽이 먼저 걸려야 한다.**
 *
 * 한 번에 드는 돈 (sonnet-5, 입력 $2 / 출력 $10 per MTok)
 *
 *   넘기는 글    2만 자까지 (candidates.ts의 MAX_TOTAL_CHARS)
 *                한국어는 글자보다 토큰이 많다. 넉넉히 2만 5천 토큰으로 본다.
 *                25,000 x $2/1M = $0.05
 *   받는 글      많아야 1천 5백 토큰
 *                1,500 x $10/1M = $0.015
 *   합           $0.065 어름
 *
 * USD 5를 그 값으로 나누면 일흔 번 남짓이다. **그 전부를 이 기능에 주지
 * 않는다.** 번역도 같은 예산을 쓴다. 그래서 60으로 둔다.
 *
 * **재어 보고 정한 값이 아니다.** 실제로 쓰고 나서 고친다. 예산을 올리면
 * 여기도 함께 올린다. 한쪽만 고치면 다시 어긋난다.
 *
 * 막히는 것이 조용히 많이 나가는 것보다 낫다. 막히면 알아채고, 많이 나가는
 * 것은 청구서가 올 때까지 모른다.
 */
export const AI_MONTHLY_CALL_LIMIT = 60;

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
  /** 이번 달에 몇 번 더 부를 수 있는가. 막혔으면 0. */
  remaining: number;
  /** 몇 번까지인가. "60번 중 3번 남음"처럼 보여주려고 함께 준다. */
  limit: number;
  /** 이번 달에 몇 번 불렀는가. */
  used: number;
};

/**
 * 한 번 더 불러도 되는지 판단한다.
 *
 * 장부에서 센 값을 받아 판단만 한다. 세는 일은 데이터베이스가 하고,
 * 판단은 여기서 한다. 나눠 두어야 검사에서 숫자를 직접 넣어볼 수 있다.
 *
 * **모르면 거부한다.** (AGENTS.md 5절 7번) 센 값이 숫자가 아니거나 음수면
 * 장부를 읽는 데 실패한 것이므로 막는다. 세지 못했는데 통과시키면
 * 한도가 없는 것과 같다.
 */
export function decideAiCall(
  used: number,
  limit: number = AI_MONTHLY_CALL_LIMIT,
): AiCallDecision {
  const knownUsed =
    Number.isInteger(used) && used >= 0 ? used : Number.POSITIVE_INFINITY;

  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 0;

  if (knownUsed >= safeLimit) {
    return {
      allowed: false,
      remaining: 0,
      limit: safeLimit,
      // 셈에 실패한 경우를 한도에 걸린 것처럼 보이게 하지 않는다.
      used: Number.isFinite(knownUsed) ? knownUsed : safeLimit,
    };
  }

  return {
    allowed: true,
    remaining: safeLimit - knownUsed,
    limit: safeLimit,
    used: knownUsed,
  };
}

/**
 * 관리자가 더해준 허용량을 한도에 얹는다. (19-E, 2026-09-25 사용자 요청)
 *
 * **리셋이 아니다.** `ai_usage_events`는 고칠 수도 지울 수도 없는 장부이고
 * (003의 검사 120·121), 리셋을 만들면 그 보장을 우리 손으로 뚫는 일이 된다.
 *
 * 그래서 장부는 그대로 두고 **쓸 수 있는 횟수를 늘린다.** 관리자가 보는
 * 결과는 같다. 단추를 누르면 그 사람이 다시 쓴다. 다만 **누가 얼마 썼고
 * 누가 언제 왜 풀어줬는지가 둘 다 남는다.**
 *
 * 음수를 받는다
 *   잘못 줬을 때 되돌리는 길이다. 줄을 지우는 대신 음수로 한 줄 더 남긴다.
 *   그래서 합이 음수가 될 수 있고, **그때 한도를 기본값보다 낮추지 않는다.**
 *   되돌리기가 사람을 기본 한도 아래로 떨어뜨리는 것은 뜻이 아니다.
 *
 * 모르면 더하지 않는다
 *   허용량을 못 읽었으면 0으로 본다. **막는 쪽으로 기운다.** (보안 원칙 7)
 *   못 읽었는데 넉넉히 준 것으로 보면 한도가 헐거워진다.
 */
export function limitWithGrants(
  granted: number | null,
  limit: number = AI_MONTHLY_CALL_LIMIT,
): number {
  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 0;

  if (granted === null || !Number.isInteger(granted)) {
    return safeLimit;
  }

  // 되돌리기가 기본 한도 아래로 끌어내리지 않는다.
  return Math.max(safeLimit, safeLimit + granted);
}
