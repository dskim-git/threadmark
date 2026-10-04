/**
 * 마이그레이션 보안 불변조건 검사.
 *
 * 로컬에 Docker와 PostgreSQL이 없어 SQL을 실행해 검증할 수 없으므로,
 * 실수로 무너지기 쉬운 보안 속성을 파일 내용에서 정적으로 확인한다.
 * 데이터베이스 동작 검증을 대신하지는 않는다. (8단계 권한·승인 흐름 테스트에서 수행)
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrationFiles = readdirSync(migrationsDir).filter((name) =>
  name.endsWith(".sql"),
);

const sql = migrationFiles
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

/** 공백을 한 칸으로 줄여 줄바꿈에 영향받지 않게 만든 비교용 텍스트. */
const flat = sql.replace(/\s+/g, " ").toLowerCase();

/**
 * RLS가 반드시 켜져 있어야 하는 테이블.
 *
 * 이 목록은 앱이 만드는 표 **전부**다. 처음에는 인증 관련 네 개만 있었는데,
 * 그 뒤로 표가 늘어나는 동안 목록이 따라오지 않아 실제로는 새 표가 검사 밖에
 * 있었다. 표를 하나 만들 때 RLS를 켜는 것을 잊으면 아무도 말해주지 않는 상태였다.
 *
 * 표를 새로 만들면 여기에 이름을 더한다. (docs/VERIFICATION.md 6절)
 */
const PROTECTED_TABLES = [
  "profiles",
  "user_roles",
  "app_settings",
  "admin_audit_logs",
  "sources",
  "captures",
  "projects",
  "source_projects",
  "capture_projects",
  "source_files",
  "paper_profiles",
  "paper_analyses",
  "paper_project_uses",
  "source_relations",
  "google_drive_connections",
  /*
    아래 일곱은 2026-09-24에 더했다. **이 목록이 뒤처져 있었다.**

    태그·웹사이트·음악 표를 만들 때 이 목록에 넣는 것을 잊었고, 그동안
    그 표들은 "RLS가 켜져 있는가"를 아무도 확인하지 않은 채 있었다.
    실제로는 켜져 있었지만, 확인하지 않은 것과 켜져 있는 것은 다르다.

    **표를 새로 만들면 여기에 이름을 더한다.** 이 줄을 읽고 있다면 그 일을
    지금 한다.
  */
  "tags",
  "source_tags",
  "capture_tags",
  "website_profiles",
  "music_profiles",
  "music_provider_links",
  "book_profiles",
  "project_outline_nodes",
  "project_node_items",
  "youtube_profiles",
  "media_profiles",
  "media_watch_providers",
  // 16-A-1. AI를 부른 기록. 고칠 수도 지울 수도 없는 장부라 정책이 둘뿐이다.
  "ai_usage_events",
  // 17-1. 장소. 좌표가 들어오는 자리라 범위와 짝을 제약조건이 지킨다.
  "place_profiles",
  /*
    19-E. AI 한도에 더해주는 허용량.

    **`owner_id`에 기본값이 없는 유일한 표다.** 관리자가 남의 줄을 만드는
    표라 기본값을 걸면 관리자 자신에게 붙는다. 고칠 수도 지울 수도 없다.
  */
  "ai_usage_grants",
  /*
    16-B. 프로젝트를 링크로 여는 열쇠와 그 역사.

    **이 표가 뚫리면 남의 글이 밖으로 나간다.** 열쇠 하나가 로그인 없이
    열리는 문이라, 이 저장소에서 RLS가 가장 무거운 자리다.
    지우기 권한과 정책이 없다. 공개했던 사실은 남긴다. (16-B.6절)
  */
  "project_public_links",
];

/**
 * 아직 격리 검사를 쓰지 못한 표. **이 목록은 빚이지 면제가 아니다.**
 *
 * `003_rls_isolation_test.sql`은 실제 사용자 역할로 전환해 "막히는가"를
 * 확인하는 유일한 자산이다. 여기 이름이 있다는 것은 그 표의 RLS와 정책이
 * **걸려 있다고 적혀만 있고 막히는 것을 본 적은 없다**는 뜻이다.
 *
 * 위의 정적 검사는 `enable row level security`라는 글자가 있는지만 본다.
 * 글자가 있는 것과 실제로 막히는 것은 다르다. 정책의 `using` 절이 틀려
 * 남의 행이 보이더라도 이 파일의 검사는 전부 통과한다.
 *
 * **줄어들기만 해야 한다.** 새 표를 만들면서 여기에 이름을 더하지 않는다.
 * 미루더라도 `docs/VERIFICATION.md` 5절에 왜 미뤘는지를 함께 적는다.
 *
 * **2026-09-25에 비었다.** 앱의 모든 표가 003에서 실제로 눌러본 검사를
 * 가지게 되었다. 이 자리를 지우지 않고 남겨두는 것은, 다음에 표를 만들 때
 * 여기에 이름을 더하고 싶어지는 순간이 오면 **그것이 빚이라는 것을 먼저
 * 읽게 하기 위해서다.** 빈 목록은 그 자체로 지켜야 할 상태다.
 */
const TABLES_WITHOUT_ISOLATION_TEST = [
  // 비어 있다. 앱의 모든 표가 003에서 실제로 눌러본 검사를 가지고 있다.
];

/**
 * 조회 정책을 일부러 두지 않는 테이블.
 *
 * google_drive_connections가 그렇다. refresh token이 들어 있어 본인조차
 * 읽을 이유가 없다. authenticated에게 권한 자체를 주지 않고, 실수로 누가
 * grant를 더하더라도 열리지 않도록 RLS만 켜 둔 채 정책을 비워 두었다.
 *
 * "정책이 없다"와 "정책을 빠뜨렸다"는 화면에서 똑같아 보인다.
 * 어느 쪽인지를 여기에 적어 구분한다.
 */
const TABLES_WITHOUT_SELECT_POLICY = ["google_drive_connections"];

/** 세미콜론 기준으로 나눈 문장 목록. 주석 줄은 제외한다. */
const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
  .filter(Boolean);

test("마이그레이션 파일이 존재한다", () => {
  assert.ok(migrationFiles.length > 0, "supabase/migrations에 SQL 파일이 없다");
});

test("모든 앱 테이블에 RLS가 활성화되어 있다", () => {
  for (const table of PROTECTED_TABLES) {
    assert.ok(
      flat.includes(`alter table public.${table} enable row level security`),
      `${table}에 RLS가 활성화되지 않았다`,
    );
  }
});

test("모든 앱 테이블에 조회 정책이 있다", () => {
  for (const table of PROTECTED_TABLES) {
    if (TABLES_WITHOUT_SELECT_POLICY.includes(table)) {
      continue;
    }

    assert.ok(
      flat.includes(`on public.${table} for select`),
      `${table}에 select 정책이 없다`,
    );
  }
});

test("정책을 두지 않은 테이블은 권한도 주지 않는다", () => {
  // 정책이 없는 표에 권한만 남아 있으면 아무도 읽지 못하는 것이 아니라
  // 아무 행도 보이지 않을 뿐이다. 둘은 다르다. 권한 자체를 거둬야 한다.
  for (const table of TABLES_WITHOUT_SELECT_POLICY) {
    assert.ok(
      flat.includes(`revoke all on table public.${table} from anon, authenticated`),
      `${table}에서 authenticated 권한을 거두지 않았다`,
    );

    const granted = statements.filter(
      (statement) =>
        statement.startsWith("grant") &&
        statement.includes(`table public.${table}`) &&
        statement.includes("authenticated"),
    );

    assert.deepEqual(granted, [], `${table}에 authenticated 권한이 부여되어 있다`);
  }
});

test("SECURITY DEFINER 함수는 모두 search_path를 고정한다", () => {
  // 빈 search_path 없이 정의자 권한으로 실행하면
  // 호출자가 동명의 가짜 객체를 심어 함수 동작을 가로챌 수 있다.
  const headers = sql
    .split("create or replace function")
    .slice(1)
    .map((chunk) => chunk.split("as $$")[0]);

  assert.ok(headers.length > 0, "함수 정의를 찾을 수 없다");

  for (const header of headers) {
    if (!header.includes("security definer")) {
      continue;
    }

    const name = header.trim().split(/[\s(]/)[0];
    assert.ok(
      header.includes("set search_path = ''"),
      `${name}이 SECURITY DEFINER인데 search_path를 고정하지 않았다`,
    );
  }
});

test("권한 가드 트리거 함수는 SECURITY DEFINER가 아니다", () => {
  // 이 함수들은 current_user로 서비스 컨텍스트를 판별한다.
  // SECURITY DEFINER가 되면 current_user가 항상 소유자(postgres)가 되어
  // 서비스 컨텍스트 검사가 무조건 참이 되고 가드가 무력화된다.
  const guardFunctions = [
    "public.guard_profile_protected_columns()",
    "public.guard_last_admin()",
  ];

  for (const fn of guardFunctions) {
    const marker = `create or replace function ${fn}`;
    const start = sql.indexOf(marker);

    assert.notEqual(start, -1, `${fn} 정의를 찾을 수 없다`);

    const header = sql.slice(start + marker.length).split("as $$")[0];
    assert.ok(
      !header.includes("security definer"),
      `${fn}은 SECURITY DEFINER가 되어서는 안 된다`,
    );
  }
});

test("정책이 public 또는 anon 역할을 대상으로 하지 않는다", () => {
  const offenders = statements.filter(
    (statement) =>
      statement.startsWith("create policy") &&
      (statement.includes(" to public ") || statement.includes(" to anon ")),
  );

  assert.deepEqual(
    offenders,
    [],
    `비로그인 역할을 대상으로 한 정책이 있다: ${offenders.join(" | ")}`,
  );
});

test("모든 정책이 authenticated 역할을 명시한다", () => {
  // TO 절이 없는 정책은 암묵적으로 PUBLIC 대상이 되어 anon까지 포함된다.
  const policies = statements.filter((statement) =>
    statement.startsWith("create policy"),
  );

  assert.ok(policies.length > 0, "정책을 찾을 수 없다");

  const offenders = policies.filter(
    (statement) => !statement.includes(" to authenticated "),
  );

  assert.deepEqual(
    offenders,
    [],
    `대상 역할을 명시하지 않은 정책이 있다: ${offenders.join(" | ")}`,
  );
});

/**
 * 비로그인에게 **표** 권한을 주지 않는다.
 *
 * 001의 검사 17이 지키는 것과 같은 약속이다. anon이 표를 읽을 수 있으면
 * RLS 이전에 열려 있는 것이다.
 *
 * **2026-10-04에 이 검사의 범위를 좁혔다.** 그전까지는 `grant`에 `anon`이
 * 들어가면 전부 막았다. 16-B의 공개 링크를 만들면서 **함수 실행 권한**이
 * 필요해졌다. 공개된 프로젝트를 로그인 없이 읽는 문이고, 그 문이 함수인
 * 까닭이 바로 **표 권한을 주지 않으려는 것**이다. (16-B.5절)
 *
 * 그래서 넓힌 것이 아니라 **가른 것이다.**
 *
 *   - 표 권한: 하나도 안 된다. 예외 없다
 *   - 함수 실행 권한: **이름을 적은 것만.** 아래 목록이다
 *
 * 목록을 두는 까닭. anon이 부를 수 있는 함수는 **로그인 없이 닿는
 * 유일한 자리**다. 하나 늘 때마다 사람이 보고 적어야 한다. 적지 않으면
 * 이 검사가 멈춘다.
 */
const ANON_CALLABLE_FUNCTIONS = [
  /*
    16-B. 열쇠로 공개된 프로젝트를 읽는 문.

    `SECURITY DEFINER`이고 anon이 부른다. 이 저장소에서 가장 조심해야 하는
    자리다. 지키는 것들은 이렇다.

      - 열쇠(64자리 16진수)가 맞고 **살아 있어야** 한다
      - 나가는 칸이 SQL에 글자로 적혀 있다. `select *`가 없다
      - 기계가 쓴 기록과 지운 것은 줄째로 빠진다
      - 틀린 열쇠·끈 열쇠·지운 프로젝트는 **전부 `null`**이다

    `tests/sharing-public-reader.test.mjs`가 그것들을 본다. 실제로
    막히는지는 003이 역할을 바꿔 눌러본다.
  */
  "public.public_project(text)",
];

test("anon 역할에 표 권한을 부여하지 않는다", () => {
  const offenders = statements.filter(
    (statement) =>
      statement.startsWith("grant") &&
      statement.includes("anon") &&
      statement.includes("on table"),
  );

  assert.deepEqual(
    offenders,
    [],
    `anon에 표 권한을 부여하는 구문이 있다: ${offenders.join(" | ")}`,
  );
});

test("anon이 부를 수 있는 함수는 적어둔 것뿐이다", () => {
  const grants = statements.filter(
    (statement) =>
      statement.startsWith("grant") &&
      statement.includes("anon") &&
      statement.includes("on function"),
  );

  /*
    함수 이름을 뽑아 목록과 견준다. 목록에 없는 함수가 anon에게 열리면
    멈춘다. **로그인 없이 닿는 자리는 사람이 하나씩 보고 늘려야 한다.**
  */
  const opened = grants
    .map((statement) => /on function (\S+\([^)]*\))/u.exec(statement))
    .filter(Boolean)
    .map((match) => match[1]);

  const unexpected = opened.filter(
    (name) => !ANON_CALLABLE_FUNCTIONS.includes(name),
  );

  assert.deepEqual(
    unexpected,
    [],
    `적어두지 않은 함수가 anon에게 열려 있다. 로그인 없이 닿는 자리다: ${unexpected.join(", ")}`,
  );

  /*
    반대쪽도 조인다. 목록에 적어두고 실제로 열지 않으면, **있지도 않은
    문을 지키고 있다고 믿게 된다.**
  */
  const notOpened = ANON_CALLABLE_FUNCTIONS.filter(
    (name) => !opened.includes(name),
  );

  assert.deepEqual(
    notOpened,
    [],
    `목록에 있는데 실제로 열려 있지 않다. 지우거나 열어야 한다: ${notOpened.join(", ")}`,
  );
});

test("anon에게 열린 함수는 표 권한을 대신하지 않는다", () => {
  /*
    **함수를 여는 것이 표를 여는 쪽으로 번지지 않게 한다.**

    anon에게 열린 함수가 있다는 것은, 그 함수가 `SECURITY DEFINER`로
    RLS를 우회해 읽는다는 뜻이다. 그 자리가 생겼으니 "어차피 공개니까"
    하며 표를 여는 쪽으로 가기 쉽다. 그 둘은 전혀 다르다.

    표를 열면 **공개된 것을 전부 찾아낼 수 있다.** 함수는 열쇠를 아는
    사람에게 그 하나만 준다.
  */
  assert.ok(
    ANON_CALLABLE_FUNCTIONS.length <= 1,
    `anon이 부를 수 있는 함수가 ${ANON_CALLABLE_FUNCTIONS.length}개다. 늘어난 까닭을 적고 이 검사를 고친다`,
  );
});

/**
 * 스키마를 붙일 수 없는 것에 붙이지 않는다.
 *
 * **2026-10-04에 이 자리에서 멈췄다.** 읽는 문에 `pg_catalog.coalesce(...)`를
 * 썼고 003의 검사 139가 이렇게 실패했다.
 *
 *     ERROR: 42883: function pg_catalog.coalesce(jsonb, jsonb) does not exist
 *
 * `COALESCE`는 **함수가 아니라 SQL 구문이다.** `CASE`, `NULLIF`, `GREATEST`,
 * `LEAST`와 함께 파서가 직접 다루고, `pg_catalog`에 그런 이름의 함수가 없다.
 *
 * 왜 조용했나
 *   **올릴 때는 아무 소리도 나지 않았다.** PL/pgSQL 함수의 본문은 만들 때
 *   검사되지 않고 **부를 때** 비로소 계획된다. `db push`가 통과하고, 003을
 *   사람이 돌려서야 드러났다. 그 사이가 길다.
 *
 *   `search_path`를 비운 함수에서는 함수 이름에 스키마를 붙이는 것이 이
 *   저장소의 방식이라, 붙이는 손이 구문에까지 갔다. 붙일 필요도 없었다.
 *   **구문은 `search_path`로 찾지 않으므로 가로챌 수 없다.**
 *
 * 여기서 잡으면 올리기 전에 안다.
 */
test("스키마를 붙일 수 없는 SQL 구문에 pg_catalog을 붙이지 않는다", () => {
  /*
    주석을 뺀 글만 본다. 고친 마이그레이션의 머리말에 **그 오류 메시지가
    그대로 적혀 있어서**, 주석을 함께 보면 영원히 실패하는 검사가 된다.
  */
  let code = sql
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");

  /*
    **나중에 다시 쓴 함수의 옛 글은 보지 않는다.**

    마이그레이션은 올린 뒤에 고치지 않는다. 그것이 이 저장소의 방식이고
    `fix_` 로 시작하는 파일들이 그 기록이다. 그래서 고친 함수의 **옛
    글이 저장소에 남는다.**

    그 옛 글까지 보면 이 검사는 영원히 실패한다. 고칠 길이 없는 과거를
    가리키게 되고, **고칠 수 없는 실패는 검사를 끄게 만든다.**

    보아야 하는 것은 **지금 데이터베이스에 있는 글**이다. 같은 이름의
    함수가 여러 번 정의되어 있으면 마지막 것만 남긴다.
  */
  const blocks = [
    ...code.matchAll(
      /create or replace function public\.(\w+)[\s\S]*?\n\$\$;/g,
    ),
  ];

  const lastIndexOf = new Map();

  for (const block of blocks) {
    lastIndexOf.set(block[1], block.index);
  }

  for (const block of blocks) {
    if (lastIndexOf.get(block[1]) !== block.index) {
      code = code.replace(block[0], "");
    }
  }

  /*
    함수가 아니라 구문인 것들. 전부 `pg_catalog`에 없다.

    `substring`·`trim`·`extract`처럼 특별한 문법을 가지면서 함수로도
    존재하는 것들은 넣지 않는다. 그쪽은 붙여도 찾아진다.
  */
  const notFunctions = ["coalesce", "nullif", "greatest", "least", "case"];

  const offenders = [];

  for (const name of notFunctions) {
    for (const match of code.matchAll(
      new RegExp(`pg_catalog\\.${name}\\s*\\(`, "giu"),
    )) {
      offenders.push(match[0].trim());
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `SQL 구문에 pg_catalog을 붙였다. 부를 때 "does not exist"로 멈춘다: ${offenders.join(", ")}`,
  );
});

test("감사 로그에 쓰기 정책이 없다", () => {
  // 트리거(SECURITY DEFINER)만 기록할 수 있어야 한다.
  for (const action of ["insert", "update", "delete"]) {
    assert.ok(
      !flat.includes(`on public.admin_audit_logs for ${action}`),
      `감사 로그에 ${action} 정책이 존재한다`,
    );
  }
});

test("감사 로그에는 select 권한만 부여한다", () => {
  const grants = statements.filter(
    (statement) =>
      statement.startsWith("grant") &&
      statement.includes("public.admin_audit_logs"),
  );

  assert.deepEqual(
    grants,
    ["grant select on table public.admin_audit_logs to authenticated"],
    "감사 로그 권한 부여가 select 하나가 아니다",
  );
});

test("profiles에 insert/delete 정책을 두지 않는다", () => {
  // 생성은 가입 트리거가, 삭제는 auth.users cascade가 담당한다.
  for (const action of ["insert", "delete"]) {
    assert.ok(
      !flat.includes(`on public.profiles for ${action}`),
      `profiles에 ${action} 정책이 존재한다`,
    );
  }
});

test("신규 가입 승인 필요 설정의 초기값이 true다", () => {
  assert.ok(
    flat.includes("'require_user_approval', 'true'::jsonb"),
    "require_user_approval 초기값이 true가 아니다",
  );
});

test("가입 트리거는 INSERT에만 걸려 있다", () => {
  // 개인정보 처리방침 1절: 승인 필요 설정을 꺼도 이미 대기 중인 계정은
  // 자동 승인되지 않는다. 트리거가 UPDATE에도 걸리면 그 약속이 깨진다.
  assert.ok(
    flat.includes("after insert on auth.users"),
    "가입 트리거가 INSERT에 걸려 있지 않다",
  );

  const forbidden = [
    "after insert or update on auth.users",
    "after update on auth.users",
    "before update on auth.users",
  ];

  for (const statement of forbidden) {
    assert.ok(
      !flat.includes(statement),
      `가입 트리거가 갱신에도 반응한다: ${statement}`,
    );
  }
});

test("승인 설정을 읽지 못하면 승인 필요로 처리한다", () => {
  // 설정 누락이 곧 무제한 가입 허용이 되어서는 안 된다.
  assert.ok(
    flat.includes("coalesce(v_require_approval, true)"),
    "가입 트리거의 fail closed 처리가 없다",
  );
});

test("app_settings에 insert/delete 정책을 두지 않는다", () => {
  // 설정 키는 마이그레이션으로만 정의한다.
  for (const action of ["insert", "delete"]) {
    assert.ok(
      !flat.includes(`on public.app_settings for ${action}`),
      `app_settings에 ${action} 정책이 존재한다`,
    );
  }
});

test("관리자 권한을 자동으로 부여하지 않는다", () => {
  assert.ok(
    !flat.includes("insert into public.user_roles"),
    "마이그레이션이 관리자 역할을 자동 부여하고 있다",
  );
});

test("auth.users의 데이터를 변경하지 않는다", () => {
  for (const forbidden of [
    "insert into auth.users",
    "update auth.users",
    "delete from auth.users",
    "alter table auth.users",
  ]) {
    assert.ok(!flat.includes(forbidden), `금지된 구문이 있다: ${forbidden}`);
  }
});

test("달러 인용 블록의 짝이 맞는다", () => {
  const count = sql.split("$$").length - 1;
  assert.equal(count % 2, 0, "$$ 블록이 짝을 이루지 않는다");
});

test("관리자 이메일이 소스 코드와 마이그레이션에 들어있지 않다", () => {
  // 관리자 판정은 user_roles로만 한다. 코드에 이메일을 넣으면 안 된다.
  const scanDirs = [
    path.join(repoRoot, "src"),
    path.join(repoRoot, "supabase", "migrations"),
  ];
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql"];

  /**
   * @param {string} dir
   * @returns {string[]}
   */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });

  const offenders = scanDirs
    .flatMap(walk)
    .filter((file) => extensions.includes(path.extname(file)))
    .filter((file) => readFileSync(file, "utf8").includes("daesobi"));

  assert.deepEqual(
    offenders,
    [],
    `관리자 이메일이 포함된 파일이 있다: ${offenders.join(", ")}`,
  );
});

/**
 * 격리 검사 목록이 표를 따라오는가.
 *
 * **이 저장소가 같은 함정에 두 번 빠진 자리다.** 표를 새로 만들면서 검사
 * 목록에 넣는 것을 잊었고, 그동안 그 표들은 아무도 확인하지 않은 채 있었다.
 * 09-24에 `PROTECTED_TABLES`가 그랬고(VERIFICATION 4-25절),
 * `003_rls_isolation_test.sql`도 같은 상태로 뒤처져 있었다.
 *
 * **말로 적은 약속은 잊히고 검사로 적은 약속은 잊히지 않는다.** 두 번
 * 잊었으면 세 번째도 잊는다. 여기서 붙잡는다.
 *
 * 다만 **이 검사가 확인하는 것은 "검사가 있는가"뿐이다.** 그 검사가 옳은지,
 * 실제로 도는지는 확인하지 않는다. 003은 Supabase SQL Editor에서 사람이
 * 돌려야 알 수 있다. 빠뜨림을 막는 것이지 검증을 대신하지 않는다.
 */
test("격리 검사가 모든 앱 테이블을 다룬다", () => {
  const isolation = readFileSync(
    path.join(repoRoot, "supabase", "verify", "003_rls_isolation_test.sql"),
    "utf8",
  );

  const missing = PROTECTED_TABLES.filter(
    (table) =>
      !TABLES_WITHOUT_ISOLATION_TEST.includes(table) &&
      !isolation.includes(`public.${table}`),
  );

  assert.deepEqual(
    missing,
    [],
    `이 표의 격리 검사가 003_rls_isolation_test.sql에 없다: ${missing.join(", ")}`,
  );
});

/**
 * SECURITY DEFINER 함수가 001의 허용 목록을 따라오는가.
 *
 * **2026-10-04에 이 구멍을 찾았다.** `log_ai_usage_grant`가 9월 26일부터
 * DEFINER였는데 001의 허용 목록에 없었다. 그동안 001의 검사 9
 * (`허용 목록 밖의 DEFINER 함수 없음`)는 **0이 아니라 1을 돌려줄 상태**로
 * 있었고, 그 사이에 001을 돌리지 않아 아무도 몰랐다.
 *
 * AGENTS.md 7절이 "DEFINER 함수를 추가하면 001의 허용 목록에 넣는다"고
 * 적어두고 있었다. **말로 적은 약속은 잊히고 검사로 적은 약속은 잊히지
 * 않는다.** 여기서 붙잡는다.
 *
 * DEFINER 함수는 소유자 권한으로 돌아 **RLS를 우회한다.** 그래서 "몇
 * 개인지"가 아니라 "어떤 것들인지"를 사람이 보고 적어야 하고, 적지 않은
 * 것이 생기면 멈춰야 한다.
 *
 * 001은 사람이 Supabase SQL Editor에서 돌린다. 그 사이가 길다. 이 검사는
 * **001을 돌리기 전에** 뒤처짐을 잡는다.
 */
test("DEFINER 함수가 001의 허용 목록에 빠짐없이 있다", () => {
  const verify = readFileSync(
    path.join(repoRoot, "supabase", "verify", "001_verify_auth_approval.sql"),
    "utf8",
  );

  /*
    마이그레이션에서 DEFINER 함수 이름을 뽑는다.

    `as $$`까지의 머리말에 `security definer`가 있는지로 가른다. 함수
    본문에 그 말이 나오는 경우(주석 등)를 세지 않으려는 것이다.
  */
  const definers = new Set();

  for (const match of sql.matchAll(
    /create or replace function public\.(\w+)\s*\(([\s\S]{0,600}?)\bas \$\$/gu,
  )) {
    if (/security definer/iu.test(match[2])) {
      definers.add(match[1]);
    }
  }

  // 목록이 비는 날을 생각해 둔다. 정규식이 어긋나면 조용히 통과한다.
  assert.ok(
    definers.size >= 11,
    `마이그레이션에서 DEFINER 함수를 못 뽑았다. 이 검사가 헛돌고 있다: ${[...definers].join(", ")}`,
  );

  const missing = [...definers].filter(
    (name) => !verify.includes(`'${name}'`),
  );

  assert.deepEqual(
    missing,
    [],
    `이 DEFINER 함수가 001의 허용 목록에 없다. 001의 검사 9가 실패한다: ${missing.join(", ")}`,
  );
});

/**
 * 소유자를 정하는 트리거는 auth.uid()가 있을 때만 덮어쓴다.
 *
 * **2026-09-25에 이 자리에서 막혔다.** `ai_usage_events`의 트리거를
 * 이렇게 썼다.
 *
 *     new.owner_id := auth.uid();
 *     if new.owner_id is null then raise exception ...
 *
 * 로그인하지 않은 컨텍스트에서 넣는 길이 통째로 막혔다. 003 격리 검사가
 * 검사용 줄을 미리 심을 때가 그 경우이고, 검사가 거기서 멈췄다.
 *
 * **앱에서는 드러나지 않는 고장이다.** 앱은 언제나 로그인한 세션으로
 * 넣으므로 `auth.uid()`가 늘 있다. 이 파일의 다른 검사들도 잡지 못했다.
 * 글자가 있는지만 보기 때문이다. 실제로 돌려봐야만 나왔다.
 *
 * 집안의 다른 트리거 열일곱 개는 전부 감싼 모양이었다. **하나만 달랐고,
 * 다른 줄 알 방법이 없었다.** 그래서 검사로 적는다.
 *
 * 감싸지 않아도 보안은 같다. 지키려는 것은 "로그인한 사용자가 남의 이름으로
 * 남기지 못한다"이고, 로그인한 세션에서는 `auth.uid()`가 늘 있어 반드시
 * 덮어쓴다. `auth.uid()`가 없는 쪽은 `postgres`와 `service_role`뿐이며
 * 그쪽은 이미 무엇이든 할 수 있다.
 *
 * **지금 살아 있는 정의만 본다.** `create or replace`로 고친 함수는 앞
 * 파일에 옛 정의가 그대로 남아 있다. 옛 정의까지 보면 고쳐놓고도 실패한다.
 * (AGENTS.md 6절 `지금 살아 있는 정의부터 찾는다`)
 */
test("소유자 트리거는 auth.uid()가 있을 때만 덮어쓴다", () => {
  /** 함수 이름 -> 마지막으로 나온 본문. 파일 이름 순서가 곧 적용 순서다. */
  const latest = new Map();

  for (const name of migrationFiles) {
    const text = readFileSync(path.join(migrationsDir, name), "utf8");
    const pattern =
      /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\([^)]*\)([\s\S]*?)\n\$\$;/g;

    for (const [, functionName, body] of text.matchAll(pattern)) {
      latest.set(functionName, { body, file: name });
    }
  }

  const offenders = [];

  for (const [functionName, { body, file }] of latest) {
    /*
      주석은 떼고 본다. 이 커밋의 설명글에도 나쁜 모양이 인용되어 있어,
      떼지 않으면 설명을 적었다는 이유로 실패한다.
    */
    const code = body
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    if (!/new\.owner_id\s*:=\s*auth\.uid\(\)/.test(code)) {
      continue;
    }

    if (!/if\s+auth\.uid\(\)\s+is\s+not\s+null\s+then/.test(code)) {
      offenders.push(`${functionName} (${file})`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `이 트리거가 auth.uid()를 확인하지 않고 owner_id를 덮어쓴다. 로그인하지 않은 컨텍스트에서 넣는 길이 막힌다: ${offenders.join(", ")}`,
  );
});

test("격리 검사를 미룬 목록에 이미 검사가 있는 표를 두지 않는다", () => {
  /*
    빚을 갚고 나서 목록에서 빼는 것을 잊으면, 그 표는 **다시 검사 밖으로
    나간다.** 나중에 그 표에 새 가드를 더해도 아무도 말해주지 않는다.

    미룬 목록은 줄어들기만 해야 한다. 양쪽에서 조여야 그렇게 된다.
  */
  const isolation = readFileSync(
    path.join(repoRoot, "supabase", "verify", "003_rls_isolation_test.sql"),
    "utf8",
  );

  const stale = TABLES_WITHOUT_ISOLATION_TEST.filter((table) =>
    isolation.includes(`public.${table}`),
  );

  assert.deepEqual(
    stale,
    [],
    `이 표는 이미 격리 검사가 있다. TABLES_WITHOUT_ISOLATION_TEST에서 뺀다: ${stale.join(", ")}`,
  );
});
