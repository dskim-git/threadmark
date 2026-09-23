/**
 * 논문 검색 사이트 바로가기 단위 검사. (설계 문서 8.5절)
 *
 * 여기서 지키는 것은 하나다. **검색어가 주소를 망가뜨리지 않는다.**
 * 한글과 공백이 그대로 들어가면 주소가 깨지고, `&`나 `=`가 들어가면
 * 주소의 다른 부분으로 읽힌다. 둘 다 사용자는 "왜 엉뚱한 게 나오지"만 본다.
 *
 * 주소 자체는 각 사이트가 정한 것이라 우리가 검사할 수 없다.
 * 2026-09-23에 여덟 곳 모두 응답을 확인했고, 바뀌면 검색어 없이 열린다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SEARCH_SITES,
  buildSearchUrl,
  isUsableQuery,
  needsClipboard,
} from "../src/lib/papers/search-sites.ts";

test("설계 문서 8.5절이 지목한 여덟 곳이 모두 있다", () => {
  const ids = SEARCH_SITES.map((site) => site.id);

  for (const expected of [
    "kci",
    "riss",
    "dbpia",
    "scienceon",
    "scholar",
    "eric",
    "crossref",
    "openalex",
  ]) {
    assert.ok(ids.includes(expected), `${expected}가 빠졌다`);
  }
});

test("모든 주소가 https다", () => {
  // 검색어가 평문으로 흘러가지 않게 한다.
  for (const site of SEARCH_SITES) {
    assert.ok(
      site.template.startsWith("https://"),
      `${site.id}가 https가 아니다`,
    );
  }
});

test("주소로 검색어를 넘기는 곳에는 검색어 자리가 있다", () => {
  for (const site of SEARCH_SITES) {
    if (needsClipboard(site)) {
      continue;
    }

    assert.ok(site.template.includes("{q}"), `${site.id}에 검색어 자리가 없다`);
  }
});

test("복사해서 여는 곳의 주소에는 검색어 자리가 없다", () => {
  /*
    있으면 안 된다. 검색 화면 주소일 뿐이다.
    자리를 남겨두면 언젠가 거기에 검색어를 넣게 되고, 그 사이트는 그것을
    무시한 채 빈 화면을 준다. 사용자는 우리 기능이 고장 난 줄 안다.
  */
  for (const site of SEARCH_SITES) {
    if (!needsClipboard(site)) {
      continue;
    }

    assert.ok(
      !site.template.includes("{q}"),
      `${site.id}는 복사해서 여는 곳인데 검색어 자리가 있다`,
    );
  }
});

test("주소로 검색어를 받지 않는 곳이 그대로 표시되어 있다", () => {
  /*
    2026-09-23에 브라우저에서 하나씩 눌러보고 정한 목록이다.

    이 검사가 있는 이유는 되돌림을 막기 위해서다. 서버에서 받아보면
    이 넷도 200을 주고, RISS는 검색어가 여섯 번 나오기까지 한다.
    그것만 보고 "되는데 왜 복사로 해놨지" 하고 바꾸면 조용히 망가진다.

    바꾸려면 브라우저에서 눌러보고 바꾼다. 서버 응답으로 판단하지 않는다.
  */
  for (const id of ["kci", "riss", "crossref", "scienceon"]) {
    const site = SEARCH_SITES.find((entry) => entry.id === id);

    assert.equal(needsClipboard(site), true, `${id}는 복사해서 열어야 한다`);
  }
});

test("주소로 검색어를 받는 곳이 그대로 표시되어 있다", () => {
  for (const id of ["dbpia", "scholar", "eric", "openalex"]) {
    const site = SEARCH_SITES.find((entry) => entry.id === id);

    assert.equal(needsClipboard(site), false, `${id}는 주소로 열어야 한다`);
  }
});

test("한글 검색어를 인코딩한다", () => {
  const riss = SEARCH_SITES.find((site) => site.id === "dbpia");
  const url = buildSearchUrl(riss, "수학교육");

  assert.ok(!url.includes("수학교육"), "한글이 날것으로 들어갔다");
  assert.ok(url.includes("%EC%88%98%ED%95%99"));
});

test("공백을 인코딩한다", () => {
  const scholar = SEARCH_SITES.find((site) => site.id === "scholar");
  const url = buildSearchUrl(scholar, "math education");

  assert.ok(!url.includes(" "));
  assert.ok(url.includes("math%20education"));
});

test("검색어의 &와 =가 주소를 망가뜨리지 않는다", () => {
  // 인코딩하지 않으면 뒷부분이 다른 파라미터로 읽힌다.
  const eric = SEARCH_SITES.find((site) => site.id === "eric");
  const url = buildSearchUrl(eric, "a&b=c");

  assert.ok(url.endsWith("a%26b%3Dc"));
});

test("검색어의 앞뒤 공백은 떼고 넣는다", () => {
  const dbpia = SEARCH_SITES.find((site) => site.id === "dbpia");

  assert.equal(
    buildSearchUrl(dbpia, "  오류  "),
    buildSearchUrl(dbpia, "오류"),
  );
});

test("두 글자 미만이면 쓸 수 없는 검색어로 본다", () => {
  // 검색어 없이 열어봐야 그 사이트의 빈 화면이 뜰 뿐이다.
  assert.equal(isUsableQuery(""), false);
  assert.equal(isUsableQuery(" 가 "), false);
  assert.equal(isUsableQuery("오류"), true);
});

test("국내와 국제가 모두 있다", () => {
  // 한글로 찾을 수 있는 곳이 국내뿐이라 나눠 보여준다.
  assert.ok(SEARCH_SITES.some((site) => site.korean));
  assert.ok(SEARCH_SITES.some((site) => !site.korean));
});

test("사이트 식별자가 겹치지 않는다", () => {
  const ids = SEARCH_SITES.map((site) => site.id);

  assert.equal(new Set(ids).size, ids.length);
});
