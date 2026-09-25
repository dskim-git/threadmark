/**
 * 딸린 정보 표를 뒤지는 목록의 단위 검사. (2026-09-25, 사용자가 찾음)
 *
 * **담아둔 것의 절반쯤을 검색이 못 보고 있었다.** 가수 이름, 장르, 배우,
 * 학술지, 채널 이름, 그리고 **자기가 왜 그 책을 골랐는지 쓴 글**까지.
 *
 * 이 목록이 뒤처지면 새로 만든 표가 또 검색 밖으로 나간다. 여기서 붙잡는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PROFILE_SEARCH_TARGETS,
  matchedProfileText,
  summarizeProfile,
} from "../src/lib/search/profile-targets.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

/**
 * 마이그레이션이 만든 딸린 정보 표 전부.
 *
 * 손으로 적은 목록과 견주지 않고 **마이그레이션에서 직접 뽑는다.** 손으로
 * 적은 목록은 그 자체가 뒤처질 수 있는 또 하나의 자리다. `PROTECTED_TABLES`가
 * 두 번 뒤처졌던 것이 그것이다. (`migration-invariants.test.mjs`)
 *
 * `_profiles`로 끝나는 표만 본다. 사용자 계정인 `profiles`는 딸린 정보가
 * 아니라 사람 자신이고, 이름이 `_profiles`로 끝나지 않아 걸리지 않는다.
 */
const profileTables = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .flatMap((name) => [
    ...readFileSync(path.join(migrationsDir, name), "utf8").matchAll(
      /create table if not exists public\.(\w+_profiles)/g,
    ),
  ])
  .map((match) => match[1]);

// -----------------------------------------------------------------------------
// 뒤질 곳 목록
// -----------------------------------------------------------------------------

test("사용자가 직접 쓴 글을 빠뜨리지 않는다", () => {
  /*
    **이것이 가장 아팠던 자리다.** `why_chosen`과 `verdict`는 밖에서 받아온
    값이 아니라 사용자가 쓴 글인데, 검색이 한 번도 본 적이 없었다.
  */
  const book = PROFILE_SEARCH_TARGETS.find(
    (target) => target.table === "book_profiles",
  );

  assert.ok(book, "책 정보가 목록에 있어야 한다");
  assert.ok(book.text.includes("why_chosen"));
  assert.ok(book.text.includes("verdict"));
});

test("사람이 그 말로 기억하는 것들이 들어 있다", () => {
  const byTable = new Map(
    PROFILE_SEARCH_TARGETS.map((target) => [target.table, target]),
  );

  // 가수 이름으로 찾는 일이 가장 흔하다.
  assert.ok(byTable.get("music_profiles")?.text.includes("artist"));
  // 장르와 배우는 배열이라 낱말이 통째로 같은지로 찾는다.
  assert.ok(byTable.get("media_profiles")?.arrays.includes("genres"));
  assert.ok(byTable.get("media_profiles")?.arrays.includes("cast_names"));
  assert.ok(byTable.get("youtube_profiles")?.text.includes("channel_name"));
  assert.ok(byTable.get("paper_profiles")?.text.includes("journal_name"));
});

test("사람이 그 값으로 찾지 않는 것은 넣지 않는다", () => {
  /*
    날짜와 식별자는 뺐다. 숫자가 우연히 걸려 엉뚱한 것이 딸려 온다.
    `2024`로 찾으면 2024년에 나온 것이 전부 나오는 식이다.
  */
  const banned = [
    "released_on",
    "published_at",
    "published_on",
    "started_on",
    "finished_on",
    "isbn10",
    "isbn13",
    "video_id",
    "favicon_url",
    "watch_link",
    "page_range",
    "volume",
    "issue",
  ];

  for (const target of PROFILE_SEARCH_TARGETS) {
    for (const column of [...target.text, ...target.arrays]) {
      assert.ok(
        !banned.includes(column),
        `${target.table}.${column}은 사람이 찾는 값이 아니다`,
      );
    }
  }
});

test("표마다 뒤질 칸이 하나라도 있다", () => {
  // 칸이 없는 표가 목록에 있으면 질의만 늘고 얻는 것이 없다.
  for (const target of PROFILE_SEARCH_TARGETS) {
    assert.ok(
      target.text.length + target.arrays.length > 0,
      `${target.table}에 뒤질 칸이 없다`,
    );
  }
});

/**
 * 딸린 정보 표가 늘면 이 목록도 따라오는가.
 *
 * **오늘 이 구멍을 사용자가 찾았다.** (2026-09-25) 검사가 아니라 사람이
 * 쓰다가 찾았고, 그때는 목록 자체가 없어서 딸린 정보 표가 통째로 검색 밖에
 * 있었다. 목록을 만들었으니 이제 남은 위험은 **다음 표가 여기 안 들어오는
 * 것**이다.
 *
 * 그 자리는 조용하다. 표를 만들고 여기에 안 더해도 오류가 나지 않고, 검색이
 * 결과를 덜 돌려줄 뿐이다. **덜 나오는 것은 틀린 것처럼 보이지 않는다.**
 * 사용자는 그런 자료를 담은 적이 없다고 생각한다.
 *
 * 같은 이유로 `PROTECTED_TABLES`가 두 번 뒤처졌다. 세 번째도 잊는다.
 * **말로 적은 약속은 잊히고 검사로 적은 약속은 잊히지 않는다.**
 */
test("딸린 정보 표가 빠짐없이 목록에 있다", () => {
  /*
    **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절)

    아래 검사는 마이그레이션에서 뽑은 목록을 훑는다. 정규식이 어긋나
    아무것도 못 뽑으면 **빈 목록을 훑으면서 조용히 통과한다.** 검사가
    있는데 아무것도 안 하는 상태가 가장 나쁘다. 09-24에 음악 바로가기
    검사가 그렇게 되었다.

    그래서 뽑은 것이 있는지를 먼저 본다. 지금 일곱이다.
  */
  assert.ok(
    profileTables.length >= 7,
    `마이그레이션에서 딸린 정보 표를 못 뽑았다. 이 검사가 헛돌고 있다: ${profileTables.join(", ")}`,
  );

  const listed = new Set(PROFILE_SEARCH_TARGETS.map((target) => target.table));

  const missing = profileTables.filter((table) => !listed.has(table));

  assert.deepEqual(
    missing,
    [],
    `이 표가 PROFILE_SEARCH_TARGETS에 없다. 담긴 글을 검색이 보지 못한다: ${missing.join(", ")}`,
  );
});

test("마이그레이션에 없는 표를 뒤지지 않는다", () => {
  /*
    반대쪽도 조인다. 표 이름을 잘못 적거나 지운 표를 목록에 남겨두면
    그 질의는 **매번 실패하고 결과만 조용히 줄어든다.** 부르는 쪽이
    실패한 질의를 건너뛰기 때문에 화면에는 아무 말도 뜨지 않는다.
  */
  const made = new Set(profileTables);

  const unknown = PROFILE_SEARCH_TARGETS.map((target) => target.table).filter(
    (table) => !made.has(table),
  );

  assert.deepEqual(
    unknown,
    [],
    `마이그레이션이 만들지 않은 표를 뒤지려 한다: ${unknown.join(", ")}`,
  );
});

test("같은 표를 두 번 적지 않는다", () => {
  const names = PROFILE_SEARCH_TARGETS.map((target) => target.table);

  assert.equal(new Set(names).size, names.length);
});

// -----------------------------------------------------------------------------
// 걸린 값을 한 줄로 만들기
// -----------------------------------------------------------------------------

test("걸린 값들을 가운뎃점으로 잇는다", () => {
  const line = summarizeProfile({
    source_id: "지워져야 한다",
    artist: "아이유",
    album_name: "Palette",
  });

  assert.equal(line, "아이유 · Palette");
});

test("자료 번호는 넣지 않는다", () => {
  // 사람이 읽을 줄이다. uuid가 섞이면 읽히지 않는다.
  const line = summarizeProfile({ source_id: "abc-123", artist: "아이유" });

  assert.ok(!line.includes("abc-123"));
});

test("배열은 펼쳐서 잇는다", () => {
  const line = summarizeProfile({
    source_id: "x",
    genres: ["범죄", "드라마"],
    cast_names: ["브라이언 크랜스턴"],
  });

  assert.equal(line, "범죄 · 드라마 · 브라이언 크랜스턴");
});

test("비어 있는 값은 넣지 않는다", () => {
  const line = summarizeProfile({
    source_id: "x",
    artist: "아이유",
    album_name: null,
    composer: "   ",
    genres: [],
  });

  assert.equal(line, "아이유");
});

test("담긴 것이 없으면 빈 글자다", () => {
  // 그때는 부르는 쪽이 아무것도 붙이지 않는다.
  assert.equal(summarizeProfile({ source_id: "x", artist: null }), "");
});

// -----------------------------------------------------------------------------
// 두 검색이 같은 곳을 뒤지는가 (2026-09-26)
// -----------------------------------------------------------------------------

test("글자로 찾기도 이 목록을 본다", () => {
  /*
    **2026-09-26에 여기가 갈려 있었다.** 이 목록을 만들 때는 `AI에게
    물어보기`만 썼고, `글자로 찾기`는 자료 제목과 기록 글만 보고 있었다.

    그래서 AI에게 물으면 가수 이름으로 찾아주는데 글자로 찾기는 못 찾았다.
    **같은 앱 안에서 찾는 힘이 둘로 갈려 있었고**, 사용법은 오히려 글자로
    찾기가 "빠르고 돈이 들지 않는다"고 권하고 있었다.

    9월 25일에 사용자가 찾은 고장이 **한쪽에만 남아 있던 것**이다.
    고칠 곳이 여럿일 때 한 곳만 고치면 이렇게 된다.

    두 검색이 이 목록을 부르는지 글자로 확인한다. 한쪽이 자기 목록을
    따로 만들면 또 갈린다.
  */
  const users = [
    path.join(repoRoot, "src", "lib", "ai", "candidates.ts"),
    path.join(repoRoot, "src", "lib", "search", "queries.ts"),
  ];

  for (const file of users) {
    const source = readFileSync(file, "utf8");

    assert.ok(
      source.includes("PROFILE_SEARCH_TARGETS"),
      `${path.basename(file)}가 뒤질 곳 목록을 보지 않는다. 두 검색이 갈린다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 왜 걸렸는지
// -----------------------------------------------------------------------------

test("찾는 말이 든 값만 까닭으로 고른다", () => {
  /*
    `성수동`으로 찾았는데 `블루보틀`이 나오면 왜 나왔는지 알 수 없다.
    주소는 목록 어디에도 보이지 않아서, 적지 않으면 엉뚱한 것이 섞였다고
    여기게 된다.
  */
  const why = matchedProfileText(
    {
      source_id: "s1",
      road_address: "서울 성동구 성수이로 66",
      address: "서울 성동구 성수동2가 302-9",
      category: "카페",
    },
    "성수",
  );

  assert.ok(why.includes("성수이로 66"));
  assert.ok(why.includes("성수동2가"));
  assert.ok(!why.includes("카페"));
});

test("자료 번호는 까닭에 넣지 않는다", () => {
  // 번호가 우연히 찾는 말을 담을 수 있다. 사람에게 보여줄 까닭이 아니다.
  const why = matchedProfileText(
    { source_id: "abc-1234", artist: "아이유" },
    "abc",
  );

  assert.equal(why, null);
});

test("배열 칸에서 걸린 것도 까닭이 된다", () => {
  const why = matchedProfileText(
    { source_id: "s1", genres: ["범죄", "스릴러"], cast_names: ["송강호"] },
    "스릴러",
  );

  assert.equal(why, "스릴러");
});

test("대소문자가 달라도 걸린 것으로 본다", () => {
  const why = matchedProfileText(
    { source_id: "s1", channel_name: "Veritasium" },
    "veritas",
  );

  assert.equal(why, "Veritasium");
});

test("걸린 것이 없으면 지어내지 않는다", () => {
  /*
    **아무 값이나 골라 보여주면 엉뚱한 까닭을 말하게 된다.** 데이터베이스와
    여기의 견주는 방식이 어긋나면 그럴 수 있고, 그때는 아무 말도 안 하는
    편이 낫다.
  */
  assert.equal(
    matchedProfileText({ source_id: "s1", artist: "아이유" }, "김광석"),
    null,
  );
  assert.equal(matchedProfileText({ source_id: "s1" }, "무엇"), null);
  assert.equal(matchedProfileText({ artist: "아이유" }, "  "), null);
});

test("빈 값과 공백만 든 값은 까닭이 되지 않는다", () => {
  // 밖에서 받아온 값에는 빈 글자가 섞인다. 까닭 자리에 빈 줄이 뜨면 고장처럼 보인다.
  assert.equal(
    matchedProfileText({ source_id: "s1", publisher: "   ", verdict: "" }, " "),
    null,
  );
});
