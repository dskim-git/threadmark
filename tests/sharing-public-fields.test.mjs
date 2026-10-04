/**
 * 공개되는 프로젝트에서 나가도 되는 것의 목록을 조인다. (16-B.8 2차례)
 *
 * **이 목록이 뒤처지면 남의 글이 나간다.**
 *
 * 이 저장소는 같은 종류의 뒤처짐을 두 번 겪었다. `PROTECTED_TABLES`가
 * 그랬고 `PROFILE_SEARCH_TARGETS`가 그랬다. 그 둘은 뒤처지면 **덜
 * 나왔다.** 내려받은 파일에 표 하나가 비거나, 검색이 못 찾았다.
 *
 * **여기는 반대다.** 칸을 새로 만들고 이 목록에 적지 않으면, 그 칸이
 * 조용히 공개 쪽으로 넘어갈 수 있다. 그리고 한 번 나간 글은 되돌릴 수
 * 없다. 그래서 이 검사는 **양쪽에서 조인다.**
 *
 *   - 마이그레이션에 있는 칸이 목록에 없으면 실패한다
 *   - 목록에 있는 칸이 마이그레이션에 없으면 실패한다
 *   - `NEVER_PUBLIC`에 못 박은 칸이 `publish`에 들어오면 실패한다
 *   - 나가야 하는 것이 `publish`에서 빠지면 실패한다
 *
 * 마지막 줄이 있는 까닭. **막는 것만 보면 과잉 차단을 놓친다.**
 * (AGENTS.md 5절 6번) 아무것도 안 나가는 목록은 안전해 보이지만 기능이
 * 아무 일도 하지 않는 상태이고, 그것은 조용하다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  NEVER_PUBLIC,
  PUBLIC_PROJECT_FIELDS,
  PUBLIC_ROW_RULES,
  WITHHELD_TABLES,
  isPublicField,
  pickPublicFields,
  publicFieldsFor,
  rowMayBePublic,
  withheldTableReason,
} from "../src/lib/sharing/public-fields.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

// -----------------------------------------------------------------------------
// 마이그레이션에서 표와 칸을 뽑는다
// -----------------------------------------------------------------------------

/**
 * 손으로 적은 목록과 견주지 않고 **마이그레이션에서 직접 뽑는다.**
 * 손으로 적은 목록은 그 자체가 뒤처질 수 있는 또 하나의 자리다.
 * (`search-profile-targets.test.mjs`와 같은 생각이다)
 *
 * 뽑는 일에 함정이 셋 있었다. 전부 **조용히 적게 뽑히는** 쪽이라,
 * 뽑은 것이 그럴듯해 보여도 모르고 지나갈 수 있었다.
 *
 *   1. **마이그레이션 파일은 CRLF다.** JavaScript 정규식의 `.`은 `\r`을
 *      넘지 못하고 `$`는 글 전체의 끝만 가리킨다. 그래서 `--.*$`로 주석을
 *      지우려 하면 **한 줄도 지워지지 않는다.** 줄 끝을 먼저 맞춘다.
 *   2. **주석이 칸 뒤에 붙는다.** `content text,  -- 사용자가 쓴 내용`처럼
 *      쉼표 뒤에 주석이 온다. 주석을 지우지 않고 쉼표로 쪼개면 다음
 *      조각이 `--`로 시작해 **그 칸이 통째로 사라진다.** `original_text`가
 *      그렇게 빠졌다.
 *   3. **제약조건 안에 쉼표와 괄호가 있다.** `check (a is null or ...)`
 *      안의 쉼표로 쪼개면 괄호 셈이 어긋나 뒤따르는 칸들이 묶여 사라진다.
 *      그래서 **맨 바깥 쉼표로만** 쪼갠다.
 *
 * 세 번 다 "증상의 생김새가 아니라 말의 출처를 먼저 본다"로 찾았다.
 * (AGENTS.md 6절)
 */
function readMigrationTables() {
  let all = "";

  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    all += `${readFileSync(path.join(migrationsDir, name), "utf8")}\n`;
  }

  const sql = all
    // 1번 함정. 줄 끝을 먼저 맞춘다.
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // 2번 함정. 칸 뒤에 붙은 주석을 지운다.
    .replace(/--[^\n]*/g, "");

  /** 칸 정의가 아니라 제약조건을 여는 말들. */
  const notColumns = new Set([
    "constraint",
    "primary",
    "unique",
    "check",
    "foreign",
    "exclude",
    "like",
  ]);

  /** 여는 괄호에 짝이 맞는 닫는 괄호를 찾아 그 안을 돌려준다. */
  const bodyAt = (openParen) => {
    let depth = 0;

    for (let i = openParen; i < sql.length; i += 1) {
      if (sql[i] === "(") {
        depth += 1;
      } else if (sql[i] === ")") {
        depth -= 1;

        if (depth === 0) {
          return sql.slice(openParen + 1, i);
        }
      }
    }

    return null;
  };

  /** 3번 함정. 맨 바깥 쉼표로만 쪼갠다. */
  const topLevelParts = (body) => {
    const parts = [];
    let depth = 0;
    let current = "";

    for (const character of body) {
      if (character === "(") {
        depth += 1;
      }

      if (character === ")") {
        depth -= 1;
      }

      if (character === "," && depth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    parts.push(current);

    return parts;
  };

  const tables = new Map();

  for (const match of sql.matchAll(
    /create table if not exists public\.(\w+)\s*\(/g,
  )) {
    const body = bodyAt(match.index + match[0].length - 1);

    if (body === null) {
      continue;
    }

    const columns = [];

    for (const part of topLevelParts(body)) {
      const found = /^([a-z_][a-z0-9_]*)\s+\S/iu.exec(part.trim());

      if (found && !notColumns.has(found[1].toLowerCase())) {
        columns.push(found[1]);
      }
    }

    tables.set(match[1], columns);
  }

  // 나중에 더한 칸도 그 표의 칸이다.
  for (const match of sql.matchAll(
    /alter table public\.(\w+)\s+add column if not exists (\w+)/g,
  )) {
    const columns = tables.get(match[1]);

    if (columns && !columns.includes(match[2])) {
      columns.push(match[2]);
    }
  }

  return tables;
}

const migrationTables = readMigrationTables();

/**
 * `migration-invariants.test.mjs`의 `PROTECTED_TABLES`.
 *
 * 위에서 마이그레이션을 직접 뽑아 놓고도 이 목록을 또 읽는 까닭은,
 * **뽑는 쪽이 틀렸을 때 알아낼 방법이 필요하기 때문이다.** 정규식이
 * 어긋나 표 하나를 못 뽑으면, 그 표는 분류되지 않은 채로 조용히 통과한다.
 *
 * 두 목록이 서로를 견준다. (`account-export.test.mjs`와 같은 방식이다)
 */
function protectedTables() {
  const source = readFileSync(
    new URL("./migration-invariants.test.mjs", import.meta.url),
    "utf8",
  );

  const block = /const PROTECTED_TABLES = \[([\s\S]*?)\];/u.exec(source);

  assert.ok(block, "PROTECTED_TABLES를 찾지 못했다");

  return [...block[1].matchAll(/"([a-z_]+)"/gu)].map((match) => match[1]);
}

// -----------------------------------------------------------------------------
// 뽑는 쪽이 헛돌고 있지 않은가
// -----------------------------------------------------------------------------

/*
  **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절)

  아래 검사들은 뽑아낸 목록을 훑는다. 정규식이 어긋나 아무것도 못 뽑으면
  **빈 목록을 훑으면서 조용히 통과한다.** 검사가 있는데 아무 일도 안 하는
  상태가 가장 나쁘다. 09-24에 음악 바로가기 검사가 그렇게 되었다.
*/

test("마이그레이션에서 표를 뽑아냈다", () => {
  assert.ok(
    migrationTables.size >= 30,
    `마이그레이션에서 표를 못 뽑았다. 이 검사가 헛돌고 있다: ${migrationTables.size}개`,
  );
});

test("칸까지 빠짐없이 뽑아냈다", () => {
  /*
    **이 셋이 뽑는 쪽의 함정 셋을 하나씩 가리킨다.**

    `original_text`는 뒤에 주석이 붙은 칸이고(2번), `starred`는 나중에
    `alter table`로 더한 칸이고, `deleted_at`은 제약조건 뭉치 앞에 있는
    마지막 칸이다(3번). 하나라도 빠지면 뽑는 쪽이 고장 난 것이다.
  */
  const captures = migrationTables.get("captures");

  assert.ok(captures, "captures를 못 뽑았다");
  assert.ok(
    captures.includes("original_text"),
    `주석이 붙은 칸을 놓쳤다: ${captures.join(", ")}`,
  );
  assert.ok(
    captures.includes("starred"),
    `나중에 더한 칸을 놓쳤다: ${captures.join(", ")}`,
  );
  assert.ok(
    captures.includes("deleted_at"),
    `제약조건 앞의 마지막 칸을 놓쳤다: ${captures.join(", ")}`,
  );
  assert.ok(
    migrationTables.get("paper_profiles")?.includes("abstract"),
    "초록 칸을 놓쳤다. 이 칸을 못 보면 가장 중요한 검사가 헛돈다",
  );
});

test("뽑은 표가 PROTECTED_TABLES와 맞는다", () => {
  /*
    한쪽이 틀렸을 때 다른 쪽이 말해준다. 어긋나면 둘 중 하나가 뒤처진
    것이고, 어느 쪽이든 **이 파일의 검사가 덜 보고 있다**는 뜻이다.
  */
  const listed = protectedTables();
  const extracted = new Set(migrationTables.keys());

  const missing = listed.filter((table) => !extracted.has(table));

  assert.deepEqual(
    missing,
    [],
    `PROTECTED_TABLES에는 있는데 마이그레이션에서 못 뽑은 표다. 뽑는 쪽이 고장 났다: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 모든 표가 어느 쪽인지 정해져 있는가
// -----------------------------------------------------------------------------

test("앱의 모든 표가 공개 목록에 있거나, 빼는 까닭이 적혀 있다", () => {
  /*
    **정하지 않은 표가 남지 않게 한다.** 표를 새로 만들고 여기에 적지
    않으면 `publicFieldsFor`가 `null`을 돌려주어 아무것도 나가지 않는데,
    그것은 "안 나가기로 정한 것"이 아니라 "아무도 생각해보지 않은 것"이다.

    둘은 화면에서 똑같아 보인다. 어느 쪽인지를 목록에 적어 구분한다.
  */
  const published = new Set(PUBLIC_PROJECT_FIELDS.map((entry) => entry.table));

  const undecided = [...migrationTables.keys()].filter(
    (table) => !published.has(table) && !(table in WITHHELD_TABLES),
  );

  assert.deepEqual(
    undecided,
    [],
    `이 표를 공개할지 정하지 않았다. PUBLIC_PROJECT_FIELDS에 더하거나, 빼는 까닭을 WITHHELD_TABLES에 적는다: ${undecided.join(", ")}`,
  );
});

test("공개하는 표와 빼는 표가 겹치지 않는다", () => {
  const both = PUBLIC_PROJECT_FIELDS.map((entry) => entry.table).filter(
    (table) => table in WITHHELD_TABLES,
  );

  assert.deepEqual(
    both,
    [],
    `이 표가 공개 목록과 빼는 목록 양쪽에 있다. 어느 쪽이 맞는지 읽는 사람이 알 수 없다: ${both.join(", ")}`,
  );
});

test("목록에 없는 표를 공개하려 하지 않는다", () => {
  /*
    반대쪽도 조인다. 표 이름을 잘못 적거나 지운 표를 목록에 남겨두면
    그 줄은 아무 일도 하지 않으면서 "공개하기로 정했다"고 적혀 있게 된다.
  */
  const unknown = [
    ...PUBLIC_PROJECT_FIELDS.map((entry) => entry.table),
    ...Object.keys(WITHHELD_TABLES),
  ].filter((table) => !migrationTables.has(table));

  assert.deepEqual(
    unknown,
    [],
    `마이그레이션이 만들지 않은 표가 목록에 있다: ${unknown.join(", ")}`,
  );
});

test("같은 표를 두 번 적지 않는다", () => {
  const names = PUBLIC_PROJECT_FIELDS.map((entry) => entry.table);

  assert.equal(new Set(names).size, names.length);
});

// -----------------------------------------------------------------------------
// 모든 칸이 어느 쪽인지 정해져 있는가
// -----------------------------------------------------------------------------

test("공개하는 표의 모든 칸이 나가거나 안 나가기로 정해져 있다", () => {
  /*
    **이것이 이 파일에서 가장 중요한 검사다.**

    칸을 새로 만들면 여기서 멈춘다. 멈추지 않으면 그 칸은 "아직 아무도
    생각해보지 않은 칸"인 채로 공개 화면을 만드는 사람 손에 넘어간다.
    그 사람은 목록을 보고 "여기 없으니 새 칸이구나, 넣어야겠다"고 판단할
    근거가 없다.
  */
  const unclassified = [];

  for (const entry of PUBLIC_PROJECT_FIELDS) {
    const columns = migrationTables.get(entry.table) ?? [];
    const decided = new Set([...entry.publish, ...Object.keys(entry.withhold)]);

    for (const column of columns) {
      if (!decided.has(column)) {
        unclassified.push(`${entry.table}.${column}`);
      }
    }
  }

  assert.deepEqual(
    unclassified,
    [],
    `이 칸을 공개할지 정하지 않았다. publish에 더하거나, 안 나가는 까닭을 withhold에 적는다: ${unclassified.join(", ")}`,
  );
});

test("없는 칸을 공개하려 하지 않는다", () => {
  /*
    칸 이름을 잘못 적으면 조회가 실패하거나 값이 안 나온다. **덜 나오는
    것은 틀린 것처럼 보이지 않는다.** 여기서 붙잡는다.
  */
  const unknown = [];

  for (const entry of PUBLIC_PROJECT_FIELDS) {
    const columns = new Set(migrationTables.get(entry.table) ?? []);

    for (const column of [
      ...entry.publish,
      ...Object.keys(entry.withhold),
    ]) {
      if (!columns.has(column)) {
        unknown.push(`${entry.table}.${column}`);
      }
    }
  }

  assert.deepEqual(
    unknown,
    [],
    `마이그레이션에 없는 칸이 목록에 있다: ${unknown.join(", ")}`,
  );
});

test("한 칸이 나가면서 동시에 안 나갈 수는 없다", () => {
  const both = [];

  for (const entry of PUBLIC_PROJECT_FIELDS) {
    for (const column of entry.publish) {
      if (column in entry.withhold) {
        both.push(`${entry.table}.${column}`);
      }
    }
  }

  assert.deepEqual(
    both,
    [],
    `이 칸이 publish와 withhold 양쪽에 있다: ${both.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 까닭이 적혀 있는가
// -----------------------------------------------------------------------------

test("안 나가는 칸마다 까닭이 적혀 있다", () => {
  /*
    **까닭 없이 빠지면 그것은 빠뜨린 것이지 정한 것이 아니다.**
    (`EXCLUDED_TABLES`와 같은 생각이다)

    길이를 보는 까닭은 `없음`이나 `x` 같은 글자가 까닭 자리를 채우는 것을
    막으려는 것이다. 그런 글은 다음 사람에게 아무것도 알려주지 않는다.
  */
  for (const entry of PUBLIC_PROJECT_FIELDS) {
    for (const [column, reason] of Object.entries(entry.withhold)) {
      assert.equal(
        typeof reason,
        "string",
        `${entry.table}.${column}의 까닭이 글이 아니다`,
      );
      assert.ok(
        reason.trim().length >= 10,
        `${entry.table}.${column}을 왜 안 내보내는지 적혀 있지 않다: ${reason}`,
      );
    }
  }
});

test("통째로 빼는 표마다 까닭이 적혀 있다", () => {
  /*
    이 글은 공개 화면에도 쓰인다. 파일 자리에 "올린 사람만 볼 수
    있습니다"라고 적는 것이 그것이다. (16-B.3절) 그래서 **보는 사람이
    읽을 말**로 적는다.
  */
  for (const [table, reason] of Object.entries(WITHHELD_TABLES)) {
    assert.ok(
      typeof reason === "string" && reason.trim().length >= 10,
      `${table}을 왜 안 내보내는지 적혀 있지 않다: ${reason}`,
    );
  }
});

// -----------------------------------------------------------------------------
// 절대 나가면 안 되는 것 (못 박은 자리)
// -----------------------------------------------------------------------------

test("원문과 번역문과 초록은 어떤 경우에도 공개 목록에 없다", () => {
  /*
    **이 검사가 16-B 전체를 떠받친다.** 사용자가 정한 것이다.

    > 1차적인 원문이 공개되는 것이 가장 불안정한거잖아.

    약관도 이 줄에 기대어 쓰인다. "남의 글은 여전히 나가지 않습니다"가
    저작권 조항 전체를 떠받친다. (16-B.7절)

    `withhold`에 적어두는 것과 다르다. 그쪽은 "지금은 안 나간다"이고
    누군가 나중에 `publish`로 옮길 수 있다. 여기 있는 칸은 **옮기는 순간
    검사가 멈춘다.**
  */
  const banned = [
    ["captures", "original_text"],
    ["captures", "translated_text"],
    ["paper_profiles", "abstract"],
    ["sources", "thumbnail_url"],
    ["profiles", "email"],
    ["profiles", "display_name"],
  ];

  for (const [table, column] of banned) {
    assert.equal(
      isPublicField(table, column),
      false,
      `${table}.${column}이 공개 목록에 들어왔다. 남의 글이 나간다`,
    );
  }
});

test("올린 파일은 통째로 안 나간다", () => {
  // 2.3절이 금지한다. 파일 자리에는 "올린 사람만 볼 수 있습니다"라고 적는다.
  assert.equal(publicFieldsFor("source_files"), null);
  assert.ok(withheldTableReason("source_files"));
});

test("못 박은 칸이 공개 목록에 하나도 없다", () => {
  /*
    위의 검사는 블루프린트가 적은 칸들을 손으로 적어 두고 본다. 이 검사는
    `NEVER_PUBLIC` 목록 전체를 훑는다. **못을 더 박았을 때 그 못이 실제로
    박혔는지 보는 것이 이쪽이다.**
  */
  assert.ok(NEVER_PUBLIC.length >= 7, "못 박은 목록이 비었다. 이 검사가 헛돈다");

  const leaked = [];

  for (const field of NEVER_PUBLIC) {
    if (field.column === "*") {
      if (publicFieldsFor(field.table) !== null) {
        leaked.push(`${field.table}.*`);
      }

      continue;
    }

    if (isPublicField(field.table, field.column)) {
      leaked.push(`${field.table}.${field.column}`);
    }
  }

  assert.deepEqual(
    leaked,
    [],
    `절대 나가면 안 되는 칸이 공개 목록에 있다: ${leaked.join(", ")}`,
  );
});

test("못 박은 자리가 실제로 있는 칸이다", () => {
  /*
    없는 칸에 못을 박으면 **못 박은 것 같은 기분만 남는다.** 칸 이름을
    잘못 적었거나 이름이 바뀌었으면 그 못은 아무것도 막지 않는다.
  */
  const unknown = [];

  for (const field of NEVER_PUBLIC) {
    const columns = migrationTables.get(field.table);

    if (!columns) {
      unknown.push(`${field.table} (표가 없다)`);
      continue;
    }

    if (field.column !== "*" && !columns.includes(field.column)) {
      unknown.push(`${field.table}.${field.column}`);
    }
  }

  assert.deepEqual(
    unknown,
    [],
    `못 박은 자리가 마이그레이션에 없다. 이 못은 아무것도 막지 않는다: ${unknown.join(", ")}`,
  );
});

test("못 박은 자리마다 까닭이 적혀 있다", () => {
  for (const field of NEVER_PUBLIC) {
    assert.ok(
      field.reason.trim().length >= 5,
      `${field.table}.${field.column}을 왜 못 박았는지 적혀 있지 않다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 나가야 하는 것은 나가는가 (막는 것만 보지 않는다)
// -----------------------------------------------------------------------------

test("내가 쓴 글은 나간다", () => {
  /*
    **막는 것만 보면 과잉 차단을 놓친다.** (AGENTS.md 5절 6번)

    아무것도 안 나가는 목록은 이 파일의 다른 검사를 전부 통과한다. 그리고
    그 상태는 조용하다. 공개 화면이 비어 있어도 "아직 안 만들었나" 싶고,
    **덜 나오는 것은 틀린 것처럼 보이지 않는다.**

    여기 적힌 것이 16-B.3절의 `나가는 것` 표다. 그 표가 바뀌면 여기도
    바뀐다.
  */
  const mustPublish = [
    ["captures", "content"],
    ["sources", "title"],
    ["sources", "subtitle"],
    ["sources", "description"],
    ["book_profiles", "why_chosen"],
    ["book_profiles", "verdict"],
    ["project_outline_nodes", "title"],
    ["project_outline_nodes", "body"],
    ["project_node_items", "note"],
  ];

  for (const [table, column] of mustPublish) {
    assert.equal(
      isPublicField(table, column),
      true,
      `${table}.${column}이 공개 목록에서 빠졌다. 내가 쓴 글인데 안 나간다`,
    );
  }
});

test("참고문헌에 적는 값은 나간다", () => {
  // 16-B.3절이 `서지(저자·학술지·연도·DOI)`라고 적은 그 넷이다.
  const bibliography = [
    ["paper_profiles", "authors"],
    ["paper_profiles", "journal_name"],
    ["paper_profiles", "publication_year"],
    ["paper_profiles", "doi"],
  ];

  for (const [table, column] of bibliography) {
    assert.equal(
      isPublicField(table, column),
      true,
      `${table}.${column}이 공개 목록에서 빠졌다. 참고문헌에 적는 값이다`,
    );
  }
});

test("장소의 주소와 좌표는 나가지 않는다", () => {
  /*
    **이 검사는 2026-10-04에 뒤집혔다.** 그전에는 `장소의 주소와 좌표는
    나간다`였고, 16-B.3절이 그것을 `공개된 사실`로 분류했기 때문이다.

    **저작권으로 보면 그 분류가 맞다.** 주소는 누가 지은 글이 아니다.
    그런데 **기준이 하나 더 있었다.** 그 값은 카카오 로컬 API에서 받아온
    것이고, 카카오맵 API 팀이 데브톡에서 여러 차례 이렇게 답했다.

      "장소ID와 URL은 저장하여 활용 가능하며, 이 외 데이터는
       DB저장이 불가한 점 참고하여 이용 부탁드립니다"

    **한 값이 두 기준에 걸릴 수 있다는 것을 놓쳤다.** 저작권만 보고
    나가는 쪽에 두었다. (VERIFICATION 4-60절)

    저장 자체를 어떻게 할지는 카카오의 확정 답을 기다린다. 장소 기능의
    전제를 바꾸는 일이라 사용자가 정한다. **그 사이에 공개만 먼저
    막는다.** 공개는 저장보다 한 걸음 더 나간 일이고, 빼도 잃는 것이
    거의 없다.

    **검사를 뒤집을 때는 까닭을 남긴다.** 까닭 없이 뒤집힌 검사는, 다음
    사람이 "원래 나가야 하는 것인데 누가 잘못 막았나" 하고 되돌린다.
  */
  const columns = [
    "road_address",
    "address",
    "latitude",
    "longitude",
    "category",
    "postal_code",
    "phone",
  ];

  for (const column of columns) {
    assert.equal(
      isPublicField("place_profiles", column),
      false,
      `place_profiles.${column}이 공개 목록에 있다. 지도 제공자의 이용 정책을 확인하는 중이다`,
    );
  }

  // 표 전체가 빠졌으므로 까닭이 적혀 있어야 한다.
  assert.ok(
    withheldTableReason("place_profiles"),
    "장소를 공개 목록에서 뺐는데 까닭이 없다",
  );
});

test("장소를 담은 자료도 공개 페이지에 나온다", () => {
  /*
    **막는 것만 보면 과잉 차단을 놓친다.** (보안 원칙 6)

    장소의 주소를 뺐다고 장소 자료가 공개 페이지에서 사라지면 안 된다.
    나가는 것은 **자료 제목과 그 자료에 붙인 내 메모**다. 그쪽은 카카오에서
    받아온 값이 아니라 내가 쓴 것이다.
  */
  assert.equal(isPublicField("sources", "title"), true);
  assert.equal(isPublicField("captures", "content"), true);
});

test("공개하는 표마다 나가는 칸이 하나라도 있다", () => {
  /*
    나가는 칸이 없는 표가 공개 목록에 있으면, 조회만 늘고 얻는 것이 없다.
    그런 표는 `WITHHELD_TABLES`에 까닭과 함께 두는 쪽이 맞다.
  */
  for (const entry of PUBLIC_PROJECT_FIELDS) {
    assert.ok(
      entry.publish.length > 0,
      `${entry.table}에 나가는 칸이 없다. WITHHELD_TABLES로 옮긴다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 골라내는 함수
// -----------------------------------------------------------------------------

test("나가는 칸만 남긴다", () => {
  /*
    조회가 더 가져왔더라도 내보내기 전에 여기서 떨어진다. **두 겹으로
    막는다.** 한 겹이 틀렸을 때 남의 글이 나가는 자리라서다.
  */
  const picked = pickPublicFields("captures", {
    id: "abc-123",
    content: "내 메모",
    original_text: "남의 글",
    translated_text: "옮긴 글",
    deleted_at: null,
  });

  assert.deepEqual(picked, { content: "내 메모" });
});

test("원문이 섞여 들어와도 떨어진다", () => {
  const picked = pickPublicFields("paper_profiles", {
    journal_name: "Nature",
    abstract: "밖에서 받아온 남의 글",
  });

  assert.ok(!("abstract" in picked));
  assert.equal(picked.journal_name, "Nature");
});

test("모르는 표는 아무것도 내보내지 않는다", () => {
  /*
    **모르면 거부한다.** (AGENTS.md 5절 7번) 표를 새로 만들고 목록에
    적지 않으면 아무것도 안 나가고, 그 상태는 위의 검사가 붙잡는다.
  */
  assert.deepEqual(pickPublicFields("user_roles", { role: "admin" }), {});
  assert.deepEqual(pickPublicFields("없는_표", { a: 1 }), {});
  assert.equal(publicFieldsFor("없는_표"), null);
  assert.equal(isPublicField("없는_표", "a"), false);
});

test("담기지 않은 칸은 빈 값으로 지어내지 않는다", () => {
  /*
    줄에 없는 칸을 `undefined`로 채워 넣으면, 보는 쪽에서 "값이 비었다"와
    "가져오지 않았다"를 구분할 수 없다. **지어내지 않는다.**
  */
  const picked = pickPublicFields("sources", { title: "제목" });

  assert.deepEqual(Object.keys(picked), ["title"]);
});

// -----------------------------------------------------------------------------
// 어느 줄이 나가는가 (칸 고르기로 안 되는 자리)
// -----------------------------------------------------------------------------

test("기계가 쓴 기록은 줄째로 안 나간다", () => {
  /*
    **칸을 빼는 것으로는 모자랐다.** `ai_generated`를 안 내보내도 그 글은
    나가고, 다른 메모들과 나란히 놓이면 **내가 생각한 것이라는 얼굴로**
    나간다. 16-B는 "내가 생각한 것"을 공유하는 기능이다.
  */
  assert.equal(
    rowMayBePublic("captures", {
      content: "기계가 쓴 요약",
      ai_generated: true,
      deleted_at: null,
    }),
    false,
  );

  assert.equal(
    rowMayBePublic("captures", {
      content: "내가 쓴 메모",
      ai_generated: false,
      deleted_at: null,
    }),
    true,
  );
});

test("지운 것은 줄째로 안 나간다", () => {
  /*
    이 앱의 삭제는 표시만 한다. **`deleted_at`을 안 내보내는 것은 아무것도
    막지 않는다.** 지운 글이 공개 페이지에 남아 있으면 지운 사람은 그것을
    모른다.
  */
  for (const table of ["captures", "sources", "projects"]) {
    assert.equal(
      rowMayBePublic(table, { deleted_at: "2026-10-04", ai_generated: false }),
      false,
      `${table}의 지운 줄이 나간다`,
    );
  }
});

test("조건을 보는 칸이 없으면 거부한다", () => {
  /*
    **모르면 거부한다.** (AGENTS.md 5절 7번) 조회가 `ai_generated`를
    안 가져왔다면, 그 값이 무엇인지 모르는 것이다. 모르는 채로 "괜찮다"고
    판단하면 기계가 쓴 글이 나간다.
  */
  assert.equal(rowMayBePublic("captures", { content: "메모" }), false);
  assert.equal(
    rowMayBePublic("captures", { content: "메모", ai_generated: false }),
    false,
    "deleted_at을 안 가져왔는데 통과했다",
  );
});

test("조건이 걸리지 않는 표는 그대로 나간다", () => {
  // 과하게 막지 않는다. 조건이 없는 표에 없는 조건을 지어내지 않는다.
  assert.equal(rowMayBePublic("paper_profiles", { doi: "10.1/x" }), true);
});

test("줄을 가리는 칸은 실제로 있는 칸이다", () => {
  /*
    없는 칸으로 조건을 걸면 `모르면 거부한다`에 걸려 **아무 줄도 안
    나간다.** 오류는 나지 않고 공개 페이지만 빈다.
  */
  assert.ok(PUBLIC_ROW_RULES.length >= 4, "줄 조건이 비었다. 이 검사가 헛돈다");

  const unknown = PUBLIC_ROW_RULES.filter((rule) => {
    const columns = migrationTables.get(rule.table);

    return !columns || !columns.includes(rule.column);
  }).map((rule) => `${rule.table}.${rule.column}`);

  assert.deepEqual(
    unknown,
    [],
    `줄을 가리는 칸이 마이그레이션에 없다: ${unknown.join(", ")}`,
  );
});

test("줄을 가리는 칸은 나가는 칸이 아니다", () => {
  /*
    **가리는 데 쓰는 값은 나가는 값이 아니다.** `deleted_at`이나
    `ai_generated`가 공개 쪽으로 넘어가면, 걸러낸다고 해놓고 그 사실을
    함께 내보내는 셈이 된다.
  */
  const leaked = PUBLIC_ROW_RULES.filter((rule) =>
    isPublicField(rule.table, rule.column),
  ).map((rule) => `${rule.table}.${rule.column}`);

  assert.deepEqual(
    leaked,
    [],
    `줄을 가리는 칸이 공개 목록에 있다: ${leaked.join(", ")}`,
  );
});

test("줄 조건마다 까닭이 적혀 있다", () => {
  // 공개 화면이 "왜 안 보이는지" 적을 때 쓸 말이다.
  for (const rule of PUBLIC_ROW_RULES) {
    assert.ok(
      rule.reason.trim().length >= 5,
      `${rule.table}.${rule.column} 조건의 까닭이 없다`,
    );
  }
});

test("통째로 빼는 표의 까닭을 읽을 수 있다", () => {
  // 공개 화면이 파일 자리에 적을 말이다. (16-B.3절)
  assert.ok(withheldTableReason("source_files")?.includes("올린 사람만"));
  assert.equal(withheldTableReason("captures"), null);
});
