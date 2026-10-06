/**
 * AI 월 한도의 단위 검사. (16-A-1)
 *
 * **이 셈이 틀리면 돈이 나간다.** 한도를 넘겼는데 통과시키면 청구서가 올
 * 때까지 모르고, 넘기지 않았는데 막으면 기능이 고장 난 것처럼 보인다.
 *
 * 특히 달이 바뀌는 자리를 본다. 서버는 UTC로 돌고 쓰는 사람은 한국에
 * 있어서, 한국에서 1일 아침에 물은 것이 지난달로 세어질 수 있다. 그러면
 * **달이 바뀌었는데도 계속 막힌다.** 오류가 나지 않고 결과만 틀린다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MONTH_BOUNDARY_OFFSET_MINUTES,
  allowanceWithGrants,
  decideAiCall,
  monthStart,
} from "../src/lib/ai/limits.ts";
import { WORST_CASE_CALL_USD } from "../src/lib/ai/pricing.ts";

// -----------------------------------------------------------------------------
// 달의 시작
// -----------------------------------------------------------------------------

test("한국 시간으로 달의 첫날 0시를 돌려준다", () => {
  // 2026-09-25 12:00 KST = 2026-09-25 03:00 UTC
  const now = new Date("2026-09-25T03:00:00.000Z");

  // 2026-09-01 00:00 KST = 2026-08-31 15:00 UTC
  assert.equal(monthStart(now).toISOString(), "2026-08-31T15:00:00.000Z");
});

test("한국에서 1일 아침에 부른 것은 이번 달로 센다", () => {
  /*
    이것이 이 파일에서 가장 중요한 검사다.

    2026-10-01 08:00 KST는 UTC로는 아직 9월 30일이다. UTC로 달을 가르면
    이 요청은 9월로 세어지고, **달이 바뀌었는데도 지난달 횟수에 막힌다.**
  */
  const morningOfTheFirst = new Date("2026-09-30T23:00:00.000Z");

  const start = monthStart(morningOfTheFirst);

  // 10월의 시작이어야 한다. 9월의 시작이면 틀린 것이다.
  assert.equal(start.toISOString(), "2026-09-30T15:00:00.000Z");
  assert.ok(morningOfTheFirst >= start, "1일 아침이 이번 달에 들어와야 한다");
});

test("한국에서 말일 밤에 부른 것은 아직 이번 달이다", () => {
  // 2026-09-30 23:00 KST = 2026-09-30 14:00 UTC
  const lastNight = new Date("2026-09-30T14:00:00.000Z");

  const start = monthStart(lastNight);

  assert.equal(start.toISOString(), "2026-08-31T15:00:00.000Z");
  assert.ok(lastNight >= start);
});

test("해가 바뀌는 자리도 센다", () => {
  // 2027-01-01 09:00 KST = 2027-01-01 00:00 UTC
  const newYear = new Date("2027-01-01T00:00:00.000Z");

  assert.equal(monthStart(newYear).toISOString(), "2026-12-31T15:00:00.000Z");
});

test("시간대를 0으로 주면 UTC 기준이 된다", () => {
  const now = new Date("2026-09-25T03:00:00.000Z");

  assert.equal(monthStart(now, 0).toISOString(), "2026-09-01T00:00:00.000Z");
});

test("한국은 UTC보다 아홉 시간 빠르다", () => {
  assert.equal(MONTH_BOUNDARY_OFFSET_MINUTES, 540);
});

// -----------------------------------------------------------------------------
// 한 번 더 불러도 되는가
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 쓴 돈으로 거는 한도 (19-F 2차례, ADR 0003)
// -----------------------------------------------------------------------------

test("한 푼도 안 썼으면 몫이 그대로 남아 있다", () => {
  const decision = decideAiCall(0, 5);

  assert.equal(decision.allowed, true);
  assert.equal(decision.spentUsd, 0);
  assert.equal(decision.allowanceUsd, 5);
  assert.equal(decision.remainingUsd, 5);
});

test("조금 남았을 때는 통과한다", () => {
  const decision = decideAiCall(4.99, 5);

  assert.equal(decision.allowed, true);
  assert.ok(decision.remainingUsd > 0);
});

test("몫에 닿으면 막는다", () => {
  const decision = decideAiCall(5, 5);

  assert.equal(decision.allowed, false);
  assert.equal(decision.remainingUsd, 0);
  assert.equal(decision.remainingCalls, 0);
});

test("어쩌다 몫을 넘겨도 남은 돈이 음수가 되지 않는다", () => {
  /*
    넘길 수 있다. 막는 것은 **부르기 전**이고, 한 번 부르는 값은 미리 알 수
    없다. 마지막 한 번이 몫을 넘길 수 있고 그것은 막지 못한다.
    음수를 그대로 보여주면 화면이 `-$0.3 남음`이라고 말한다.
  */
  const decision = decideAiCall(7, 5);

  assert.equal(decision.allowed, false);
  assert.equal(decision.remainingUsd, 0);
});

test("쓴 돈을 모르면 막는다", () => {
  /*
    **모르면 거부한다.** (AGENTS.md 5절 7번) 장부를 못 읽었는데 통과시키면
    한도가 없는 것과 같다.
  */
  for (const unknown of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(decideAiCall(unknown, 5).allowed, false, String(unknown));
  }
});

test("모를 때 쓴 돈을 몫보다 크게 말하지 않는다", () => {
  /*
    셈에 실패한 것을 "몫을 넘겨 썼다"처럼 보이게 하지 않는다. 화면이
    `$1000 씀`이라고 말하면 쓰는 사람이 놀란다.
  */
  const decision = decideAiCall(Number.NaN, 5);

  assert.equal(decision.spentUsd, 5);
});

test("몫이 0이면 아무것도 통과하지 않는다", () => {
  assert.equal(decideAiCall(0, 0).allowed, false);
});

test("몫이 이상하면 0으로 본다", () => {
  for (const bad of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
    const decision = decideAiCall(0, bad);

    assert.equal(decision.allowed, false, String(bad));
    assert.equal(decision.allowanceUsd, 0, String(bad));
  }
});

test("남은 돈을 어림 몇 번으로 바꿔 준다", () => {
  const decision = decideAiCall(0, WORST_CASE_CALL_USD * 3);

  assert.equal(decision.remainingCalls, 3);
});

test("한 번 분량이 안 남았으면 0번이라고 말한다", () => {
  /*
    **내림이다.** 반올림하면 한 번 분량이 안 남았는데 "1번 남음"이라고
    말하게 된다. 눌러야 안 된다는 것을 알게 되는 자리를 만들지 않는다.
  */
  const decision = decideAiCall(0, WORST_CASE_CALL_USD * 0.9);

  assert.equal(decision.allowed, true);
  assert.equal(decision.remainingCalls, 0);
});

// -----------------------------------------------------------------------------
// 관리자가 더해준 허용량 (19-E)
// -----------------------------------------------------------------------------

test("더해준 횟수를 한 번 상한으로 쳐서 몫에 얹는다", () => {
  const allowance = allowanceWithGrants(5, 10);

  assert.equal(allowance, 5 + 10 * WORST_CASE_CALL_USD);
});

test("더해준 것이 없으면 몫 그대로다", () => {
  assert.equal(allowanceWithGrants(5, 0), 5);
  assert.equal(allowanceWithGrants(5, null), 5);
});

test("되돌리기가 제 몫 아래로 끌어내리지 않는다", () => {
  /*
    잘못 줬을 때는 음수로 한 줄 더 남긴다. 그 합이 음수가 될 수 있는데,
    **되돌리기가 사람을 제 몫 아래로 떨어뜨리는 것은 뜻이 아니다.**
  */
  assert.equal(allowanceWithGrants(5, -1000), 5);
});

test("몫을 모르면 더해준 것이 있어도 0이다", () => {
  /*
    몫을 못 읽었다는 것은 예산 설정을 못 읽었다는 뜻이다. 그때 허용량만
    보고 통과시키면 **예산을 모르는 채로 돈을 쓰게 된다.**
  */
  assert.equal(allowanceWithGrants(null, 10), 0);
});
