/**
 * 음악 서비스 링크 단위 검사. (설계 문서 13.2절, 13.6절)
 *
 * 13.6절이 정하고 있다. 음원 파일을 우리가 갖지 않고 공식 서비스의 링크만
 * 담는다. 그래서 확인할 것은 둘이다.
 *
 *   1. 이 주소가 링크로 쓸 만한가
 *   2. 어느 서비스인지 알아보는가
 *
 * 2번에 함정이 하나 있다. 끝이 맞는지 볼 때 점을 붙여 견주지 않으면
 * `notmelon.com`이 `melon.com`으로 읽힌다. 남이 만든 주소가 우리 이름표를
 * 달고 화면에 뜨게 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkProviderLink,
  describeProvider,
} from "../src/lib/music/providers.ts";

// -----------------------------------------------------------------------------
// 주소 확인
// -----------------------------------------------------------------------------

test("보통의 음악 서비스 주소를 받는다", () => {
  for (const input of [
    "https://open.spotify.com/track/abc123",
    "https://music.apple.com/kr/album/xyz/123",
    "https://www.melon.com/song/detail.htm?songId=1",
    "https://youtu.be/dQw4w9WgXcQ",
  ]) {
    const result = checkProviderLink(input);

    assert.equal(result.ok, true, input);
  }
});

test("스킴이 없으면 https를 붙인다", () => {
  const result = checkProviderLink("open.spotify.com/track/abc");

  assert.equal(result.ok, true);
  assert.ok(result.url.startsWith("https://"));
});

test("http와 https가 아니면 받지 않는다", () => {
  /*
    화면의 링크에 들어갈 값이다. `javascript:`가 거기 들어가면 누르는
    순간 실행된다. (설계 문서 11.3절과 같은 이유)
  */
  for (const input of [
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "file:///etc/passwd",
  ]) {
    const result = checkProviderLink(input);

    assert.equal(result.ok, false, input);
    assert.ok(result.message.length > 0);
  }
});

test("빈 값과 읽을 수 없는 값을 받지 않는다", () => {
  for (const input of ["", "   ", "h t t p", undefined, null, 123]) {
    const result = checkProviderLink(input);

    assert.equal(result.ok, false, JSON.stringify(input));
  }
});

test("너무 긴 주소를 받지 않는다", () => {
  const long = `https://example.com/${"a".repeat(2100)}`;

  assert.equal(checkProviderLink(long).ok, false);
});

// -----------------------------------------------------------------------------
// 어느 서비스인지
// -----------------------------------------------------------------------------

test("아는 서비스의 이름을 돌려준다", () => {
  const cases = [
    ["https://open.spotify.com/track/abc", "Spotify"],
    ["https://music.apple.com/kr/album/x", "Apple Music"],
    ["https://music.youtube.com/watch?v=x", "YouTube Music"],
    ["https://youtu.be/x", "YouTube"],
    ["https://www.melon.com/song/detail.htm", "멜론"],
    ["https://music.bugs.co.kr/track/1", "벅스"],
    ["https://www.genie.co.kr/detail/songInfo", "지니뮤직"],
    ["https://vibe.naver.com/track/1", "바이브"],
    ["https://soundcloud.com/artist/track", "SoundCloud"],
  ];

  for (const [url, label] of cases) {
    assert.equal(describeProvider(url), label, url);
  }
});

test("모르는 곳은 주소의 이름을 그대로 보여준다", () => {
  // 목록에 없다고 담지 못하게 하지 않는다. 국내 서비스는 자주 바뀐다.
  assert.equal(describeProvider("https://example.com/track"), "example.com");
  assert.equal(describeProvider("https://www.example.com/t"), "example.com");
});

test("비슷한 이름을 우리 것으로 읽지 않는다", () => {
  /*
    끝이 맞는지 볼 때 점을 붙여 견주지 않으면 `notmelon.com`이
    `melon.com`으로 읽힌다. 남이 만든 주소가 우리 이름표를 달고 뜬다.
  */
  assert.equal(describeProvider("https://notmelon.com/x"), "notmelon.com");
  assert.equal(describeProvider("https://fakeyoutu.be/x"), "fakeyoutu.be");
  assert.equal(describeProvider("https://myspotify.com/x"), "myspotify.com");
});

test("하위 도메인은 그 서비스로 읽는다", () => {
  assert.equal(describeProvider("https://kr.melon.com/x"), "멜론");
});

test("대문자와 끝점을 정리한다", () => {
  assert.equal(describeProvider("https://OPEN.SPOTIFY.COM/track/a"), "Spotify");
  assert.equal(describeProvider("https://open.spotify.com./track/a"), "Spotify");
});

test("읽을 수 없는 주소에도 이름을 돌려준다", () => {
  // 여기서 던지면 목록 하나가 통째로 안 그려진다.
  assert.equal(describeProvider("가나다"), "링크");
  assert.equal(describeProvider(""), "링크");
});

test("확인한 결과에 서비스 이름이 함께 온다", () => {
  const result = checkProviderLink("https://open.spotify.com/track/abc");

  assert.equal(result.ok, true);
  assert.equal(result.label, "Spotify");
});
