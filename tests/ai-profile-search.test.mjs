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
import test from "node:test";

import {
  PROFILE_SEARCH_TARGETS,
  summarizeProfile,
} from "../src/lib/ai/profile-search.ts";

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
