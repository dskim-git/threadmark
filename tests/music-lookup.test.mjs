/**
 * 음악 정보 찾아오기 단위 검사. (설계 문서 13.3절, 13.3-1절)
 *
 * 두 가지를 지킨다.
 *
 * **1. 칸을 나눠 묻는다.** 처음에 `아이유 밤편지`처럼 뭉뚱그려 물었더니
 * `붉은 노을 이문세`에 MC 스나이퍼의 판이 오고 `BTS Dynamite`에 남이 부른
 * 커버가 왔다. `recording:"밤편지"`처럼 나눠 묻자 한글 제목이 그대로 나왔다.
 *
 * **2. 받아온 JSON을 믿지 않는다.** 밖에서 온 값이라 모양을 알 수 없다.
 * 하나라도 던지면 후보 목록이 통째로 안 그려진다. 아래 검사에 쓰는 값은
 * 실제로 두 곳에서 받아본 응답의 모양을 그대로 옮긴 것이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  readItunesCandidates,
  readMusicBrainzCandidates,
  sortCandidates,
} from "../src/lib/music/candidates.ts";
import {
  MUSIC_SEARCH_SITES,
  buildSearchTerm,
  buildSearchUrl,
} from "../src/lib/music/search-links.ts";
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  buildItunesTerm,
  buildRecordingQuery,
  checkLookupInput,
  escapeLucene,
} from "../src/lib/music/lookup-query.ts";

// -----------------------------------------------------------------------------
// 검색어 만들기
// -----------------------------------------------------------------------------

test("칸을 나눠 묻는다", () => {
  assert.equal(
    buildRecordingQuery("밤편지", null),
    'recording:"밤편지"',
  );
  assert.equal(
    buildRecordingQuery("주저하는 연인들을 위해", "잔나비"),
    'recording:"주저하는 연인들을 위해" AND artist:"잔나비"',
  );
});

test("제목을 따옴표로 묶는다", () => {
  /*
    묶지 않으면 `주저하는 연인들을 위해`가 낱말 넷으로 쪼개져, 그중 하나만
    맞는 곡까지 잔뜩 온다.
  */
  assert.ok(buildRecordingQuery("주저하는 연인들을 위해", null).includes('"주저하는 연인들을 위해"'));
});

test("Lucene이 뜻으로 읽는 글자를 막는다", () => {
  /*
    제목에 `:`이 든 곡은 흔하다. 그대로 넘기면 그 콜론이 칸 이름을 가리키는
    글자로 읽혀 검색이 깨지거나 엉뚱한 조건이 된다.
  */
  assert.equal(escapeLucene("Track 1: Intro"), "Track 1\\: Intro");
  assert.equal(escapeLucene('He said "hi"'), 'He said \\"hi\\"');
  assert.equal(escapeLucene("AC/DC"), "AC\\/DC");
  assert.equal(escapeLucene("a+b-c"), "a\\+b\\-c");
  assert.equal(escapeLucene("(Live)"), "\\(Live\\)");
});

test("한글과 보통의 글자는 건드리지 않는다", () => {
  assert.equal(escapeLucene("주저하는 연인들을 위해"), "주저하는 연인들을 위해");
  assert.equal(escapeLucene("Dynamite"), "Dynamite");
});

test("특수 글자가 든 제목도 질의가 깨지지 않는다", () => {
  const query = buildRecordingQuery('Track 1: "Intro"', null);

  // 따옴표가 짝이 맞아야 한다. 안쪽 따옴표는 모두 막혀 있다.
  assert.equal(query.match(/(?<!\\)"/gu).length, 2);
});

test("iTunes에는 낱말을 붙여 낸다", () => {
  assert.equal(buildItunesTerm("밤편지", "아이유"), "밤편지 아이유");
  assert.equal(buildItunesTerm("밤편지", null), "밤편지");
});

// -----------------------------------------------------------------------------
// 입력 확인
// -----------------------------------------------------------------------------

test("제목이 너무 짧으면 묻지 않는다", () => {
  // 한 글자로 물으면 아무 곡이나 온다.
  const result = checkLookupInput("밤", null);

  assert.equal(result.ok, false);

  assert.equal(checkLookupInput("밤편", null).ok, true);
  assert.equal(MIN_QUERY_LENGTH, 2);
});

test("아티스트는 없어도 된다", () => {
  /*
    `밤편지`만으로 찾힌다. 오히려 `아이유`를 넣으면 못 찾는다.
    MusicBrainz에 그 이름이 `IU`로 올라가 있다.
  */
  const result = checkLookupInput("밤편지", "");

  assert.equal(result.ok, true);
  assert.equal(result.artist, null);
});

test("앞뒤와 가운데 공백을 정리한다", () => {
  const result = checkLookupInput("  밤편지  ", "  아이유  ");

  assert.equal(result.title, "밤편지");
  assert.equal(result.artist, "아이유");
});

test("너무 긴 검색어를 받지 않는다", () => {
  const long = "가".repeat(MAX_QUERY_LENGTH + 1);

  assert.equal(checkLookupInput(long, null).ok, false);
});

test("글자가 아닌 값을 받지 않는다", () => {
  for (const value of [undefined, null, 123, {}, []]) {
    assert.equal(checkLookupInput(value, null).ok, false, JSON.stringify(value));
  }
});

// -----------------------------------------------------------------------------
// MusicBrainz 응답 읽기
// -----------------------------------------------------------------------------

/** 실제로 받아본 모양을 그대로 옮긴 것이다. */
const MB_PAYLOAD = {
  recordings: [
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      score: 100,
      title: "주저하는 연인들을 위해",
      length: 265000,
      "artist-credit": [{ name: "잔나비" }],
      releases: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          title: "LEGEND",
          date: "2019-03-13",
        },
      ],
    },
  ],
};

test("한글 제목과 아티스트를 그대로 읽는다", () => {
  const [candidate] = readMusicBrainzCandidates(MB_PAYLOAD);

  assert.equal(candidate.source, "musicbrainz");
  assert.equal(candidate.title, "주저하는 연인들을 위해");
  assert.equal(candidate.artist, "잔나비");
  assert.equal(candidate.albumName, "LEGEND");
  assert.equal(candidate.releasedOn, "2019-03-13");
  assert.equal(candidate.durationSeconds, 265);
  assert.equal(candidate.score, 100);
});

test("표지 주소를 판 id로 만든다", () => {
  const [candidate] = readMusicBrainzCandidates(MB_PAYLOAD);

  assert.ok(candidate.artworkUrl.startsWith("https://coverartarchive.org/release/"));
  assert.ok(candidate.artworkUrl.includes("11111111-2222-3333-4444-555555555555"));
});

test("아티스트가 여럿이면 쉼표로 이어 적는다", () => {
  const [candidate] = readMusicBrainzCandidates({
    recordings: [
      {
        id: "x",
        title: "붉은 노을",
        "artist-credit": [
          { name: "MC 스나이퍼" },
          { name: "김지수" },
          { artist: { name: "Egobomb" } },
        ],
      },
    ],
  });

  assert.equal(candidate.artist, "MC 스나이퍼, 김지수, Egobomb");
});

test("없는 값을 지어내지 않는다", () => {
  // 검색 응답에는 트랙 번호가 없다. 장르도 잘 오지 않는다.
  const [candidate] = readMusicBrainzCandidates({
    recordings: [{ id: "x", title: "밤편지", "artist-credit": [{ name: "IU" }] }],
  });

  assert.equal(candidate.trackNumber, null);
  assert.equal(candidate.genre, null);
  assert.equal(candidate.albumName, null);
  assert.equal(candidate.releasedOn, null);
  assert.equal(candidate.durationSeconds, null);
  assert.equal(candidate.artworkUrl, null);
});

// -----------------------------------------------------------------------------
// iTunes 응답 읽기
// -----------------------------------------------------------------------------

const ITUNES_PAYLOAD = {
  resultCount: 1,
  results: [
    {
      trackId: 1213767479,
      trackName: "Through the Night",
      artistName: "IU",
      collectionName: "Through the Night - Single",
      collectionArtistName: "IU",
      releaseDate: "2017-03-24T07:00:00Z",
      trackNumber: 1,
      trackTimeMillis: 253000,
      primaryGenreName: "K-Pop",
      artworkUrl100: "https://is1.mzstatic.com/image/thumb/abc/100x100bb.jpg",
    },
  ],
};

test("iTunes 응답을 읽는다", () => {
  const [candidate] = readItunesCandidates(ITUNES_PAYLOAD);

  assert.equal(candidate.source, "itunes");
  assert.equal(candidate.title, "Through the Night");
  assert.equal(candidate.artist, "IU");
  assert.equal(candidate.genre, "K-Pop");
  assert.equal(candidate.trackNumber, 1);
  assert.equal(candidate.durationSeconds, 253);
});

test("발매일에서 시각을 뗀다", () => {
  // 발매일에 시각은 뜻이 없다.
  const [candidate] = readItunesCandidates(ITUNES_PAYLOAD);

  assert.equal(candidate.releasedOn, "2017-03-24");
});

test("표지를 큰 그림으로 바꿔 받는다", () => {
  const [candidate] = readItunesCandidates(ITUNES_PAYLOAD);

  assert.ok(candidate.artworkUrl.includes("300x300"));
});

test("http가 아닌 그림 주소는 담지 않는다", () => {
  const [candidate] = readItunesCandidates({
    results: [
      {
        trackName: "x",
        artworkUrl100: "javascript:alert(1)",
      },
    ],
  });

  assert.equal(candidate.artworkUrl, null);
});

// -----------------------------------------------------------------------------
// 이상한 응답
// -----------------------------------------------------------------------------

test("응답이 이상해도 터지지 않는다", () => {
  for (const payload of [
    undefined,
    null,
    {},
    "문자열",
    123,
    [],
    { recordings: null },
    { recordings: "x" },
    { results: {} },
    { recordings: [null, 1, "x", {}] },
    { results: [null, {}, { trackName: 123 }] },
  ]) {
    assert.deepEqual(readMusicBrainzCandidates(payload), [], JSON.stringify(payload));
    assert.deepEqual(readItunesCandidates(payload), [], JSON.stringify(payload));
  }
});

test("제목이 없는 줄은 버린다", () => {
  // 제목이 없으면 화면에 무엇으로 보여줄지 정할 수 없다.
  assert.equal(
    readMusicBrainzCandidates({ recordings: [{ id: "x" }, { id: "y", title: "밤편지" }] })
      .length,
    1,
  );
});

test("터무니없는 트랙 번호를 버린다", () => {
  const [candidate] = readItunesCandidates({
    results: [{ trackName: "x", trackNumber: 99999 }],
  });

  assert.equal(candidate.trackNumber, null);
});

// -----------------------------------------------------------------------------
// 늘어놓는 순서
// -----------------------------------------------------------------------------

test("MusicBrainz를 앞에, 정확도 높은 것부터 늘어놓는다", () => {
  /*
    한글 이름을 그대로 주는 쪽이 먼저 보여야 한다. iTunes는 표지와 장르를
    보태려고 있는 것이고 이름은 대개 영문이라 먼저 눌리면 안 된다.
  */
  const sorted = sortCandidates([
    { source: "itunes", key: "i1", title: "Through the Night", score: null },
    { source: "musicbrainz", key: "m1", title: "밤편지", score: 80 },
    { source: "musicbrainz", key: "m2", title: "밤편지 (Live)", score: 100 },
  ]);

  assert.deepEqual(
    sorted.map((c) => c.key),
    ["m2", "m1", "i1"],
  );
});

test("늘어놓기가 원래 목록을 고치지 않는다", () => {
  const original = [
    { source: "itunes", key: "i1", score: null },
    { source: "musicbrainz", key: "m1", score: 100 },
  ];

  sortCandidates(original);

  assert.equal(original[0].key, "i1");
});

// -----------------------------------------------------------------------------
// 재생 링크와 검색 바로가기
// -----------------------------------------------------------------------------

test("iTunes 후보에 재생 링크가 담긴다", () => {
  const [candidate] = readItunesCandidates({
    results: [
      {
        trackName: "Through the Night",
        trackViewUrl: "https://music.apple.com/us/album/x/1?i=2&uo=4",
      },
    ],
  });

  assert.equal(candidate.listenUrl, "https://music.apple.com/us/album/x/1?i=2&uo=4");
});

test("재생 링크도 http만 받는다", () => {
  const [candidate] = readItunesCandidates({
    results: [{ trackName: "x", trackViewUrl: "javascript:alert(1)" }],
  });

  assert.equal(candidate.listenUrl, null);
});

test("MusicBrainz 후보에는 재생 링크가 없다", () => {
  /*
    한국 곡에 서비스 링크가 거의 채워져 있지 않다. 녹음과 판 양쪽에
    inc=url-rels로 물어봤고 둘 다 0개였다. 빈 결과를 받으려고 요청을
    한 번 더 보내지 않는다. (13.3-1절)
  */
  const [candidate] = readMusicBrainzCandidates({
    recordings: [{ id: "x", title: "밤편지" }],
  });

  assert.equal(candidate.listenUrl, null);
});

test("검색어는 곡 이름과 아티스트를 붙인다", () => {
  // 둘을 함께 넣어야 같은 제목의 다른 곡이 섞이지 않는다.
  assert.equal(buildSearchTerm("밤편지", "아이유"), "밤편지 아이유");
  assert.equal(buildSearchTerm("밤편지", null), "밤편지");
  assert.equal(buildSearchTerm("밤편지", "   "), "밤편지");
});

test("확인하지 않은 곳은 검색 화면만 연다", () => {
  /*
    검색어를 주소로 넘길 수 있는지는 사람이 브라우저에서 눌러봐야 안다.
    8.5절에서 두 번 틀렸다. 확인 전에는 `copy`로 두어 클립보드에 복사하고
    검색 화면만 연다. 어느 사이트에서도 틀리지 않는 방식이다.

    **지어낸 곳으로 확인한다.** 2026-09-24에 일곱 곳을 모두 확인해 `copy`인
    곳이 하나도 남지 않았다. 실제 목록만 훑으면 이 검사는 아무것도 하지
    않으면서 통과한다. 그러면 다음에 사이트를 더할 때 그 출발점이 성한지
    아무도 모른다. `link` 쪽 검사가 이미 같은 방식으로 되어 있다.
  */
  const unverified = {
    id: "x",
    name: "x",
    mode: "copy",
    queryTemplate: "https://example.com/search?q={q}",
    searchUrl: "https://example.com/",
    korean: false,
  };

  const url = buildSearchUrl(unverified, "밤편지", "아이유");

  assert.equal(url, unverified.searchUrl);
  assert.ok(!url.includes("%"), "검색어가 주소에 실려 있다");

  // 실제 목록에 `copy`가 남아 있다면 그것도 같은 규칙을 지켜야 한다.
  for (const site of MUSIC_SEARCH_SITES) {
    if (site.mode === "copy") {
      assert.equal(buildSearchUrl(site, "밤편지", "아이유"), site.searchUrl, site.id);
    }
  }
});

test("확인한 곳은 검색어 자리를 갖추고 있다", () => {
  /*
    2026-09-24에 사용자가 일곱 곳을 브라우저에서 눌러보고 `밤편지 아이유`로
    실제 검색되는 것을 확인했다. 그 결과가 코드에 남아 있는지 본다.

    주소가 정말 검색되는지는 여기서 확인할 수 없다. 그것은 사람이 눌러봐야
    안다. 여기서 보는 것은 **`link`라고 적어놓고 검색어를 안 싣는 일**이
    없는지다.
  */
  const verified = MUSIC_SEARCH_SITES.filter((site) => site.mode === "link");

  assert.ok(verified.length > 0, "확인한 곳이 하나도 없다");

  for (const site of verified) {
    const url = buildSearchUrl(site, "밤편지", "아이유");

    assert.ok(
      url.includes(encodeURIComponent("밤편지 아이유")),
      `${site.id}: link인데 검색어가 주소에 실리지 않는다`,
    );
    assert.notEqual(url, site.searchUrl, `${site.id}: 검색 화면만 연다`);
  }
});

test("확인한 곳은 검색어를 주소에 싣고 인코딩한다", () => {
  const site = {
    id: "x",
    name: "x",
    mode: "link",
    queryTemplate: "https://example.com/search?q={q}",
    searchUrl: "https://example.com/search",
    korean: false,
  };

  const url = buildSearchUrl(site, "밤편지", "아이유");

  // 한글과 공백이 그대로 들어가면 주소가 깨지거나 검색어가 잘린다.
  assert.ok(!url.includes(" "));
  assert.ok(url.includes(encodeURIComponent("밤편지 아이유")));
});

test("검색 바로가기 목록의 모양이 온전하다", () => {
  for (const site of MUSIC_SEARCH_SITES) {
    assert.ok(site.id.length > 0);
    assert.ok(site.name.length > 0);
    assert.ok(
      site.searchUrl.startsWith("https://"),
      `${site.id}: 검색 화면 주소가 https가 아니다`,
    );

    if (site.mode === "link") {
      assert.ok(
        site.queryTemplate?.includes("{q}"),
        `${site.id}: link인데 검색어 자리가 없다`,
      );
    }
  }
});
