/**
 * 단가와 쓴 돈 셈의 단위 검사. (19-F 2차례, ADR 0003)
 *
 * **이 셈이 틀리면 돈이 나간다.** 싸게 세면 쓴 돈이 실제보다 적게 보여
 * 한도가 헐거워지고, 비싸게 세면 아직 쓸 수 있는 사람이 막힌다. 둘 다
 * 오류 없이 숫자만 틀린다.
 *
 * `limits.ts`가 횟수를 고른 까닭이 "단가가 바뀌면 코드가 조용히 틀린
 * 금액을 말한다"였다. **조용하지 않게 두는 것**이 이 검사가 하는 일이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_PRICES,
  WORST_CASE_CALL_USD,
  WORST_CASE_INPUT_TOKENS,
  WORST_CASE_OUTPUT_TOKENS,
  highestPrice,
  priceFor,
  spentUsd,
} from "../src/lib/ai/pricing.ts";

// -----------------------------------------------------------------------------
// 아는 모델과 모르는 모델
// -----------------------------------------------------------------------------

test("기본 모델의 단가를 안다", () => {
  /*
    설계 문서 18.1절이 정한 모델이다. 검색·번역·자리 추천·논문 보조가
    모두 이것을 기본값으로 쓴다. **이 줄이 없으면 AI가 통째로 막힌다.**
  */
  const price = priceFor("claude-sonnet-5");

  assert.ok(price, "claude-sonnet-5의 단가가 없다.");
  assert.ok(price.inputPerMTok > 0);
  assert.ok(price.outputPerMTok > 0);
});

test("모르는 모델은 null이다. 0이 아니다", () => {
  /*
    **0으로 보면 그 모델을 쓰는 동안 한도가 없는 것과 같아진다.**
    `ANTHROPIC_MODEL`로 모델을 바꾸면 그날로 막혀야 하고, 화면이 까닭을
    말해야 한다.
  */
  assert.equal(priceFor("gpt-4"), null);
  assert.equal(priceFor(""), null);
});

test("앞뒤 공백이 붙어도 같은 모델로 본다", () => {
  /*
    모델 이름은 환경변수에서 온다. 줄 끝 공백 하나로 **아는 모델이 모르는
    모델이 되면** 기능이 통째로 멈춘다.
  */
  assert.ok(priceFor(" claude-sonnet-5 "));
});

test("단가표가 비어 있지 않다", () => {
  /*
    **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절) 표가 비면
    `highestPrice()`가 `-Infinity`를 돌려주고, 그러면 모르는 모델의 값이
    음수가 되어 **쓸수록 쓴 돈이 줄어든다.**
  */
  assert.ok(Object.keys(MODEL_PRICES).length >= 1);

  const highest = highestPrice();

  assert.ok(Number.isFinite(highest.inputPerMTok));
  assert.ok(Number.isFinite(highest.outputPerMTok));
});

// -----------------------------------------------------------------------------
// 쓴 돈 셈
// -----------------------------------------------------------------------------

test("백만 토큰당 단가로 셈한다", () => {
  const price = priceFor("claude-sonnet-5");
  const spent = spentUsd("claude-sonnet-5", 1_000_000, 1_000_000);

  assert.equal(spent, price.inputPerMTok + price.outputPerMTok);
});

test("한 푼도 안 쓰면 0이다", () => {
  assert.equal(spentUsd("claude-sonnet-5", 0, 0), 0);
});

test("모르는 모델은 가장 비싼 단가로 친다", () => {
  /*
    **모르면 비싸게 친다.** 싸게 치면 쓴 돈이 실제보다 적게 보이고, 그것이
    가장 나쁘다. 이미 쌓인 장부에 우리가 모르는 모델이 적혀 있을 수 있다.
  */
  const highest = highestPrice();
  const spent = spentUsd("우리가-모르는-모델", 1_000_000, 0);

  assert.equal(spent, highest.inputPerMTok);
});

test("음수 토큰을 0으로 본다", () => {
  /*
    장부는 고칠 수 없게 해 두었지만, 셈하는 쪽이 음수를 그대로 더하면
    **많이 쓴 사람이 적게 쓴 것으로 보일 수 있다.**
  */
  assert.equal(spentUsd("claude-sonnet-5", -1_000_000, 0), 0);
});

// -----------------------------------------------------------------------------
// 한 번 상한
// -----------------------------------------------------------------------------

test("한 번 상한이 토큰 상한과 단가에서 나온다", () => {
  /*
    **손으로 적은 숫자가 아니다.** 토큰 상한이 바뀌면 이 값도 따라 바뀌어야
    하고, 그 둘이 어긋나면 "어림 몇 번"과 허용량 환산이 조용히 틀린다.
  */
  assert.equal(
    WORST_CASE_CALL_USD,
    spentUsd(
      "claude-sonnet-5",
      WORST_CASE_INPUT_TOKENS,
      WORST_CASE_OUTPUT_TOKENS,
    ),
  );
});

test("한 번 상한이 실제로 들 만한 값이다", () => {
  /*
    범위로 본다. 정확한 값을 박으면 단가가 바뀔 때마다 검사를 고쳐야 하고,
    **고치다 보면 생각 없이 고치게 된다.**

    아래쪽은 0보다 커야 한다. 0이면 `remainingCalls`가 무한이 되어 한도가
    사라진다. 위쪽은 한 달 예산($5 어름)보다 작아야 한다. 한 번에 한 달
    예산을 넘기면 아무도 한 번도 못 쓴다.
  */
  assert.ok(WORST_CASE_CALL_USD > 0, "한 번 상한이 0이면 한도가 사라진다.");
  assert.ok(WORST_CASE_CALL_USD < 1, "한 번에 1달러를 넘기면 셈을 다시 본다.");
});
