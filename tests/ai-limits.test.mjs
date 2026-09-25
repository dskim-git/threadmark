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
  AI_MONTHLY_CALL_LIMIT,
  MONTH_BOUNDARY_OFFSET_MINUTES,
  decideAiCall,
  monthStart,
} from "../src/lib/ai/limits.ts";

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

test("한 번도 안 썼으면 한도만큼 남아 있다", () => {
  const decision = decideAiCall(0, 10);

  assert.equal(decision.allowed, true);
  assert.equal(decision.remaining, 10);
  assert.equal(decision.used, 0);
  assert.equal(decision.limit, 10);
});

test("한 번 남았을 때는 통과한다", () => {
  const decision = decideAiCall(9, 10);

  assert.equal(decision.allowed, true);
  assert.equal(decision.remaining, 1);
});

test("한도에 닿으면 막는다", () => {
  // 딱 맞은 것도 막는다. 10번까지면 열한 번째가 막혀야 한다.
  const decision = decideAiCall(10, 10);

  assert.equal(decision.allowed, false);
  assert.equal(decision.remaining, 0);
  assert.equal(decision.used, 10);
});

test("어쩌다 한도를 넘겨도 남은 수가 음수가 되지 않는다", () => {
  const decision = decideAiCall(13, 10);

  assert.equal(decision.allowed, false);
  assert.equal(decision.remaining, 0);
});

test("센 값을 모르면 막는다", () => {
  /*
    장부를 읽지 못했을 때다. 모르면 거부한다. (AGENTS.md 5절 7번)
    통과시키면 한도가 아예 없는 것과 같아진다.
  */
  for (const unknown of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
    const decision = decideAiCall(unknown, 10);

    assert.equal(decision.allowed, false, `${unknown}이 통과했다`);
    assert.equal(decision.remaining, 0);
  }
});

test("모를 때 쓴 횟수를 한도보다 크게 말하지 않는다", () => {
  // 화면에 "10번 중 99999번 씀"처럼 보이면 읽는 사람이 더 헷갈린다.
  const decision = decideAiCall(Number.NaN, 10);

  assert.equal(decision.used, 10);
});

test("한도가 0이면 아무것도 통과하지 않는다", () => {
  assert.equal(decideAiCall(0, 0).allowed, false);
});

test("한도 값이 이상하면 0으로 본다", () => {
  // 설정을 잘못 건드렸을 때 열리는 쪽이 아니라 닫히는 쪽으로 넘어진다.
  for (const broken of [Number.NaN, -5, 2.5]) {
    assert.equal(decideAiCall(0, broken).allowed, false, `${broken}이 통과했다`);
  }
});

test("기본 한도가 정해져 있다", () => {
  assert.ok(Number.isInteger(AI_MONTHLY_CALL_LIMIT));
  assert.ok(AI_MONTHLY_CALL_LIMIT > 0);

  // 기본값을 주지 않아도 그 한도로 판단한다.
  assert.equal(decideAiCall(AI_MONTHLY_CALL_LIMIT).allowed, false);
  assert.equal(decideAiCall(AI_MONTHLY_CALL_LIMIT - 1).allowed, true);
});
