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
 * `google_drive_connections`가 특히 급하다. 이 표는 Google 토큰을 담는다.
 */
const TABLES_WITHOUT_ISOLATION_TEST = [
  "google_drive_connections",
  "tags",
  "source_tags",
  "capture_tags",
  "website_profiles",
  "music_profiles",
  "music_provider_links",
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

test("anon 역할에 권한을 부여하지 않는다", () => {
  const offenders = statements.filter(
    (statement) => statement.startsWith("grant") && statement.includes("anon"),
  );

  assert.deepEqual(
    offenders,
    [],
    `anon에 권한을 부여하는 구문이 있다: ${offenders.join(" | ")}`,
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
