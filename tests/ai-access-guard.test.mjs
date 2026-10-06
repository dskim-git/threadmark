/**
 * AI 허용을 스스로 켤 수 없는지, 파일에서 확인한다.
 *
 * 왜 이 검사가 따로 있는가
 *   `profiles`의 UPDATE 정책은 **자기 줄을 고치는 것을 허용한다.** 이름과
 *   언어와 시간대를 스스로 바꾸기 때문이다. 그래서 `ai_enabled`를 막는
 *   것은 정책이 아니라 `guard_profile_protected_columns` 트리거의 보호
 *   목록이다. **그 목록에서 한 줄이 빠지면 누구나 스스로 AI를 켠다.**
 *
 *   그 자리는 조용하다. 오류가 나지 않고 그냥 켜진다. 알게 되는 것은
 *   청구서가 올 때다.
 *
 *   003의 검사 149가 같은 것을 보지만 **003은 사람이 SQL Editor에 붙여넣어
 *   돌린다.** 돌리지 않으면 아무것도 말해주지 않는다. 이 검사는
 *   `npm test`에 있어 매번 돈다.
 *
 * 왜 마지막 정의만 보는가
 *   함수는 `create or replace`로 덮어쓴다. 나중 마이그레이션이 이 함수를
 *   다시 쓰면서 보호 목록을 옮겨 적다가 한 줄을 빠뜨릴 수 있다. **2026-10-06에
 *   내가 바로 그 일을 했다** (ai_enabled를 더하려고 함수 전체를 다시 썼다).
 *   그러므로 "어딘가에 있는가"가 아니라 **"마지막 정의에 있는가"**를 본다.
 *
 * 왜 글자 찾기로 쓰지 않는가
 *   `ai_enabled`라는 글자는 칸을 만드는 구문에도 있고 주석에도 있고 감사
 *   트리거에도 있다. 파일 전체에서 찾으면 **보호 목록이 비어도 통과한다.**
 *   이 저장소가 같은 함정에 네 번 걸렸다. (AGENTS.md 6절)
 *   그래서 **무엇이 무엇을 감싸는지**를 본다. 보호 목록 구문을 먼저 떼어낸
 *   다음 그 안에서만 찾는다.
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

/**
 * 마이그레이션을 **이름 순서로** 읽는다.
 *
 * 이름이 시각이라 이름 순서가 적용 순서다. 순서가 틀리면 "마지막 정의"가
 * 마지막이 아니게 되고, 이 검사가 엉뚱한 정의를 본다.
 */
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(path.join(migrationsDir, name), "utf8"),
  }));

const GUARD_NAME = "guard_profile_protected_columns";

/**
 * 함수 정의 하나를 떼어낸다. `create ... function <이름>` 부터 본문을 닫는
 * `$$;` 까지다.
 *
 * 여러 번 정의되어 있으면 **마지막 것**을 돌려준다.
 */
function lastFunctionDefinition(functionName) {
  let found = null;

  for (const { name, sql } of migrations) {
    const pattern = new RegExp(
      String.raw`create\s+(?:or\s+replace\s+)?function\s+public\.${functionName}\s*\([\s\S]*?\$\$\s*;`,
      "gi",
    );

    for (const match of sql.matchAll(pattern)) {
      found = { migration: name, body: match[0] };
    }
  }

  return found;
}

test("가드 함수의 보호 목록을 떼어낼 수 있다", () => {
  const definition = lastFunctionDefinition(GUARD_NAME);

  assert.ok(
    definition,
    `${GUARD_NAME} 정의를 찾지 못했다. 아래 검사들이 헛돌고 있다.`,
  );

  assert.match(
    definition.body,
    /v_protected_changed\s*:=/,
    `${definition.migration}의 ${GUARD_NAME}에 v_protected_changed 구문이 없다. 보호 목록의 모양이 바뀌었다면 이 검사도 함께 고친다.`,
  );
});

/**
 * 보호 목록 구문만 떼어낸다.
 *
 * `v_protected_changed := <조건들>;` 에서 `<조건들>`만이다. 세미콜론까지
 * 가므로 **그 뒤에 오는 함수 본문은 들어오지 않는다.** 그것이 이 검사의
 * 핵심이다. 본문 전체를 보면 감사 트리거에 적힌 `ai_enabled`에 걸려
 * 목록이 비어도 통과한다.
 */
function protectedColumnList() {
  const definition = lastFunctionDefinition(GUARD_NAME);
  const match = definition?.body.match(
    /v_protected_changed\s*:=([\s\S]*?);/,
  );

  return { migration: definition?.migration, list: match?.[1] ?? null };
}

test("AI 허용은 가드의 보호 목록 안에 있다", () => {
  const { migration, list } = protectedColumnList();

  assert.ok(list, "보호 목록 구문을 떼어내지 못했다.");

  assert.match(
    list,
    /\bnew\.ai_enabled\b[\s\S]*?\bold\.ai_enabled\b/,
    `${migration}의 ${GUARD_NAME} 보호 목록에 ai_enabled 견주기가 없다. 이용자가 스스로 AI를 켤 수 있다. 정책은 자기 줄 고치기를 허용하므로 이 트리거가 유일한 방어선이다.`,
  );
});

test("승인 상태도 보호 목록에 그대로 남아 있다", () => {
  /*
    **함수를 다시 쓰다가 옛 줄을 떨어뜨리는 쪽도 본다.** ai_enabled를
    더하는 것만 보면, 승인 상태를 빠뜨린 정의가 통과한다. 그러면 정지된
    계정이 스스로 되살아난다.
  */
  const { migration, list } = protectedColumnList();

  for (const column of ["status", "email", "approved_at", "suspended_at"]) {
    assert.match(
      list,
      new RegExp(String.raw`\bnew\.${column}\b`),
      `${migration}의 ${GUARD_NAME} 보호 목록에서 ${column}이 사라졌다. 함수를 다시 쓰면서 옛 줄을 떨어뜨렸다.`,
    );
  }
});

test("가드 함수는 SECURITY DEFINER가 아니다", () => {
  /*
    DEFINER가 되면 **가드가 소유자 권한으로 돌아 RLS를 비껴간다.** 막아야
    할 갱신을 스스로 통과시키는 자리가 된다. 001의 검사 11이 데이터베이스
    쪽에서 같은 것을 보지만, 그것은 사람이 돌려야 한다.
  */
  const definition = lastFunctionDefinition(GUARD_NAME);
  const header = definition.body.slice(0, definition.body.indexOf("as $$"));

  assert.doesNotMatch(
    header,
    /security\s+definer/i,
    `${definition.migration}의 ${GUARD_NAME}이 SECURITY DEFINER다. 가드는 부르는 사람의 권한으로 돌아야 한다.`,
  );
});

test("ai_enabled는 기본값이 false로 들어온다", () => {
  /*
    **모르면 거부한다.** (AGENTS.md 5절 7번) 기본값이 참이면 가입한 날부터
    예산을 쓰고, 관리자는 청구서가 올 때까지 모른다.

    칸을 만드는 구문만 떼어내 그 안에서 본다. 파일 전체에서 `default false`를
    찾으면 다른 칸의 기본값에 걸린다.
  */
  const statements = migrations.flatMap(({ name, sql }) =>
    [
      ...sql.matchAll(
        /alter\s+table\s+public\.profiles\s+add\s+column[\s\S]*?;/gi,
      ),
    ]
      .filter((match) => /\bai_enabled\b/.test(match[0]))
      .map((match) => ({ migration: name, statement: match[0] })),
  );

  assert.equal(
    statements.length,
    1,
    `profiles에 ai_enabled를 더하는 구문이 ${statements.length}개다. 하나여야 한다.`,
  );

  const [{ migration, statement }] = statements;

  assert.match(
    statement,
    /\bnot\s+null\b/i,
    `${migration}의 ai_enabled에 not null이 없다. 비어 있는 값이 "허용"으로도 "거부"로도 읽힌다.`,
  );

  assert.match(
    statement,
    /\bdefault\s+false\b/i,
    `${migration}의 ai_enabled 기본값이 false가 아니다. 새로 가입한 사람이 바로 AI를 쓰게 된다.`,
  );
});

test("AI 허용을 바꾼 일의 감사 갈래가 허용 목록에 있다", () => {
  /*
    **목록에 없으면 제약이 거부하고 그 UPDATE까지 통째로 되돌아간다.**
    화면에는 "바꾸지 못했습니다"만 나온다. 2026-09-26에 허용량 더하기가
    바로 그래서 안 됐고 쓰는 사람이 먼저 찾았다. (`20260926110000`)

    여기서도 제약 구문을 먼저 떼어낸다. 파일 전체에서 찾으면 감사 트리거가
    넣는 값에 걸려 목록이 비어도 통과한다.
  */
  let last = null;

  for (const { name, sql } of migrations) {
    for (const match of sql.matchAll(
      /add\s+constraint\s+admin_audit_logs_action_check\s+check\s*\([\s\S]*?\)\s*\)\s*;/gi,
    )) {
      last = { migration: name, constraint: match[0] };
    }
  }

  assert.ok(last, "admin_audit_logs_action_check 제약을 찾지 못했다.");

  assert.match(
    last.constraint,
    /'ai_access_changed'/,
    `${last.migration}의 감사 갈래 목록에 ai_access_changed가 없다. 관리자가 AI 허용을 바꾸는 순간 되돌아간다.`,
  );

  assert.match(
    last.constraint,
    /'ai_usage_granted'/,
    `${last.migration}의 감사 갈래 목록에서 ai_usage_granted가 사라졌다. 제약을 다시 쓰면서 옛 갈래를 떨어뜨렸다. 허용량 더하기가 통째로 막힌다.`,
  );
});

/**
 * 돈을 쓰는 자리는 전부 허용을 본다. (19-F)
 *
 * **이 검사가 잡으려는 것은 여섯 번째 자리다.** 지금은 다섯이고, 나중에
 * 누가 AI를 부르는 동작을 하나 더 만들면서 허용 확인을 빠뜨리면 **그
 * 자리만 조용히 열린다.** 허용 못 받은 사람이 거기로 돈을 쓴다.
 *
 * 이 저장소가 같은 모양으로 여러 번 겪었다. `PROTECTED_TABLES`,
 * `EXPORTED_TABLES`, `PROFILE_SEARCH_TARGETS`, 001의 DEFINER 목록이
 * 전부 **한 곳을 잊어서** 생긴 자리다. (AGENTS.md 7절)
 *
 * **손으로 적은 목록과 견주지 않는다.** 그 목록 자체가 또 뒤처질 수 있다.
 * 돈을 쓰는 함수 이름으로 파일을 찾아, 찾아낸 것 **전부**가 허용을 보는지
 * 확인한다. 새 파일이 생기면 저절로 걸린다.
 */

const appDir = path.join(repoRoot, "src", "app");

/** 부르면 Anthropic에 요청이 나가는 함수들. 이 이름이 곧 돈이다. */
const PAID_CALLS = [
  "createAnthropicAskProvider",
  "askWhereToPlace",
  "askWhatFitsHere",
  "extractPaperFromText",
  "createAnthropicTranslationProvider",
];

function walk(dir) {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      found.push(full);
    }
  }

  return found;
}

function paidCallers() {
  return walk(appDir)
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ source }) =>
      PAID_CALLS.some((name) => new RegExp(String.raw`\b${name}\b`).test(source)),
    )
    .map(({ file, source }) => ({
      name: path.relative(repoRoot, file).split(path.sep).join("/"),
      source,
    }));
}

test("돈을 쓰는 자리를 찾아낼 수 있다", () => {
  /*
    **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절) 함수 이름이 바뀌면
    찾는 것이 0개가 되고, 그러면 아래 검사가 **아무것도 보지 않으면서
    통과한다.** 그 상태가 가장 나쁘다. 하나도 없으면 여기서 멈춘다.
  */
  const callers = paidCallers();

  assert.ok(
    callers.length >= 5,
    `돈을 쓰는 자리를 ${callers.length}개 찾았다. 다섯 이상이어야 한다. PAID_CALLS의 함수 이름이 바뀌었는지 본다.`,
  );
});

test("돈을 쓰는 자리는 전부 account.aiEnabled를 본다", () => {
  /*
    **글자 찾기로 쓰지 않는다.** `aiEnabled`라는 글자는 주석에도 있고 다른
    뜻의 변수 이름일 수도 있다. (`paper/page.tsx`가 실제로 `aiEnabled`라는
    이름을 설정 여부에 쓰고 있었다)

    그래서 **`aiAvailability(...)` 호출의 괄호 안**을 떼어내, 그 안에서
    `allowed: account.aiEnabled`를 찾는다. 가드를 부르면서 엉뚱한 값을
    넘기는 것까지 걸린다.
  */
  for (const { name, source } of paidCallers()) {
    const calls = [
      ...source.matchAll(/aiAvailability\(\s*\{([\s\S]*?)\}\s*\)/g),
    ].map((match) => match[1]);

    assert.ok(
      calls.length > 0,
      `${name}이 돈을 쓰는데 aiAvailability로 허용을 보지 않는다. 허용 못 받은 사람이 이 자리로 돈을 쓴다.`,
    );

    assert.ok(
      calls.some((args) => /allowed:\s*account\.aiEnabled\b/.test(args)),
      `${name}의 aiAvailability가 account.aiEnabled를 보지 않는다. 가드를 부르면서 다른 값을 넘기고 있다.`,
    );
  }
});

test("가드를 부르기만 하고 넘어가지 않는다", () => {
  /*
    **망가뜨려 보다가 찾은 구멍이다.** (2026-10-06)

    처음에는 위의 검사만 썼다. 그런데 `if (blocked) { return ... }` 한
    덩어리를 지워도 **통과했다.** 가드를 부르는 것과 그 답으로 멈추는 것은
    다른 일인데, 부르는 것만 보고 있었다.

    그 상태가 가장 나쁘다. 코드에는 허용을 보는 줄이 멀쩡히 있어서, 읽는
    사람은 막혀 있다고 믿는다. **실제로는 값만 셈하고 그대로 지나간다.**

    그래서 **가드가 돌려준 값을 담은 이름**을 찾아, 그 이름이 `if` 안에
    있고 그 `if`가 `return`으로 끝나는지를 본다. 멈추지 않는 가드는 가드가
    아니다.
  */
  for (const { name, source } of paidCallers()) {
    const bindings = [
      ...source.matchAll(
        /const\s+(\w+)\s*=\s*(?:aiBlockedMessage|aiAvailability)\(/g,
      ),
    ].map((match) => match[1]);

    assert.ok(
      bindings.length > 0,
      `${name}이 가드의 답을 어디에도 담지 않는다.`,
    );

    const stops = bindings.some((binding) =>
      new RegExp(
        String.raw`if\s*\([^)]*\b${binding}\b[^)]*\)\s*\{[^}]*return`,
      ).test(source),
    );

    assert.ok(
      stops,
      `${name}이 허용을 보고도 멈추지 않는다. 값만 셈하고 그대로 지나간다. 읽는 사람은 막혀 있다고 믿는데 실제로는 열려 있다.`,
    );
  }
});

test("허용이 없다는 말은 한 곳에서만 온다", () => {
  /*
    다섯 자리가 저마다 말을 적으면 **같은 일을 겪고도 화면마다 다른 말을
    듣는다.** 쓰는 사람은 그것이 같은 까닭인지 알 수 없다.

    그래서 말은 `access.ts`에 두고, 부르는 쪽은 `aiBlockedMessage`로 받는다.
    여기서는 **그 말을 손으로 베껴 적은 자리가 없는지** 본다.
  */
  const message = readFileSync(
    path.join(repoRoot, "src", "lib", "ai", "access.ts"),
    "utf8",
  ).match(/AI_NOT_ALLOWED_MESSAGE =\s*\n?\s*"([^"]+)"/)?.[1];

  assert.ok(message, "AI_NOT_ALLOWED_MESSAGE를 떼어내지 못했다.");

  for (const { name, source } of paidCallers()) {
    assert.ok(
      !source.includes(message),
      `${name}이 허용 안내문을 손으로 베껴 적었다. aiBlockedMessage를 쓴다. 베껴 적으면 말을 고칠 때 한 곳이 뒤처진다.`,
    );
  }
});

/**
 * 돈을 쓰는 자리는 전부 장부를 보고, 전부 장부에 적는다. (19-F 2차례)
 *
 * **2026-10-06까지 다섯 가운데 둘이 장부 밖에 있었다.** 번역과 논문 서지
 * 보조다. 둘 다 `rate-limit.ts`의 연타 한도만 걸려 있었고, 그 파일이 스스로
 * "진짜 상한은 데이터베이스에 둔다"고 적어 두었다. **적어둔 할 일이
 * 적어둔 자리에서 그대로 남아 있었다.**
 *
 * 혼자 쓸 때는 드러나지 않는다. 사람이 늘면 그 둘로 예산이 샌다.
 *
 * 보는 것이 둘이다
 *   `decideAiCallNow`  부르기 전에 몫이 남았는지 본다
 *   `recordAiUsage`    부른 뒤에 얼마나 썼는지 적는다
 *
 * **둘 다 있어야 한다.** 보기만 하고 안 적으면 장부가 늘 비어 있어 한도가
 * 걸리지 않는다. 적기만 하고 안 보면 넘겨 쓴다.
 */
test("돈을 쓰는 자리는 전부 한 달 장부를 본다", () => {
  for (const { name, source } of paidCallers()) {
    assert.match(
      source,
      /\bdecideAiCallNow\s*\(/,
      `${name}이 돈을 쓰는데 한 달 몫을 보지 않는다. 이 길로는 얼마든지 쓸 수 있다.`,
    );
  }
});

test("돈을 쓰는 자리는 전부 장부에 적는다", () => {
  for (const { name, source } of paidCallers()) {
    assert.match(
      source,
      /\brecordAiUsage\s*\(/,
      `${name}이 돈을 쓰고도 장부에 적지 않는다. 쓴 돈이 안 세어져 한도가 걸리지 않는다.`,
    );
  }
});

test("장부에 적는 갈래가 앱이 아는 갈래다", () => {
  /*
    **글자를 손으로 적는 자리다.** `feature: "serach"`처럼 한 글자가 틀리면
    열거형이 거부하고 그 동작까지 통째로 되돌아간다. 타입이 막아 주지만,
    **타입을 비껴가는 길**(as, 변수)이 생길 수 있어 글로도 본다.
  */
  const known = new Set(AI_FEATURES);

  for (const { name, source } of paidCallers()) {
    for (const match of source.matchAll(/feature:\s*"([a-z_]+)"/g)) {
      assert.ok(
        known.has(match[1]),
        `${name}이 '${match[1]}'로 적는데 앱이 모르는 갈래다. 아는 것은 ${[...known].join(", ")}이다.`,
      );
    }
  }
});
