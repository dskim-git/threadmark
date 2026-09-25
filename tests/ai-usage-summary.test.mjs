/**
 * 장부 줄을 사람별·갈래별로 세는 셈의 단위 검사. (19-E.4)
 *
 * **여기가 틀리면 오류 없이 숫자만 틀린다.** 관리자 화면은 그 숫자를 보고
 * 누구를 풀어줄지 정하므로, 덜 센 숫자는 "이 사람은 안 썼다"로 읽힌다.
 * 덜 나오는 것은 틀린 것처럼 보이지 않는다. (AGENTS.md 7절)
 *
 * 특히 두 자리를 본다.
 *   - 우리가 모르는 갈래로 부른 줄이 합에서 사라지지 않는가
 *   - 되돌린 음수 줄이 그대로 더해지는가
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_FEATURES,
  AI_FEATURE_LABELS,
  emptyTally,
  sumGrantsByOwner,
  tallyByOwner,
} from "../src/lib/ai/usage-summary.ts";

// -----------------------------------------------------------------------------
// 갈래 목록
// -----------------------------------------------------------------------------

test("갈래마다 화면에 보일 이름이 있다", () => {
  // 이름이 빠지면 그 자리에 undefined가 그대로 나온다.
  for (const feature of AI_FEATURES) {
    assert.equal(typeof AI_FEATURE_LABELS[feature], "string");
    assert.ok(AI_FEATURE_LABELS[feature].length > 0, `${feature}: 이름이 없다`);
  }
});

test("이름표에 목록 밖의 갈래가 없다", () => {
  // 없어진 갈래의 이름이 남아 있으면 "아직 있는 기능"으로 읽힌다.
  assert.deepEqual(
    Object.keys(AI_FEATURE_LABELS).toSorted(),
    [...AI_FEATURES].toSorted(),
  );
});

// -----------------------------------------------------------------------------
// 사람별·갈래별로 세기
// -----------------------------------------------------------------------------

test("한 번도 부르지 않은 사람의 셈은 모두 0이다", () => {
  const tally = emptyTally();

  assert.equal(tally.total, 0);
  assert.equal(tally.unknown, 0);

  for (const feature of AI_FEATURES) {
    assert.equal(tally.byFeature[feature], 0);
  }
});

test("사람별로 나누고 갈래별로 센다", () => {
  const tallies = tallyByOwner([
    { owner_id: "a", feature: "search" },
    { owner_id: "a", feature: "search" },
    { owner_id: "a", feature: "translation" },
    { owner_id: "b", feature: "placement" },
  ]);

  assert.equal(tallies.get("a").total, 3);
  assert.equal(tallies.get("a").byFeature.search, 2);
  assert.equal(tallies.get("a").byFeature.translation, 1);
  assert.equal(tallies.get("a").byFeature.placement, 0);

  assert.equal(tallies.get("b").total, 1);
  assert.equal(tallies.get("b").byFeature.placement, 1);
});

test("줄이 없는 사람은 열쇠 자체가 없다", () => {
  // 0으로 채워 돌려주면 "누가 있는지"를 이 함수가 안다는 뜻이 된다. 모른다.
  const tallies = tallyByOwner([{ owner_id: "a", feature: "search" }]);

  assert.equal(tallies.has("b"), false);
});

test("모르는 갈래도 전체 횟수에는 들어간다", () => {
  /*
    데이터베이스에 값이 먼저 늘고 코드가 아직 모를 때 생긴다. 갈래별 칸에만
    세면 그 줄이 조용히 사라져 한도 셈과 화면이 어긋난다.
  */
  const tallies = tallyByOwner([
    { owner_id: "a", feature: "search" },
    { owner_id: "a", feature: "embedding" },
    { owner_id: "a", feature: "embedding" },
  ]);

  assert.equal(tallies.get("a").total, 3);
  assert.equal(tallies.get("a").unknown, 2);
  assert.equal(tallies.get("a").byFeature.search, 1);
});

test("아는 갈래는 모르는 쪽으로 새지 않는다", () => {
  const tallies = tallyByOwner(
    AI_FEATURES.map((feature) => ({ owner_id: "a", feature })),
  );

  assert.equal(tallies.get("a").unknown, 0);
  assert.equal(tallies.get("a").total, AI_FEATURES.length);
});

test("빈 목록에서는 아무도 나오지 않는다", () => {
  assert.equal(tallyByOwner([]).size, 0);
});

// -----------------------------------------------------------------------------
// 허용량 더하기
// -----------------------------------------------------------------------------

test("한 사람의 허용량 줄을 모두 더한다", () => {
  const sums = sumGrantsByOwner([
    { owner_id: "a", extra_calls: 50 },
    { owner_id: "a", extra_calls: 20 },
    { owner_id: "b", extra_calls: 10 },
  ]);

  assert.equal(sums.get("a"), 70);
  assert.equal(sums.get("b"), 10);
});

test("되돌린 음수 줄이 그대로 더해진다", () => {
  /*
    잘못 줬을 때 줄을 지우는 대신 음수로 한 줄 더 남긴다. (19-E.2)
    음수를 빼먹고 더하면 되돌리기가 아무 일도 하지 않는다.
  */
  const sums = sumGrantsByOwner([
    { owner_id: "a", extra_calls: 50 },
    { owner_id: "a", extra_calls: -50 },
  ]);

  assert.equal(sums.get("a"), 0);
});

test("합이 음수가 되는 것을 여기서 막지 않는다", () => {
  // 기본 한도 아래로 내려가지 않게 하는 일은 limitWithGrants가 맡는다.
  const sums = sumGrantsByOwner([{ owner_id: "a", extra_calls: -30 }]);

  assert.equal(sums.get("a"), -30);
});

test("허용량이 없는 사람은 열쇠 자체가 없다", () => {
  assert.equal(sumGrantsByOwner([]).has("a"), false);
});
