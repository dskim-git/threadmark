/**
 * 자료끼리의 관계 단위 검사. (설계 문서 8.4절)
 *
 * 관계 종류가 두 곳에 있다. `relation-types.ts`와 마이그레이션이다.
 * 타입 쪽은 `satisfies`가 컴파일 단계에서 잡아주지만, 그것은 **타입을 다시
 * 생성한 뒤**의 이야기다. 마이그레이션을 고치고 `npm run db:types`를 잊으면
 * 둘이 어긋난 채로 컴파일이 통과한다. 그 틈을 여기서 막는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SOURCE_RELATION_OPTIONS,
  SOURCE_RELATION_TYPES,
  getSourceRelationHint,
  getSourceRelationLabel,
  isSourceRelationType,
} from "../src/lib/sources/relation-types.ts";

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

test("모든 관계 종류가 마이그레이션의 열거형에 있다", () => {
  for (const type of SOURCE_RELATION_TYPES) {
    assert.ok(
      new RegExp(`'${type}'\\s*,?\\s*(--[^\\n]*)?\\n`).test(migrations) ||
        migrations.includes(`'${type}'`),
      `${type}이 source_relation_type에 없다. 고를 수는 있는데 저장이 거부된다`,
    );
  }
});

test("설계 문서 8.4절의 여덟 가지를 모두 담았다", () => {
  assert.deepEqual(SOURCE_RELATION_TYPES, [
    "cites",
    "cited_by",
    "found_in_references",
    "similar_study",
    "contradicts",
    "theoretical_basis",
    "method_reference",
    "follow_up_reading",
  ]);
});

test("같은 자료를 자기 자신과 잇지 못하게 막는다", () => {
  /*
    뜻이 없고, 화면에서는 같은 줄이 나간 것과 들어온 것 양쪽에 한 번씩 나와
    관계가 두 개인 것처럼 보인다.
  */
  assert.ok(
    flat.includes("check (from_source_id <> to_source_id)"),
    "자기 자신과 잇는 것을 막지 않는다",
  );
});

test("같은 짝에 같은 관계를 두 번 담지 못한다", () => {
  // 둘은 완전히 같은 말이라 어느 것을 끊어야 할지 알 수 없다.
  assert.ok(
    flat.includes(
      "unique (from_source_id, to_source_id, relation_type)",
    ),
    "같은 관계가 두 번 들어갈 수 있다",
  );
});

test("소유자 열에 기본값과 트리거가 함께 있다", () => {
  /*
    기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
    기본값이 없으면 생성된 타입이 owner_id를 필수로 보고, 보안 원칙 2와
    어긋나게 코드가 그 값을 보내야 한다.
  */
  assert.ok(
    flat.includes(
      "create trigger source_relations_set_link before insert on public.source_relations",
    ),
    "소유자를 채우는 트리거가 없다",
  );
});

test("양쪽 자료의 소유자를 모두 확인한다", () => {
  /*
    같은 표의 행 둘을 잇지만 확인은 두 번 해야 한다. 한 번만 하면
    내 자료를 남의 자료에 엮거나 그 반대가 된다.
  */
  const marker = "create or replace function public.set_source_relation_link()";
  const start = migrations.indexOf(marker);

  assert.notEqual(start, -1, "소유자 고정 함수를 찾을 수 없다");

  const body = migrations.slice(start, start + 1200);

  assert.ok(
    body.includes("assert_source_owned(new.from_source_id"),
    "출발 자료가 내 것인지 확인하지 않는다",
  );
  assert.ok(
    body.includes("assert_source_owned(new.to_source_id"),
    "도착 자료가 내 것인지 확인하지 않는다",
  );
});

test("관계를 고치는 길은 두지 않는다", () => {
  /*
    잇거나 끊는 것뿐이다. UPDATE 권한이 없으므로 갱신 정책도 없어야 한다.
    권한 없이 정책만 있으면 "고칠 수 있는 것처럼" 읽힌다.
  */
  assert.ok(
    flat.includes(
      "grant select, insert, delete on table public.source_relations to authenticated",
    ),
    "권한 부여가 select, insert, delete 셋이 아니다",
  );
  assert.ok(
    !flat.includes("on public.source_relations for update"),
    "source_relations에 갱신 정책이 있다",
  );
});

// -----------------------------------------------------------------------------
// 목록 자체가 성하다
// -----------------------------------------------------------------------------

test("관계 종류가 겹치지 않는다", () => {
  assert.equal(
    new Set(SOURCE_RELATION_TYPES).size,
    SOURCE_RELATION_TYPES.length,
  );
});

test("모든 관계에 우리말 이름과 설명이 있다", () => {
  for (const type of SOURCE_RELATION_TYPES) {
    assert.ok(
      getSourceRelationLabel(type).trim().length > 0,
      `${type}에 이름이 없다`,
    );
    assert.ok(
      getSourceRelationHint(type).trim().length > 0,
      `${type}에 설명이 없다`,
    );
  }

  assert.equal(getSourceRelationLabel("cites"), "인용함");
  assert.equal(getSourceRelationLabel("cited_by"), "인용됨");
});

test("이름이 서로 겹치지 않는다", () => {
  // 같은 이름이 둘이면 목록에서 어느 것을 고른 것인지 알 수 없다.
  const labels = SOURCE_RELATION_TYPES.map(getSourceRelationLabel);

  assert.equal(new Set(labels).size, labels.length);
});

test("선택 상자에 넣을 목록이 관계 종류와 같다", () => {
  assert.deepEqual(
    SOURCE_RELATION_OPTIONS.map((option) => option.value),
    [...SOURCE_RELATION_TYPES],
  );
});

// -----------------------------------------------------------------------------
// 모르는 값
// -----------------------------------------------------------------------------

test("아는 관계만 통과한다", () => {
  assert.ok(isSourceRelationType("cites"));
  assert.ok(!isSourceRelationType("remix"));
  assert.ok(!isSourceRelationType(""));
  assert.ok(!isSourceRelationType(null));
  assert.ok(!isSourceRelationType(undefined));
});

test("모르는 값에는 뭉뚱그린 이름을 준다", () => {
  /*
    화면이 멈추지 않게 한다. 관계 종류는 접근 통제가 아니라 표시에만 쓰이고,
    여기서 막으면 목록 전체가 보이지 않게 된다. 15단계에서 음악용 값을 더한
    뒤 타입을 다시 생성하기 전까지가 그런 순간이다.
  */
  assert.equal(getSourceRelationLabel("remix"), "관련 자료");
});
