/**
 * 프로젝트별 논문 활용 계획 단위 검사. (설계 문서 8.3절)
 *
 * 14-B의 분석 서식과 같은 약속을 지킨다. **항목은 한 곳에만 적는다.**
 *
 * 목록이 두 곳에 있다. `project-use-fields.ts`와 마이그레이션이다.
 * 어긋나면 화면에는 칸이 보이는데 저장은 되지 않는다. 사용자는 적어 넣고
 * 저장을 누른 뒤, 돌아와서 그 글이 사라진 것을 본다.
 *
 * 상태값도 같다. 화면에서 고를 수는 있는데 데이터베이스가 거부하면,
 * 원인이 보이지 않는 저장 실패가 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_PAPER_USE_STATUS,
  MAX_USE_LONG_LENGTH,
  MAX_USE_SHORT_LENGTH,
  PAPER_USE_STATUSES,
  PROJECT_USE_COLUMNS,
  PROJECT_USE_FIELDS,
  countUseFilled,
  getPaperUseStatusLabel,
  isPaperUseStatus,
  maxLengthFor,
} from "../src/lib/papers/project-use-fields.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

/** 공백을 한 칸으로 줄여 줄바꿈에 영향받지 않게 만든 비교용 텍스트. */
const flat = migrations.replace(/\s+/g, " ").toLowerCase();

// -----------------------------------------------------------------------------
// 목록이 어긋나지 않는다
// -----------------------------------------------------------------------------

test("모든 항목에 데이터베이스 열이 있다", () => {
  for (const column of PROJECT_USE_COLUMNS) {
    assert.ok(
      new RegExp(`\\n\\s+${column}\\s+text,`).test(migrations),
      `${column} 열이 마이그레이션에 없다. 화면에는 칸이 보이는데 저장되지 않는다`,
    );
  }
});

test("모든 항목에 길이 제약이 걸려 있다", () => {
  for (const field of PROJECT_USE_FIELDS) {
    const max = maxLengthFor(field);

    if (field.size === "short") {
      // 한 줄 칸은 제약을 그대로 적었다.
      assert.ok(
        flat.includes(`char_length(${field.column}) <= ${max}`),
        `${field.column}의 길이 제약이 마이그레이션에 없다`,
      );
      continue;
    }

    // 여러 줄 칸은 이름 목록 하나로 같은 제약을 건다.
    assert.ok(
      migrations.includes(`'${field.column}'`),
      `${field.column}이 길이 제약 목록에 없다`,
    );
  }

  assert.ok(
    flat.includes(`<= ${MAX_USE_LONG_LENGTH}`),
    `여러 줄 칸의 상한 ${MAX_USE_LONG_LENGTH}이 마이그레이션과 다르다`,
  );
  assert.ok(
    flat.includes(`<= ${MAX_USE_SHORT_LENGTH}`),
    `한 줄 칸의 상한 ${MAX_USE_SHORT_LENGTH}이 마이그레이션과 다르다`,
  );
});

test("상태값이 마이그레이션의 열거형과 같다", () => {
  const values = PAPER_USE_STATUSES.map((status) => `'${status.value}'`).join(
    ", ",
  );

  assert.ok(
    flat.includes(`create type public.paper_use_status as enum (${values})`),
    `paper_use_status의 값이 화면과 다르다. 고를 수는 있는데 저장이 거부된다`,
  );
});

test("기본 상태가 데이터베이스 기본값과 같다", () => {
  assert.ok(
    flat.includes(
      `status public.paper_use_status not null default '${DEFAULT_PAPER_USE_STATUS}'`,
    ),
    "계획을 처음 만들 때의 상태가 데이터베이스 기본값과 다르다",
  );
});

test("논문과 프로젝트의 짝은 하나뿐이다", () => {
  // 둘이 되면 어느 쪽이 지금 계획인지 알 수 없다.
  assert.ok(
    flat.includes(
      "constraint paper_project_uses_unique_pair unique (paper_source_id, project_id)",
    ),
    "짝에 unique 제약이 없다",
  );
});

test("소유자 열에 기본값과 트리거가 함께 있다", () => {
  /*
    기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
    기본값이 없으면 생성된 타입이 owner_id를 필수로 보고, 보안 원칙 2와
    어긋나게 코드가 그 값을 보내야 한다. sources와 paper_profiles가
    같은 곳에서 두 번 걸렸다.
  */
  assert.ok(
    flat.includes("owner_id uuid not null default auth.uid()"),
    "owner_id에 default auth.uid()가 없다",
  );
  assert.ok(
    flat.includes(
      "create trigger paper_project_uses_set_owner before insert on public.paper_project_uses",
    ),
    "소유자를 채우는 트리거가 없다",
  );
});

test("연결 양쪽의 소유자를 모두 확인한다", () => {
  /*
    외래키 제약은 RLS를 보지 않는다. 한쪽만 확인하면 남의 논문에 대한 계획을
    내 프로젝트에 붙이거나, 남의 프로젝트에 내 계획을 밀어넣을 수 있다.
  */
  const marker = "create or replace function public.set_paper_project_use_owner()";
  const start = migrations.indexOf(marker);

  assert.notEqual(start, -1, "소유자 고정 함수를 찾을 수 없다");

  const body = migrations.slice(start, start + 1200);

  assert.ok(
    body.includes("assert_source_owned(new.paper_source_id"),
    "논문이 내 것인지 확인하지 않는다",
  );
  assert.ok(
    body.includes("assert_project_owned(new.project_id"),
    "프로젝트가 내 것인지 확인하지 않는다",
  );
});

test("짝을 나중에 바꿀 수 없다", () => {
  // 바꿀 수 있으면 A 논문을 두고 적은 계획이 B 논문의 것이 된다.
  for (const column of ["paper_source_id", "project_id"]) {
    assert.ok(
      flat.includes(
        `new.${column} is distinct from old.${column} then raise exception 'paper_project_uses.${column}`,
      ),
      `${column}을 바꾸는 것을 막지 않는다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 목록 자체가 성하다
// -----------------------------------------------------------------------------

test("설계 문서 8.3절의 칸이 모두 있다", () => {
  /*
    8.3절은 paper_source_id, project_id, planned_section, usage_intent,
    interpretation, citation_plan, cautions, status를 적어두었다.

    앞의 둘은 누구의 계획인지를 가리키는 값이고 status는 고르는 값이라
    글로 받는 칸은 다섯이다.
  */
  assert.deepEqual(PROJECT_USE_COLUMNS, [
    "planned_section",
    "usage_intent",
    "interpretation",
    "citation_plan",
    "cautions",
  ]);
});

test("status는 글 칸으로 만들지 않는다", () => {
  // 고르는 값이다. 글로도 받으면 같은 물음에 답이 두 개가 된다.
  assert.ok(!PROJECT_USE_COLUMNS.includes("status"));
});

test("열 이름이 겹치지 않는다", () => {
  // 겹치면 한 칸이 다른 칸을 덮어쓴다. 적은 글이 조용히 사라진다.
  assert.equal(
    new Set(PROJECT_USE_COLUMNS).size,
    PROJECT_USE_COLUMNS.length,
  );
});

test("열 이름이 데이터베이스에 쓸 수 있는 모양이다", () => {
  for (const column of PROJECT_USE_COLUMNS) {
    assert.ok(
      /^[a-z][a-z0-9_]*$/.test(column),
      `${column}은 열 이름으로 쓸 수 없다`,
    );
  }
});

test("모든 항목에 이름표가 있다", () => {
  for (const field of PROJECT_USE_FIELDS) {
    assert.ok(field.label.trim().length > 0, `${field.column}에 이름표가 없다`);
    assert.ok(
      field.size === "short" || field.size === "long",
      `${field.column}의 크기가 이상하다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 상태값
// -----------------------------------------------------------------------------

test("아는 상태값만 통과한다", () => {
  assert.ok(isPaperUseStatus("planned"));
  assert.ok(isPaperUseStatus("used"));
  assert.ok(!isPaperUseStatus("dropped"));
  assert.ok(!isPaperUseStatus(""));
  assert.ok(!isPaperUseStatus(null));
  assert.ok(!isPaperUseStatus(undefined));
});

test("기본 상태가 아는 값이다", () => {
  assert.ok(isPaperUseStatus(DEFAULT_PAPER_USE_STATUS));
});

test("상태마다 우리말 이름이 있다", () => {
  for (const status of PAPER_USE_STATUSES) {
    assert.ok(getPaperUseStatusLabel(status.value).trim().length > 0);
  }

  assert.equal(getPaperUseStatusLabel("used"), "원고에 넣음");
});

// -----------------------------------------------------------------------------
// 채운 칸 세기
// -----------------------------------------------------------------------------

test("채운 칸을 센다", () => {
  assert.equal(
    countUseFilled({ planned_section: "이론적 배경", cautions: "표본이 작다" }),
    2,
  );
});

test("공백만 있는 칸과 없는 칸은 채운 것으로 보지 않는다", () => {
  assert.equal(countUseFilled({ planned_section: "  \n " }), 0);
  assert.equal(countUseFilled({}), 0);
  assert.equal(countUseFilled({ planned_section: null }), 0);
});

test("분석 서식의 칸은 세지 않는다", () => {
  // 셈법은 같은 함수를 쓰지만 세는 대상은 이 다섯 칸뿐이다.
  assert.equal(countUseFilled({ research_topic: "다른 서식의 칸" }), 0);
});
