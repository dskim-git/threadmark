/**
 * 공개 링크의 열쇠가 지켜야 할 것들. (16-B.8 3차례)
 *
 * **이 표는 이 저장소에서 RLS가 가장 무거운 자리다.** 다른 표가 뚫리면
 * "남의 것이 내게 보인다"인데, 여기가 뚫리면 **"남의 것이 모두에게
 * 보인다"**이고 되돌릴 수 없다.
 *
 * 실제로 막히는지는 `003`이 역할을 바꿔 눌러본다. (검사 131~138) 이 파일은
 * **DB 없이도 볼 수 있는 것**만 본다. 마이그레이션 글에 그 약속이 적혀
 * 있는지다.
 *
 * 둘은 다르다. 글이 있는 것과 막히는 것은 같지 않다. 그래서 이 파일은
 * 003을 대신하지 않고, **003을 돌리기 전에 빠뜨림을 잡는다.** 003은 사람이
 * 손으로 돌려야 하므로 그 사이가 길다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

/** 마이그레이션 전부를 한 글로 이어 읽는다. 줄 끝을 맞춘다. */
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n")
  .replace(/\r\n/g, "\n");

/** 이 표를 만든 마이그레이션 하나. */
const linksMigration = readFileSync(
  path.join(migrationsDir, "20261004100000_project_public_links.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const isolation = readFileSync(
  path.join(repoRoot, "supabase", "verify", "003_rls_isolation_test.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

test("마이그레이션을 읽어냈다", () => {
  // 목록이 비는 날을 생각해 둔다. (AGENTS.md 6절)
  assert.ok(
    linksMigration.includes("create table if not exists public.project_public_links"),
    "공개 링크 마이그레이션을 못 읽었다. 이 파일의 검사가 전부 헛돈다",
  );
});

// -----------------------------------------------------------------------------
// 열쇠
// -----------------------------------------------------------------------------

test("열쇠는 트리거가 만든다. 보낸 값을 쓰지 않는다", () => {
  /*
    **이것이 이 표에서 가장 중요한 약속이다.** 보낸 값을 쓰면 짧거나 뻔한
    열쇠를 넣을 수 있고, 그러면 **주소를 맞혀서 열 수 있게 된다.**
    16-B.5절이 막으려던 것이 그 자리에서 사라진다.

    `owner_id`를 클라이언트가 정하지 못하게 하는 것과 같은 생각이다.
    (보안 원칙 2)
  */
  const assignment = /new\.token\s*:=([\s\S]*?);/u.exec(linksMigration);

  assert.ok(
    assignment,
    "트리거가 열쇠를 덮어쓰지 않는다. 보낸 열쇠가 그대로 들어간다",
  );

  /*
    **덮어쓰는 것만으로는 모자라다.**

    이 검사를 처음 쓸 때 `new.token :=`이 있는지만 봤다. 그러고 나서
    일부러 틀리게 고쳐 보니 **`new.token := coalesce(new.token, ...)`이
    그대로 통과했다.** 보낸 열쇠가 있으면 그것을 쓰고 없을 때만 만드는
    코드인데, 검사는 "덮어쓴다"고 읽은 것이다.

    `덮어쓴다`와 `보낸 값을 쓰지 않는다`는 다르다. 뒤쪽이 지켜야 할
    약속이므로 **오른쪽에 `new.token`이 나오지 않는지**를 본다.
  */
  assert.ok(
    !/new\.token/u.test(assignment[1]),
    `보낸 열쇠를 다시 읽어 쓴다. 짧은 열쇠를 넣을 수 있다: ${assignment[1].trim()}`,
  );

  assert.match(
    assignment[1],
    /gen_random_uuid\(\)::text/u,
    "열쇠를 난수로 만들지 않는다",
  );
});

test("열쇠를 부를 때 pg_catalog을 붙인다", () => {
  /*
    트리거가 `search_path`를 비워 두고 돌기 때문에 이름만 쓰면 찾지 못한다.
    **밀어 올릴 때 오류가 나는 쪽이라 조용하지는 않다.** 그래도 적어두는
    까닭은, 이 저장소에서 `search_path`를 비운 함수 안에서 `gen_random_uuid`를
    부르는 곳이 여기 하나뿐이어서다. 다음에 고치는 사람이 떼어낼 수 있다.
  */
  assert.ok(
    linksMigration.includes("pg_catalog.gen_random_uuid()"),
    "search_path를 비운 함수에서 이름만으로는 찾지 못한다",
  );
});

test("열쇠 칸에 기본값도 걸려 있다", () => {
  /*
    **기본값은 타입을, 트리거는 실제 보장을 맡는다.**

    이 규칙을 같은 파일 안에서 한 칸에만 따랐다. `owner_id`에는 기본값과
    트리거를 둘 다 걸고 `token`에는 트리거만 걸었다. 트리거가 채우니
    됐다고 생각했다.

    올린 뒤 `db:types`를 돌려 보니 `token`이 **Insert에 필수**로 잡혔다.
    타입 생성기는 트리거를 모르고 칸의 기본값만 본다. 그러면 공개를 켜는
    코드가 **보내면 안 되는 값을 보내야 한다.** 막으려던 것이 그것이다.

    4-44절에서 `owner_id`가 똑같은 자리에 있었다. **적어둔 교훈을 같은
    파일 안에서 한 칸에만 적용했다.**

    두 겹이 하는 일이 다르다. 기본값은 "안 보내도 된다"를 말하고, 트리거는
    보내도 **버린다.** 기본값만으로는 보낸 값이 그대로 들어간다.
  */
  assert.match(
    migrations,
    /alter table public\.project_public_links\s*\n?\s*alter column token set default/u,
    "열쇠 칸에 기본값이 없다. 타입 생성기가 token을 필수로 보고, 코드가 열쇠를 보내야 한다",
  );
});

test("생성된 타입에서 열쇠를 안 보내도 된다", () => {
  /*
    **마이그레이션만 보는 것으로는 모자랐다.** 위의 검사는 기본값을 적었는지
    보고, 이 검사는 **그것이 실제로 먹었는지** 본다. 둘 사이에 `db push`와
    `db:types`가 있고, 그 둘을 사람이 돌린다.

    여기가 틀어지는 경우가 있다. 마이그레이션을 쓰고 올리지 않았거나,
    올리고 `db:types`를 안 돌렸을 때다. 그때 이 검사가 멈춘다.
    (AGENTS.md 3절이 "마이그레이션 적용 후 반드시 실행"이라고 적은 것)
  */
  const types = readFileSync(
    path.join(repoRoot, "src", "lib", "supabase", "database.types.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const table = /project_public_links: \{([\s\S]*?)\n      \}/u.exec(types);

  assert.ok(table, "생성된 타입에 project_public_links가 없다. db:types를 돌리지 않았다");

  const insert = /Insert: \{([\s\S]*?)\n        \}/u.exec(table[1]);

  assert.ok(insert, "생성된 타입에서 Insert를 못 찾았다");

  assert.match(
    insert[1],
    /token\?:/u,
    "생성된 타입이 열쇠를 필수로 본다. 코드가 보내면 안 되는 값을 보내야 한다",
  );

  // owner_id도 같다. 이쪽은 처음부터 되어 있었다. (보안 원칙 2)
  assert.match(
    insert[1],
    /owner_id\?:/u,
    "생성된 타입이 owner_id를 필수로 본다",
  );
});

test("열쇠 모양을 제약조건이 지킨다", () => {
  /*
    트리거가 채우는 값인데도 제약조건을 둔다. **트리거는 나중에 누군가
    고칠 수 있고, 그때 짧은 열쇠가 조용히 들어온다.** 이 표는 그것 하나가
    뚫리면 전부가 뚫리는 자리라 두 겹으로 둔다.
  */
  assert.match(
    linksMigration,
    /token\s*~\s*'\^\[0-9a-f\]\{64\}\$'/u,
    "열쇠 모양 제약조건이 없다",
  );
});

test("열쇠는 전부에서 하나뿐이다", () => {
  // 열쇠로 찾는 질의가 반드시 한 줄을 보게 한다. 두 줄이 돌아오는 상황을
  // 읽는 쪽에서 처리하게 두면, 그 처리가 틀렸을 때 남의 것이 열린다.
  assert.match(
    linksMigration,
    /create unique index if not exists project_public_links_token_key/u,
  );
});

// -----------------------------------------------------------------------------
// 켜고 끄기
// -----------------------------------------------------------------------------

test("한 프로젝트에 살아 있는 열쇠는 하나뿐이다", () => {
  /*
    둘이 되면 **"껐다"가 뜻을 잃는다.** 하나를 끄고도 다른 하나로 열린다.
    부분 색인이라 꺼진 줄은 몇이든 쌓인다. 그것이 역사다.
  */
  assert.match(
    linksMigration,
    /create unique index if not exists project_public_links_one_live_idx[\s\S]{0,200}where revoked_at is null/u,
    "살아 있는 열쇠를 하나로 묶는 부분 색인이 없다",
  );
});

test("켜면서 동시에 끌 수 없다", () => {
  /*
    보낸 값에 `revoked_at`이 들어 있으면 **태어날 때부터 죽은 줄**이 된다.
    그런 줄은 부분 색인에 걸리지 않아 살아 있는 열쇠 자리를 비워 두고,
    화면은 공개된 것으로 보일 수 있다.
  */
  assert.match(
    linksMigration,
    /new\.revoked_at\s*:=\s*null/u,
    "보낸 revoked_at을 버리지 않는다",
  );
});

test("끈 열쇠를 되살릴 수 없다", () => {
  /*
    16-B.6절이 명시로 금지한다. **한 번 돌아간 링크를 영원히 믿어야 하는
    상태를 만들지 않는다.**

    이 약속은 정책으로 쓸 수 없다. `with check`가 `OLD` 행을 볼 수 없어서다.
    (AGENTS.md 6절) 그래서 BEFORE 트리거가 맡는다.
  */
  assert.match(
    linksMigration,
    /old\.revoked_at is not null[\s\S]{0,200}raise exception/u,
    "되살리기를 막는 가드가 없다",
  );

  assert.match(
    linksMigration,
    /create trigger project_public_links_guard_update[\s\S]{0,120}before update/u,
    "끄는 것만 허용하는 가드가 BEFORE UPDATE로 걸려 있지 않다",
  );
});

test("가드가 SECURITY DEFINER가 아니다", () => {
  /*
    **가드가 소유자 권한으로 돌면 RLS를 우회한다.** 막아야 할 갱신을
    스스로 통과시키는 자리가 된다. 001의 검사 11이 같은 것을 본다.
  */
  const guard =
    /create or replace function public\.guard_project_public_link_update\(\)[\s\S]*?as \$\$/u.exec(
      linksMigration,
    );

  assert.ok(guard, "가드 함수를 못 찾았다");
  assert.ok(
    !/security definer/iu.test(guard[0]),
    "가드가 SECURITY DEFINER다. RLS를 우회한다",
  );
});

test("공개한 내역은 지울 수 없다", () => {
  /*
    16-B.6절. **공개했던 사실은 남긴다.** "그때 무엇이 나갔나"에 답할 수
    없으면 권리자 요청이 왔을 때 할 말이 없다.

    권한을 주지 않는다. 그러면 정책을 잘못 쓰더라도 지워지지 않는다.
    장부(`ai_usage_grants`)와 같은 생각이다.
  */
  const grant = /grant ([a-z, ]+) on table public\.project_public_links/u.exec(
    linksMigration,
  );

  assert.ok(grant, "권한을 적은 줄을 못 찾았다");
  assert.ok(
    !grant[1].includes("delete"),
    `지우기 권한이 있다: ${grant[1]}. 공개했던 사실이 사라질 수 있다`,
  );

  assert.ok(
    !/create policy project_public_links_delete/u.test(linksMigration),
    "지우기 정책이 있다",
  );
});

// -----------------------------------------------------------------------------
// 비로그인에게 주지 않는다
// -----------------------------------------------------------------------------

test("anon에게 표 권한을 주지 않는다", () => {
  /*
    **공개 기능에서 가장 조용한 위험이다.**

    "로그인 없이 열려야 하니 anon에게 권한을 주자"가 자연스러워 보인다.
    주면 anon이 **열쇠 표를 통째로 읽어 공개된 프로젝트를 전부 찾아낸다.**
    열쇠를 따로 만든 뜻이 그 자리에서 사라지고, 주소를 맞힐 필요도 없어진다.

    001의 검사 17이 "anon 역할에 테이블 권한 없음"을 0으로 지킨다.
    여기서는 마이그레이션 글이 그 약속을 깨지 않는지 본다.
  */
  assert.match(
    linksMigration,
    /revoke all on table public\.project_public_links from anon/u,
    "anon에서 권한을 거두지 않는다",
  );

  const grantsToAnon = [
    ...linksMigration.matchAll(/grant[^;]*on table[^;]*to[^;]*;/gu),
  ].filter((match) => /\banon\b/u.test(match[0]));

  assert.deepEqual(
    grantsToAnon.map((match) => match[0].replace(/\s+/gu, " ")),
    [],
    "anon에게 표 권한을 주고 있다",
  );
});

// -----------------------------------------------------------------------------
// 지운 프로젝트
// -----------------------------------------------------------------------------

test("프로젝트를 지우면 공개가 그 자리에서 꺼진다", () => {
  /*
    **프로젝트의 삭제는 표시만 한다.** 그래서 지워도 열쇠는 살아 있다.

    이것이 사용자가 가장 예상하지 못하는 고장이다. 지운 사람은 **확인할
    방법이 없다.** 프로젝트가 목록에서 사라졌으므로 공개 단추도 함께
    사라진다. 그 상태로 링크는 계속 열린다.

    읽는 문에서 한 번 더 걸러낼 것이지만 **그 한 겹에만 기대지 않는다.**
  */
  const fn =
    /create or replace function public\.soft_delete_project\(project_id uuid\)[\s\S]*?\n\$\$;/gu;

  const bodies = [...migrations.matchAll(fn)].map((match) => match[0]);

  assert.ok(bodies.length > 0, "soft_delete_project를 못 찾았다");

  const latest = bodies[bodies.length - 1];

  assert.ok(
    latest.includes("public.project_public_links"),
    "프로젝트를 지울 때 공개 열쇠를 끄지 않는다. 지운 것이 계속 열린다",
  );
});

test("지운 프로젝트를 공개할 수 없다", () => {
  assert.match(
    linksMigration,
    /deleted_at is not null[\s\S]{0,200}raise exception/u,
    "지운 프로젝트에 열쇠를 달 수 있다",
  );
});

test("남의 프로젝트에 열쇠를 달 수 없다", () => {
  // 외래키 제약은 RLS를 보지 않는다. (AGENTS.md 6절)
  assert.match(
    linksMigration,
    /perform public\.assert_project_owned\(new\.project_id, new\.owner_id\)/u,
    "내 프로젝트인지 확인하지 않는다",
  );
});

// -----------------------------------------------------------------------------
// 상태를 두 곳에 두지 않는다
// -----------------------------------------------------------------------------

test("visibility 칸에 쓰지 말라고 적어 둔다", () => {
  /*
    **이 주석이 없으면 다음 사람이 `visibility = 'private'`으로 공개 여부를
    거르려 한다.** 그 값은 늘 `private`이므로 거르는 조건이 아무 일도 하지
    않고, 오류도 나지 않는다. **덜 나오는 것도 더 나오는 것도 조용하다.**
  */
  assert.match(
    linksMigration,
    /comment on column public\.projects\.visibility is[\s\S]{0,300}project_public_links/u,
    "visibility 칸이 어디를 보라고 말하지 않는다",
  );
});

test("project_visibility 열거형을 늘리지 않았다", () => {
  /*
    상태를 두 곳에 두지 않는다. **열쇠가 상태다.** 살아 있는 열쇠가 있으면
    공개된 것이고 없으면 아니다. 열거형에 `link`를 더하면 둘이 어긋날 수
    있고, 이 저장소는 그런 자리에서 한쪽만 갱신되는 일을 이미 겪었다.
  */
  assert.ok(
    !/alter type public\.project_visibility add value/iu.test(migrations),
    "project_visibility를 늘렸다. 공개 상태가 두 곳에 생긴다",
  );
});

// -----------------------------------------------------------------------------
// 003이 따라왔는가
// -----------------------------------------------------------------------------

test("003에 공개 열쇠 검사가 들어 있다", () => {
  /*
    `migration-invariants`의 `격리 검사가 모든 앱 테이블을 다룬다`가 표
    이름이 나오는지만 본다. 그 검사는 표 이름 한 번만 나와도 통과한다.
    **여기서는 무엇을 눌러봤는지까지 본다.**

    막는 것과 여는 것을 모두 쓴다. (보안 원칙 6)
  */
  for (const number of [131, 132, 133, 134, 135, 136, 137, 138]) {
    assert.ok(
      isolation.includes(`검사 ${number} 실패`),
      `003에 검사 ${number}이 없다`,
    );
  }

  // 여는 쪽 검사가 있는지. 막는 것만 있으면 과잉 차단을 놓친다.
  assert.ok(
    isolation.includes("132. 소유자는 공개를 켤 수 있고"),
    "공개를 켤 수 있는지 보는 검사가 없다",
  );
  assert.ok(
    isolation.includes("136. 본인은 자기 공개 내역을 꺼진 것까지 본다"),
    "공개 내역을 읽을 수 있는지 보는 검사가 없다",
  );
});

test("003 결과 표가 지금 공개 중인 것을 센다", () => {
  /*
    **이 칸이 0이 아니면 지금 로그인 없이 열리는 주소가 있다는 뜻이다.**
    돌릴 때마다 보는 칸이고, 그래서 이름이 그것을 말해야 한다.
    (VERIFICATION 4-30절)
  */
  assert.ok(isolation.includes("as 지금_공개중"));
  assert.ok(isolation.includes("as 공개_켠_적_있음"));
});
