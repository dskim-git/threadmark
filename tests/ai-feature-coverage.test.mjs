/**
 * 앱이 적는 AI 갈래가 데이터베이스에도 있는지 본다.
 *
 * 왜 이 검사가 있는가
 *   `ai_usage_events.feature`는 열거형이다. 앱이 **거기 없는 값**으로
 *   기록하려 하면 그 INSERT가 거부되고, `recordAiUsage`를 부른 자리까지
 *   되돌아간다.
 *
 *   2026-09-26에 그 모양을 한 번 겪었다. 감사 기록의 갈래 목록에
 *   `ai_usage_granted`가 없어서 **허용량 더하기가 통째로 안 됐고**, 화면에는
 *   "더하지 못했습니다"만 나왔다. 쓰는 사람이 먼저 찾았다. (`20260926110000`)
 *
 *   `ALTER TYPE ... ADD VALUE`로 더한 값은 **같은 트랜잭션에서 쓸 수 없어**
 *   마이그레이션을 따로 만들어야 한다. 그래서 "코드만 고치고 마이그레이션을
 *   잊는" 자리가 생기기 쉽다. 여기서 막는다.
 *
 * 한쪽 방향만 본다
 *   **앱의 갈래가 전부 데이터베이스에 있는가**만 본다. 반대쪽(데이터베이스에
 *   있는데 앱이 안 쓰는 값)은 보지 않는다. 그쪽은 아무것도 깨뜨리지 않고,
 *   **마이그레이션을 먼저 올리는 순서 그대로가 잠깐 그 상태**이기 때문이다.
 *   그것까지 막으면 올바른 순서로 일할 때 검사가 걸린다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { AI_FEATURES } from "../src/lib/ai/usage-summary.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

/*
  **주석을 먼저 걷어낸다.**

  처음에는 그냥 읽어 견줬다가 아무 값도 못 찾았다. 값을 적어둔 자리의
  주석에 `(9.4절)`이 있었고, 괄호를 세는 무늬가 **그 닫는 괄호에서
  멈췄다.** 한국어로 까닭을 적는 이 저장소에서는 괄호가 주석에 흔하다.

  `migration-invariants.test.mjs`가 같은 일을 먼저 하고 있었다.
*/
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

/**
 * 마이그레이션이 만든 `ai_feature` 값을 모은다.
 *
 * 두 곳에서 온다. 처음 만들 때의 `create type ... as enum (...)`과, 나중에
 * 하나씩 더한 `alter type ... add value`다. **둘 다 봐야 한다.** 처음 것만
 * 보면 나중에 더한 값이 없는 것으로 읽히고, 나중 것만 보면 처음 둘이
 * 빠진다.
 */
function enumValues() {
  const values = new Set();

  const created = sql.match(
    /create\s+type\s+public\.ai_feature\s+as\s+enum\s*\(([\s\S]*?)\)/i,
  );

  if (created) {
    for (const match of created[1].matchAll(/'([a-z_]+)'/g)) {
      values.add(match[1]);
    }
  }

  for (const match of sql.matchAll(
    /alter\s+type\s+public\.ai_feature\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([a-z_]+)'/gi,
  )) {
    values.add(match[1]);
  }

  return values;
}

test("마이그레이션에서 AI 갈래 값을 읽어낼 수 있다", () => {
  /*
    **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절) 구문 모양이 바뀌어
    하나도 못 읽으면, 아래 검사가 **모든 갈래가 빠졌다고** 소리치거나
    (그나마 낫다) 비교 자체가 뜻을 잃는다.
  */
  const values = enumValues();

  assert.ok(
    values.size >= 3,
    `마이그레이션에서 ai_feature 값을 ${values.size}개 읽었다. 셋 이상이어야 한다. 구문 모양이 바뀌었는지 본다.`,
  );
});

test("앱이 적는 AI 갈래가 전부 데이터베이스에 있다", () => {
  const values = enumValues();

  for (const feature of AI_FEATURES) {
    assert.ok(
      values.has(feature),
      `앱이 '${feature}'로 기록하는데 ai_feature 열거형에 그 값이 없다. 장부에 적는 순간 거부되고, 그것을 부른 동작까지 통째로 되돌아간다. 마이그레이션을 하나 더한다.`,
    );
  }
});
