/**
 * 운영 설정의 열쇠와 범위가 데이터베이스와 맞는지 본다. (19-F)
 *
 * 왜 이 검사가 있는가
 *   설정을 바꾸는 코드가 이렇게 생겼다.
 *
 *     .update({ value }).eq("key", AI_MONTHLY_BUDGET_KEY)
 *
 *   **열쇠 이름이 한 글자라도 다르면 아무 줄도 안 바뀐다.** 그런데
 *   PostgREST는 그것을 오류로 돌려주지 않는다. 0줄을 고친 것은 실패가
 *   아니기 때문이다. 그래서 화면은 "바꿨습니다"라고 말하고, 값은 그대로다.
 *
 *   **오류가 나지 않는 고장이라 눌러봐도 모른다.** 저장을 누르고 새로
 *   고치면 옛 값이 그대로 있는데, 그것을 "저장이 안 됐나" 하고 한 번 더
 *   누르게 된다.
 *
 * 범위도 함께 본다
 *   화면이 받는 범위와 데이터베이스 제약이 어긋나면 **화면은 받아 놓고
 *   데이터베이스가 거부한다.** 그때 나오는 말로는 무엇이 잘못됐는지 알 수
 *   없다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AI_BUDGET_MAX_USD,
  AI_BUDGET_MIN_USD,
  AI_MONTHLY_BUDGET_KEY,
  REQUIRE_USER_APPROVAL_KEY,
} from "../src/lib/admin/settings-keys.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

test("앱이 쓰는 설정 열쇠가 마이그레이션에 있다", () => {
  /*
    `insert into public.app_settings (key, ...) values ('<열쇠>', ...)`에서
    열쇠를 뽑는다. **주석에 적힌 이름에 걸리지 않게** 그 구문 안에서만
    찾는다. 이 저장소는 주석에 열쇠 이름을 자주 적는다.
  */
  const inserted = new Set();

  for (const match of sql.matchAll(
    /insert\s+into\s+public\.app_settings[\s\S]{0,200}?values\s*\(\s*'([a-z_]+)'/gi,
  )) {
    inserted.add(match[1]);
  }

  assert.ok(
    inserted.size >= 1,
    `app_settings에 넣는 열쇠를 ${inserted.size}개 찾았다. 하나 이상이어야 한다. 구문 모양이 바뀌었는지 본다.`,
  );

  for (const key of [REQUIRE_USER_APPROVAL_KEY, AI_MONTHLY_BUDGET_KEY]) {
    assert.ok(
      inserted.has(key),
      `앱이 '${key}'로 설정을 읽고 쓰는데 그 줄을 넣는 마이그레이션이 없다. 그 열쇠로는 아무 줄도 안 바뀌고, 오류도 나지 않는다.`,
    );
  }
});

test("예산 범위가 데이터베이스 제약과 맞는다", () => {
  /*
    제약에서 위쪽 한도를 뽑는다.
    `(value #>> '{}')::numeric <= 100` 모양이다.
  */
  const constraint = sql.match(
    /add\s+constraint\s+app_settings_ai_monthly_budget_usd_is_number[\s\S]*?;/i,
  );

  assert.ok(constraint, "예산 모양 제약을 찾지 못했다.");

  const upper = constraint[0].match(/::numeric\s*<=\s*([0-9.]+)/);

  assert.ok(upper, "제약에서 위쪽 한도를 읽지 못했다.");

  assert.equal(
    AI_BUDGET_MAX_USD,
    Number(upper[1]),
    `화면이 받는 위쪽 한도(${AI_BUDGET_MAX_USD})와 데이터베이스 제약(${upper[1]})이 다르다. 화면은 받아 놓고 데이터베이스가 거부한다.`,
  );

  /*
    아래쪽은 **더 엄해도 된다.** 제약은 `> 0`이고 화면은 그보다 큰 값만
    받는다. 화면이 더 느슨하면 거부당하는 값을 받게 되므로 그쪽만 막는다.
  */
  assert.ok(
    AI_BUDGET_MIN_USD > 0,
    "화면이 0 이하의 예산을 받는다. 제약이 거부한다.",
  );
});

test("예산을 0으로 두는 길이 없다", () => {
  /*
    **0은 "아무도 AI를 못 쓴다"는 뜻이다.** 그것이 뜻이라면 AI 허용을
    모두 끄는 쪽이 맞다. 예산을 0으로 두면 허용받은 사람에게 단추는
    보이는데 누르면 막힌다. **눌러야 안 된다는 걸 아는 단추**가 된다.
  */
  assert.ok(AI_BUDGET_MIN_USD > 0);
});
