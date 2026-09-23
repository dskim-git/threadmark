/**
 * 자료 상태 단위 검사. (설계 문서 8.4절의 `reading_candidate`)
 *
 * 상태값이 두 곳에 있다. `types.ts`와 마이그레이션이다. 타입 쪽은 `satisfies`가
 * 컴파일 단계에서 잡아주지만, 그것은 **타입을 다시 생성한 뒤**의 이야기다.
 * 마이그레이션을 고치고 `npm run db:types`를 잊으면 둘이 어긋난 채로 컴파일이
 * 통과한다. 그 틈을 여기서 막는다.
 *
 * 값을 더하는 파일과 그 값을 쓰는 파일이 나뉘어 있는지도 함께 본다.
 * 한 파일에 몰아넣으면 `db push`가 거기서 막힌다. (AGENTS.md 6절)
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SOURCE_STATUSES,
  getSourceStatusLabel,
  isReadingCandidate,
  isSourceStatus,
} from "../src/lib/sources/types.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrationNames = readdirSync(migrationsDir).filter((name) =>
  name.endsWith(".sql"),
);

/** 파일 이름 -> 내용. 어느 파일에 무엇이 있는지를 봐야 하는 검사가 있다. */
const byFile = new Map(
  migrationNames.map((name) => [
    name,
    readFileSync(path.join(migrationsDir, name), "utf8"),
  ]),
);

const migrations = [...byFile.values()].join("\n");
const flat = migrations.replace(/\s+/g, " ").toLowerCase();

// -----------------------------------------------------------------------------
// 목록이 어긋나지 않는다
// -----------------------------------------------------------------------------

test("모든 상태값이 마이그레이션에 있다", () => {
  // 처음 만들 때 넣은 값과 나중에 더한 값 둘 다 찾는다.
  for (const status of SOURCE_STATUSES) {
    const created = flat.includes(
      `create type public.source_status as enum ('${status}')`,
    );
    const added = flat.includes(
      `add value if not exists '${status}'`,
    );

    assert.ok(
      created || added,
      `${status}이 source_status에 없다. 화면에서는 쓰는데 저장이 거부된다`,
    );
  }
});

test("설계 문서 8.4절의 후보 상태가 있다", () => {
  assert.ok(SOURCE_STATUSES.includes("reading_candidate"));
  assert.equal(getSourceStatusLabel("reading_candidate"), "읽을 후보");
});

test("값을 더하는 파일과 쓰는 파일이 나뉘어 있다", () => {
  /*
    ALTER TYPE ... ADD VALUE로 더한 값은 같은 트랜잭션에서 쓸 수 없다.
    Supabase CLI는 파일마다 트랜잭션을 따로 잡으므로 파일을 나눠야 한다.
    한 파일에 몰아넣으면 db push가 거기서 막힌다. (AGENTS.md 6절)
  */
  const adding = [...byFile.entries()].filter(([, sql]) =>
    sql.includes("add value if not exists 'reading_candidate'"),
  );

  assert.equal(adding.length, 1, "값을 더하는 파일이 하나가 아니다");

  const [addingName, addingSql] = adding[0];

  assert.ok(
    !addingSql.includes("'reading_candidate'::public.source_status"),
    `${addingName}이 값을 더하면서 같은 파일에서 쓰고 있다`,
  );

  const using = [...byFile.entries()].filter(
    ([name, sql]) =>
      name !== addingName &&
      sql.includes("'reading_candidate'::public.source_status"),
  );

  assert.ok(using.length > 0, "더한 값을 쓰는 파일이 없다");
});

test("후보에서 정식으로 가는 방향만 허용한다", () => {
  /*
    되돌릴 수 있게 두면 인용과 메모와 파일이 붙은 논문이 "아직 안 읽은 것"이
    된다. RLS의 WITH CHECK는 OLD를 볼 수 없어서 트리거로 막는다.
  */
  assert.ok(
    flat.includes(
      "old.status = 'reading_candidate'::public.source_status and new.status = 'active'::public.source_status",
    ),
    "상태 전환 방향을 제한하지 않는다",
  );
});

test("가드 함수를 바꿔 쓰면서 원래 막던 것을 그대로 막는다", () => {
  /*
    sources의 BEFORE UPDATE 가드는 하나다. 상태 규칙을 넣으면서 그 함수를
    다시 정의하는데, 원래 막던 열을 빠뜨리면 그 보호가 조용히 사라진다.
    마지막 정의가 실제로 도는 정의다.
  */
  const marker =
    "create or replace function public.guard_source_immutable_columns()";
  const last = migrations.lastIndexOf(marker);

  assert.notEqual(last, -1, "가드 함수 정의를 찾을 수 없다");

  const body = migrations.slice(last, last + 2500);

  for (const column of ["id", "owner_id", "created_at"]) {
    assert.ok(
      body.includes(`new.${column} is distinct from old.${column}`),
      `가드 함수가 ${column}을 더 이상 막지 않는다`,
    );
  }

  assert.ok(
    body.includes("new.updated_at := pg_catalog.now()"),
    "가드 함수가 updated_at을 더 이상 채우지 않는다",
  );
});

// -----------------------------------------------------------------------------
// 모르는 값
// -----------------------------------------------------------------------------

test("아는 상태만 통과한다", () => {
  assert.ok(isSourceStatus("active"));
  assert.ok(isSourceStatus("reading_candidate"));
  assert.ok(!isSourceStatus("archived"));
  assert.ok(!isSourceStatus(""));
  assert.ok(!isSourceStatus(null));
});

test("모르는 상태는 보통의 자료로 본다", () => {
  /*
    상태는 접근 통제가 아니라 표시에만 쓰인다. 여기서 막으면 자료 자체가
    보이지 않게 되는데, 그것은 모르는 값 하나에 비해 너무 큰 대가다.
  */
  assert.equal(getSourceStatusLabel("archived"), "정식 자료");
  assert.ok(!isReadingCandidate("archived"));
  assert.ok(!isReadingCandidate(undefined));
  assert.ok(isReadingCandidate("reading_candidate"));
});
