/**
 * 논문 분석 서식 단위 검사. (설계 문서 8.2절)
 *
 * 여기서 지키는 것은 **한 곳에만 적는다**는 약속이다.
 *
 * 항목 목록이 두 곳에 있다. `analysis-fields.ts`와 마이그레이션이다.
 * 어긋나면 화면에는 칸이 보이는데 저장은 되지 않는다. 사용자는 길게 적어
 * 넣고 저장을 누른 뒤, 돌아와서 그 글이 사라진 것을 본다.
 *
 * 그 일이 생기지 않게 두 목록을 맞대어 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ANALYSIS_COLUMNS,
  ANALYSIS_FIELDS,
  ANALYSIS_SECTIONS,
  MAX_ANALYSIS_FIELD_LENGTH,
  countFilled,
} from "../src/lib/papers/analysis-fields.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

// -----------------------------------------------------------------------------
// 목록이 어긋나지 않는다
// -----------------------------------------------------------------------------

test("모든 항목에 데이터베이스 열이 있다", () => {
  for (const column of ANALYSIS_COLUMNS) {
    assert.ok(
      new RegExp(`\\n\\s+${column}\\s+text,`).test(migrations),
      `${column} 열이 마이그레이션에 없다. 화면에는 칸이 보이는데 저장되지 않는다`,
    );
  }
});

test("모든 항목에 길이 제약이 걸려 있다", () => {
  for (const column of ANALYSIS_COLUMNS) {
    assert.ok(
      migrations.includes(`'${column}'`),
      `${column}이 길이 제약 목록에 없다`,
    );
  }
});

test("관계로 다루는 둘은 열로 만들지 않는다", () => {
  /*
    설계 문서 8.2절에는 32개가 있는데 우리는 30개만 글로 받는다.

      관련 프로젝트      source_projects가 이미 한다
      연결되는 다른 자료  source_relations(14-D)가 맡는다

    글로 또 적게 두면 같은 물음에 답이 두 개가 된다.
    이 검사는 나중에 누가 "8.2절에 있는데 왜 없지" 하고 더하는 것을 막는다.
    더해야 한다면 이 검사도 함께 지우면서, 두 답을 어떻게 맞출지 정해야 한다.
  */
  for (const column of ["related_project", "related_sources"]) {
    assert.ok(
      !ANALYSIS_COLUMNS.includes(column),
      `${column}은 관계로 다룬다. 글 칸으로 만들지 않는다`,
    );
  }

  assert.equal(ANALYSIS_FIELDS.length, 30);
});

// -----------------------------------------------------------------------------
// 목록 자체가 성하다
// -----------------------------------------------------------------------------

test("설계 문서 8.2절의 다섯 묶음이 모두 있다", () => {
  assert.deepEqual(
    ANALYSIS_SECTIONS.map((section) => section.title),
    ["발견 맥락", "기본 이해", "연구 설계", "주요 내용", "나의 활용"],
  );
});

test("열 이름이 겹치지 않는다", () => {
  // 겹치면 한 칸이 다른 칸을 덮어쓴다. 적은 글이 조용히 사라진다.
  assert.equal(new Set(ANALYSIS_COLUMNS).size, ANALYSIS_COLUMNS.length);
});

test("열 이름이 데이터베이스에 쓸 수 있는 모양이다", () => {
  for (const column of ANALYSIS_COLUMNS) {
    assert.ok(
      /^[a-z][a-z0-9_]*$/.test(column),
      `${column}은 열 이름으로 쓸 수 없다`,
    );
  }
});

test("모든 항목에 이름표가 있다", () => {
  for (const field of ANALYSIS_FIELDS) {
    assert.ok(field.label.trim().length > 0, `${field.column}에 이름표가 없다`);
    assert.ok(
      field.size === "short" || field.size === "long",
      `${field.column}의 크기가 이상하다`,
    );
  }
});

test("묶음마다 항목이 있다", () => {
  for (const section of ANALYSIS_SECTIONS) {
    assert.ok(section.fields.length > 0, `${section.title}이 비어 있다`);
    assert.ok(section.purpose.trim().length > 0);
  }
});

// -----------------------------------------------------------------------------
// 채운 칸 세기
// -----------------------------------------------------------------------------

test("채운 칸을 센다", () => {
  const values = { discovery_path: "참고문헌에서", research_topic: "오류 분석" };

  assert.equal(countFilled(values), 2);
});

test("공백만 있는 칸은 채운 것으로 보지 않는다", () => {
  assert.equal(countFilled({ discovery_path: "   \n " }), 0);
});

test("없는 칸과 빈 칸을 같게 본다", () => {
  assert.equal(countFilled({}), 0);
  assert.equal(countFilled({ discovery_path: null }), 0);
  assert.equal(countFilled({ discovery_path: undefined }), 0);
});

test("묶음 안에서만 셀 수도 있다", () => {
  /*
    서른 칸을 한 번에 채우는 사람은 없다. 며칠에 걸쳐 돌아오는데,
    그때 "어디까지 했더라"를 다시 읽어 알아내야 하면 열기 싫어진다.
  */
  const context = ANALYSIS_SECTIONS[0];
  const values = { discovery_path: "검색", research_topic: "다른 묶음" };

  assert.equal(countFilled(values, context.fields), 1);
});

test("길이 상한이 정해져 있다", () => {
  assert.ok(MAX_ANALYSIS_FIELD_LENGTH > 0);
  // 마이그레이션의 제약과 같은 숫자여야 한다.
  assert.ok(migrations.includes(`<= ${MAX_ANALYSIS_FIELD_LENGTH}`));
});
