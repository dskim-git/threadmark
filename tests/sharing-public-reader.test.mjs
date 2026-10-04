/**
 * 읽는 문이 목록을 따라오는가. (16-B.8 4차례)
 *
 * **2차례에서 목록을 한 곳에 적은 까닭이 이 검사다.**
 *
 * 목록(`public-fields.ts`)과 문(`public_project()`)은 다른 말로 쓰여 있다.
 * 하나는 TypeScript이고 하나는 SQL이다. **둘이 어긋나도 아무 소리가 나지
 * 않는다.** 목록에 "나간다"고 적힌 칸을 문이 안 내보내면 공개 페이지가
 * 조용히 비고, 반대로 목록에 없는 칸을 문이 내보내면 **남의 글이 나간다.**
 *
 * 그래서 양쪽에서 조인다.
 *
 *   - 나가야 하는 칸이 문에 없으면 실패한다
 *   - **못 박은 칸이 문에 있으면 실패한다**
 *   - `select *`를 쓰면 실패한다
 *
 * 이 검사가 보는 것의 한계
 *   SQL 글에서 칸 이름을 **찾는 것**뿐이다. 그 칸이 어느 표의 것인지까지는
 *   가리지 못한다. `title`은 자료에도 뼈대에도 있다.
 *
 *   **그래도 가장 중요한 쪽은 정확하게 잡는다.** 못 박은 칸들
 *   (`original_text`, `translated_text`, `abstract`, `thumbnail_url`,
 *   `email`, `display_name`)은 **다른 어느 표에도 같은 이름이 없다.**
 *   그 이름이 이 파일에 나타나면 그것은 그 칸이다.
 *
 *   실제로 막히는지는 `003`이 역할을 바꿔 눌러본다. 이 파일은 그 전에
 *   빠뜨림을 잡는다.
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
  withheldTableReason,
} from "../src/lib/sharing/public-fields.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

/**
 * 이 함수를 정의하는 마이그레이션 중 **가장 나중 것.**
 *
 * **파일 이름을 적어두지 않는다.** 마이그레이션은 올린 뒤에 고칠 수 없으므로,
 * 함수를 고치는 일은 `create or replace`를 담은 새 파일을 더하는 것이 된다.
 * 그러면 같은 함수가 여러 파일에 있고, **옛 글을 보는 검사는 거짓말을 한다.**
 *
 * 실제로 그 일이 있었다. `pg_catalog.coalesce`를 쓴 첫 판이 003에서 멈췄고
 * (`COALESCE`는 함수가 아니라 SQL 구문이다) 고친 판을 새 파일로 올렸다.
 * 이 검사가 첫 파일을 가리키고 있었으면 **고친 뒤에도 옛 글을 보며
 * 통과했을 것이다.**
 *
 * 파일 이름 순서가 곧 적용 순서다. 마지막 것이 지금 데이터베이스에 있는
 * 것이다.
 */
function latestReaderMigration() {
  const dir = path.join(repoRoot, "supabase", "migrations");

  const defining = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      readFileSync(path.join(dir, name), "utf8").includes(
        "create or replace function public.public_project",
      ),
    );

  assert.ok(
    defining.length > 0,
    "읽는 문을 정의하는 마이그레이션이 없다. 이 파일의 검사가 전부 헛돈다",
  );

  return readFileSync(path.join(dir, defining[defining.length - 1]), "utf8")
    .replace(/\r\n/g, "\n");
}

const reader = latestReaderMigration();

/**
 * 주석을 뺀 SQL만.
 *
 * **이것이 없으면 이 파일의 검사가 거꾸로 돈다.** 이 마이그레이션의 주석에는
 * `초록은 없다`, `포스터는 없다`처럼 **안 나가는 칸 이름이 적혀 있다.**
 * 주석을 함께 보면 "못 박은 칸이 문에 있다"가 늘 참이 되어, 통과할 수 없는
 * 검사가 된다.
 *
 * 거꾸로도 위험하다. 나가야 하는 칸이 **주석에만** 있어도 통과해버린다.
 */
const sql = reader
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("읽는 문을 읽어냈다", () => {
  /*
    목록이 비는 날을 생각해 둔다. (AGENTS.md 6절) 주석을 떼다가 본문까지
    날아가면 **빈 글을 훑으면서 조용히 통과한다.**
  */
  assert.ok(
    sql.includes("create or replace function public.public_project"),
    "읽는 문을 못 읽었다. 이 파일의 검사가 전부 헛돈다",
  );
  assert.ok(
    sql.length > 2000,
    `주석을 떼고 남은 SQL이 너무 짧다. 본문까지 지워졌다: ${sql.length}자`,
  );
});

// -----------------------------------------------------------------------------
// 나가야 하는 것이 나가는가
// -----------------------------------------------------------------------------

test("목록이 나간다고 적은 칸이 문에 다 있다", () => {
  /*
    **막는 것만 보면 과잉 차단을 놓친다.** (보안 원칙 6) 아무것도 안
    내보내는 문은 아래의 모든 검사를 통과하는데, 그 상태는 조용하다.
    공개 페이지가 비어 있어도 "아직 안 만들었나" 싶을 뿐이다.
  */
  const missing = [];

  for (const entry of PUBLIC_PROJECT_FIELDS) {
    for (const column of entry.publish) {
      /*
        `type`은 너무 흔한 글자라 이 방식으로 볼 수 없다. `media_kind`나
        `project_type` 안에도 들어 있다. 자료 유형이 나가는지는 003이
        실제 값으로 확인한다.
      */
      if (column === "type") {
        continue;
      }

      if (!new RegExp(`\\b${column}\\b`, "u").test(sql)) {
        missing.push(`${entry.table}.${column}`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `목록은 나간다고 적었는데 읽는 문이 안 내보낸다. 공개 페이지가 조용히 빈다: ${missing.join(", ")}`,
  );
});

test("자료 유형도 나간다", () => {
  // 위에서 건너뛴 `sources.type`이다. 읽는 쪽에서 글자로 확인한다.
  assert.match(
    sql,
    /'type',\s*s\.type/u,
    "자료가 논문인지 책인지가 안 나간다. 무엇에 대한 메모인지 알 수 없다",
  );
});

// -----------------------------------------------------------------------------
// 나가면 안 되는 것이 안 나가는가
// -----------------------------------------------------------------------------

test("못 박은 칸이 문에 하나도 없다", () => {
  /*
    **이 검사가 16-B 전체를 떠받친다.**

    > 1차적인 원문이 공개되는 것이 가장 불안정한거잖아.

    여기 걸리는 칸들은 다른 어느 표에도 같은 이름이 없다. 이 파일에 그
    이름이 나타나면 그것은 그 칸이다.
  */
  assert.ok(NEVER_PUBLIC.length >= 8, "못 박은 목록이 비었다. 이 검사가 헛돈다");

  const leaked = [];

  for (const field of NEVER_PUBLIC) {
    if (field.column === "*") {
      /*
        표 전체가 못 박힌 경우. **이름조차 나오면 안 된다.**

        단, `doorMayRead`가 참인 표는 뺀다. **`나가지 않는다`와 `닿지도
        않는다`는 다르다.** 문은 열쇠로 프로젝트를 찾아야 하므로 열쇠
        표를 읽는다. 그 표에서 값이 나가지 않는 것은 `열쇠를 돌려주지
        않는다` 검사가 본다.

        이 구분을 목록에 적어 두었다. 검사 안에 예외를 적으면 **그 예외가
        목록과 떨어져 뒤처진다.**
      */
      if (field.doorMayRead) {
        continue;
      }

      if (new RegExp(`\\b${field.table}\\b`, "u").test(sql)) {
        leaked.push(`${field.table} (표 전체)`);
      }

      continue;
    }

    if (new RegExp(`\\b${field.column}\\b`, "u").test(sql)) {
      leaked.push(`${field.table}.${field.column}`);
    }
  }

  assert.deepEqual(
    leaked,
    [],
    `절대 나가면 안 되는 것이 읽는 문에 있다. 남의 글이 나간다: ${leaked.join(", ")}`,
  );
});

test("원문과 번역문과 초록은 이름조차 나오지 않는다", () => {
  /*
    위의 검사가 목록을 훑는다. 이 검사는 **손으로 적어 둔다.**

    목록에서 누군가 한 줄을 지우면 위의 검사는 그 칸을 더 이상 보지 않고
    조용히 통과한다. **목록을 지우는 것으로 검사를 끌 수 있으면 안 된다.**
    약관이 이 줄에 기대어 쓰인다. (16-B.7절)
  */
  for (const column of [
    "original_text",
    "translated_text",
    "abstract",
    "thumbnail_url",
    "source_files",
    "display_name",
  ]) {
    assert.ok(
      !new RegExp(`\\b${column}\\b`, "u").test(sql),
      `읽는 문에 ${column}이 있다. 남의 글이 나간다`,
    );
  }
});

test("열쇠를 돌려주지 않는다", () => {
  /*
    문은 열쇠 표를 **읽어야 한다.** 그 표로 프로젝트를 찾기 때문이다.
    그러나 열쇠 값을 돌려주면, 공개 페이지를 본 사람이 **다른 프로젝트를
    여는 열쇠**를 손에 넣을 수 있는 모양이 된다.

    돌려주는 jsonb에 `token`이 들어가지 않는지 본다.
  */
  assert.ok(
    sql.includes("public.project_public_links"),
    "열쇠 표를 보지 않는다. 그러면 열쇠로 프로젝트를 찾을 수 없다",
  );

  assert.ok(
    !/'token'/u.test(sql),
    "돌려주는 값에 열쇠가 들어 있다",
  );

  /*
    **읽어도 되는 표는 하나뿐이다.** `doorMayRead`가 참인 표가 늘어나면
    여기서 멈춘다. 그 표를 문이 읽어도 되는지는 **사람이 한 번 더 보고
    정해야 하는 일**이다. 자동으로 넘어가게 두지 않는다.
  */
  const mayRead = NEVER_PUBLIC.filter((field) => field.doorMayRead);

  assert.deepEqual(
    mayRead.map((field) => field.table),
    ["project_public_links"],
    "문이 읽어도 되는 표가 늘었다. 그 표의 값이 나가지 않는지 손으로 확인하고 이 검사를 고친다",
  );
});

test("공개 목록에서 뺀 표를 문이 더 읽지 않는다", () => {
  /*
    **목록에서 빼는 것만으로는 문이 멈추지 않는다.**

    2026-10-04에 장소를 공개 목록에서 뺐다. 그때 `public-fields.ts`만
    고치면 문은 여전히 주소와 좌표를 돌려주고, 화면 쪽(`public-payload.ts`)이
    버리는 것에만 기대게 된다. **한 겹으로 버티는 상태**다.

    그리고 그 상태는 조용하다. 기존 검사들은
      - `publish ⊆ SQL`  → 뺀 칸은 더 이상 요구하지 않으니 통과
      - `NEVER_PUBLIC ∩ SQL = ∅` → 장소는 못 박은 자리가 아니니 통과
    둘 다 통과한다. **목록과 문이 갈라졌는데 아무 소리가 나지 않는다.**

    그래서 뺀 표를 문이 더 읽지 않는지 본다.

    **왜 `WITHHELD_TABLES` 전체를 훑지 않는가.** 그 목록에는 문이 읽어야
    하는 표도 있다. 열쇠 표로 프로젝트를 찾고, 묶는 표로 무엇이 이
    프로젝트에 속하는지 가린다. `나가지 않는다`와 `닿지도 않는다`는
    다르다. (`NEVER_PUBLIC`의 `doorMayRead`와 같은 구분이다)

    장소는 **닿지도 않는 쪽**이다. 주소를 안 내보낸다면 문이 그 표를 읽을
    일이 없다.
  */
  assert.ok(
    withheldTableReason("place_profiles"),
    "장소가 공개 목록에서 빠져 있지 않다. 이 검사가 헛돈다",
  );

  assert.ok(
    !sql.includes("public.place_profiles"),
    "공개 목록에서 뺀 장소를 문이 아직 읽는다. 지도 제공자의 이용 정책을 확인하는 중이다",
  );
});

test("select *를 쓰지 않는다", () => {
  /*
    **칸을 새로 만들면 그 칸이 조용히 공개된다.** 이 파일에서 가장 쉽게
    생기는 구멍이고, 생기면 아무 소리가 나지 않는다.
  */
  assert.ok(
    !/select\s+\*/iu.test(sql),
    "읽는 문에 select *가 있다. 칸을 새로 만들면 그 칸이 조용히 공개된다",
  );
});

// -----------------------------------------------------------------------------
// 어느 줄이 나가는가
// -----------------------------------------------------------------------------

test("줄 조건이 문에 실제로 걸려 있다", () => {
  /*
    `PUBLIC_ROW_RULES`는 적어둔 약속이고, **거는 자리가 이 문이다.**
    적어두고 걸지 않으면 기계가 쓴 글과 지운 글이 나간다.
  */
  assert.ok(PUBLIC_ROW_RULES.length >= 4, "줄 조건이 비었다. 이 검사가 헛돈다");

  /*
    기계가 쓴 기록.

    **한 번 나오는지로는 모자랐다.** 처음에 이 검사를 `ai_generated = false`가
    있는지로 썼다. 그러고 나서 일부러 두 곳에서 지워 보니 **그대로
    통과했다.** 남은 한 곳이 정규식을 만족시켰다.

    기록이 공개 페이지로 오는 길이 **셋**이다.

      1. 자료에 붙은 메모 (`capture_rows`)
      2. 자료에 붙지 않은 빠른 메모 (`notes`)
      3. 뼈대 자리에 놓아둔 기록 (`outline`의 `capture_content`)

    **한 길만 막으면 두 길로 나간다.** 그리고 나가는 쪽은 조용하다.
    길마다 걸려 있는지 세어 본다.
  */
  const aiChecks = [...sql.matchAll(/ai_generated\s*=\s*false/gu)];

  assert.ok(
    aiChecks.length >= 3,
    `기계가 쓴 기록을 걸러내는 자리가 ${aiChecks.length}곳뿐이다. 기록이 오는 길이 셋이라 셋 다 막아야 한다`,
  );

  /*
    지운 것. 자료·기록·프로젝트와 위의 세 길을 모두 본다.

    같은 까닭으로 개수를 센다. 한 곳만 막으면 나머지로 나간다.
  */
  const deletedChecks = [...sql.matchAll(/deleted_at is null/gu)];

  assert.ok(
    deletedChecks.length >= 6,
    `지운 것을 걸러내는 자리가 ${deletedChecks.length}곳뿐이다. 자료·기록·프로젝트와 기록이 오는 세 길을 다 봐야 한다`,
  );
});

test("살아 있는 열쇠만 문을 연다", () => {
  // 끄면 그 자리에서 죽는다. (16-B.6절)
  assert.match(
    sql,
    /l\.revoked_at is null/u,
    "끈 열쇠로도 열린다. 16-B.6절이 금지한다",
  );
});

test("틀린 열쇠에는 아무것도 돌려주지 않는다", () => {
  /*
    **모르면 거부한다.** (보안 원칙 7) 그리고 어느 경우인지 구분해 알리지
    않는다. 틀린 열쇠인지 끈 열쇠인지 지운 프로젝트인지 알려주면, 열쇠를
    맞혀 보는 사람에게 "거의 맞았다"를 알려주는 셈이다. (보안 원칙 9)
  */
  assert.match(
    sql,
    /if v_project is null then\s*\n\s*return null;/u,
    "프로젝트를 못 찾았을 때 null을 돌려주지 않는다",
  );
});

// -----------------------------------------------------------------------------
// 문을 여는 권한
// -----------------------------------------------------------------------------

test("비로그인도 문을 열 수 있다", () => {
  // 16-B.5절. 링크를 아는 사람이면 누구나, 로그인하지 않아도.
  assert.match(
    sql,
    /grant execute on function public\.public_project\(text\)\s*\n?\s*to anon/u,
    "비로그인이 공개 페이지를 열 수 없다",
  );
});

test("문에만 권한을 주고 표에는 주지 않는다", () => {
  /*
    **공개 기능에서 가장 조용한 위험이다.** anon에게 표 권한을 주면
    공개된 프로젝트를 전부 찾아낼 수 있고, 열쇠를 따로 만든 뜻이 사라진다.
    001의 검사 17이 그것을 0으로 지킨다.
  */
  const tableGrants = [
    ...sql.matchAll(/grant[^;]*on table[^;]*;/gu),
  ].filter((match) => /\banon\b/u.test(match[0]));

  assert.deepEqual(
    tableGrants.map((match) => match[0].replace(/\s+/gu, " ")),
    [],
    "읽는 문 마이그레이션이 anon에게 표 권한을 준다",
  );

  // public에서 먼저 거둔다. 기본 권한에 기대지 않는다.
  assert.match(
    sql,
    /revoke all on function public\.public_project\(text\) from public/u,
  );
});

test("search_path를 비우고 돈다", () => {
  /*
    `SECURITY DEFINER` 함수다. **소유자 권한으로 돌아 RLS를 우회한다.**
    `search_path`를 고정하지 않으면 남이 만든 스키마의 함수가 불릴 수 있다.
    001의 검사 10이 같은 것을 본다.
  */
  assert.match(
    sql,
    /create or replace function public\.public_project\(p_token text\)[\s\S]{0,200}set search_path = ''/u,
    "search_path를 고정하지 않았다",
  );
});

test("고리에 빠지지 않는다", () => {
  /*
    뼈대를 거슬러 올라가는 재귀 질의다. 고리가 생기면 **영영 돈다.**
    로그인 없이 부를 수 있는 함수라 그것이 곧 서비스를 멈추는 길이 된다.

    `guard_project_outline_node_move`가 고리를 막지만 **그 한 겹에만
    기대지 않는다.**
  */
  assert.match(sql, /with recursive/u, "재귀 질의가 with recursive가 아니다");
  assert.match(
    sql,
    /t\.depth\s*<\s*\d+/u,
    "재귀에 걸음 한계가 없다. 고리가 생기면 영영 돈다",
  );
});

// -----------------------------------------------------------------------------
// 빠뜨릴 뻔한 자리
// -----------------------------------------------------------------------------

test("자료에 붙지 않은 메모도 나간다", () => {
  /*
    **처음에 통째로 빠뜨렸던 자리다.**

    이 앱은 "자료 없이도 기록할 수 있다"고 정해 두었다. (6.2절) 그런 빠른
    메모는 `capture_projects`로 프로젝트에 바로 붙는다. 자료를 타고 모으면
    **그 메모들이 걸릴 자리가 없다.**

    오류도 나지 않고 공개 페이지에서 그냥 안 보인다. **덜 나오는 것은
    틀린 것처럼 보이지 않는다.**
  */
  assert.ok(
    sql.includes("public.capture_projects"),
    "자료에 붙지 않은 메모를 모으지 않는다. 빠른 메모가 통째로 빠진다",
  );

  assert.match(
    sql,
    /c\.source_id is null/u,
    "자료가 없는 기록을 찾는 조건이 없다",
  );
});

// -----------------------------------------------------------------------------
// 003이 따라왔는가
// -----------------------------------------------------------------------------

test("003이 열린 문으로 실제로 눌러본다", () => {
  /*
    **이 파일이 보는 것과 003이 보는 것은 다르다.**

    이 파일은 SQL 글에서 칸 이름을 찾는다. 003은 **글자를 심어놓고 열쇠로
    열어 돌아온 글에서 그 글자를 찾는다.** 칸 이름이 안 보여도 값이 섞여
    나올 수 있고, 그것은 글로는 알 수 없다.

    그래서 둘 다 필요하다. 이 파일은 빠뜨림을 빨리 잡고, 003은 실제로
    막히는지 본다.
  */
  const isolation = readFileSync(
    path.join(repoRoot, "supabase", "verify", "003_rls_isolation_test.sql"),
    "utf8",
  );

  for (const number of [139, 140, 141, 142, 143]) {
    assert.ok(
      isolation.includes(`검사 ${number} 실패`),
      `003에 검사 ${number}이 없다`,
    );
  }

  // 여는 쪽. 막는 것만 보면 과잉 차단을 놓친다.
  assert.ok(
    isolation.includes("139. 열쇠가 맞으면 비로그인도 공개된 것을 읽는다"),
    "비로그인이 실제로 읽을 수 있는지 보는 검사가 없다",
  );
  assert.ok(
    isolation.includes("143. 자료에 붙지 않은 메모도 나간다"),
    "빠른 메모가 나오는지 보는 검사가 없다",
  );

  /*
    **가장 중요한 검사다.** 심어둔 원문이 돌아온 글에 섞여 있는지 본다.
    약관이 이 줄에 기대어 쓰인다. (16-B.7절)
  */
  assert.ok(
    isolation.includes("원문나오면안됨"),
    "원문이 실제로 안 나오는지 값으로 확인하는 검사가 없다",
  );
});

test("뼈대는 번호가 아니라 모양으로 나간다", () => {
  /*
    `parent_id`를 돌려주면 보는 쪽이 트리를 세워야 하고, 번호가 밖으로
    나간다. **나가는 것은 세워진 모양이지 번호가 아니다.**
  */
  assert.match(sql, /'depth'/u, "깊이를 안 내보내면 뼈대를 세울 수 없다");
  assert.ok(
    !/'parent_id'/u.test(sql),
    "돌려주는 값에 parent_id가 있다",
  );
  assert.ok(!/'id'/u.test(sql), "돌려주는 값에 번호가 있다");
});
