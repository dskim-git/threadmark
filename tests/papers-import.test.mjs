/**
 * 서지 정보 가져오기 단위 검사. (설계 문서 8.5절)
 *
 * 두 가지를 지킨다.
 *
 * 하나, DOI는 찾거나 못 찾거나 둘 중 하나다. 어중간하게 찾은 척하지 않는다.
 * 잘린 DOI로 Crossref에 물으면 엉뚱한 논문이 오거나 아무것도 안 온다.
 *
 * 둘, Crossref가 돌려준 값에서 알아볼 수 없는 것은 담지 않는다.
 * 비어 있는 것과 틀린 것 중에서는 비어 있는 쪽이 낫다. 틀린 값은 그대로
 * 참고문헌에 실린다.
 *
 * 아래 응답 예시는 2026-09-23에 실제 Crossref 응답을 보고 만든 것이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  findDois,
  joinBrokenLines,
  mendBrokenTokens,
} from "../src/lib/papers/doi-scan.ts";
import {
  containsHangul,
  doiLookupUrl,
  mapCrossrefWork,
  readCrossrefAuthors,
  readCrossrefYear,
  stripJats,
  summarizeCandidate,
  titleSearchUrl,
} from "../src/lib/papers/crossref.ts";

/** 2026-09-23에 받아본 실제 응답의 모양. */
function crossrefWork(overrides = {}) {
  return {
    DOI: "10.1007/s10649-006-9028-2",
    title: ["Affect in Mathematics Education: An Introduction"],
    "container-title": ["Educational Studies in Mathematics"],
    volume: "63",
    issue: "2",
    page: "113-121",
    issued: { "date-parts": [[2006, 6, 20]] },
    "published-print": { "date-parts": [[2006, 10, 24]] },
    ISSN: ["0013-1954", "1573-0816"],
    language: "en",
    type: "journal-article",
    abstract: null,
    author: [
      { given: "Rosetta", family: "Zan", sequence: "first", affiliation: [] },
      { given: "Laurinda", family: "Brown", sequence: "additional" },
    ],
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 글에서 DOI 찾기
// -----------------------------------------------------------------------------

test("맨몸의 DOI를 찾는다", () => {
  assert.deepEqual(findDois("DOI 10.1007/s10649-006-9028-2 입니다"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("주소 형태 안의 DOI도 찾는다", () => {
  assert.deepEqual(findDois("https://doi.org/10.1007/s10649-006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("문장 끝 마침표를 DOI에 넣지 않는다", () => {
  // 넣으면 없는 DOI가 된다. Crossref가 아무것도 못 찾는다.
  assert.deepEqual(findDois("자세한 것은 10.1234/abcd. 를 보라"), [
    "10.1234/abcd",
  ]);
});

test("괄호 안의 DOI에서 닫는 괄호를 뗀다", () => {
  assert.deepEqual(findDois("(10.1234/abcd)"), ["10.1234/abcd"]);
});

test("DOI 안의 괄호 쌍은 지킨다", () => {
  // 일부 출판사가 괄호를 쓴다. 짝이 맞으면 DOI의 일부다.
  assert.deepEqual(findDois("10.1002/(sici)1099-0518"), [
    "10.1002/(sici)1099-0518",
  ]);
});

test("대문자 DOI는 소문자로 돌려준다", () => {
  assert.deepEqual(findDois("10.1007/S10649-006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("같은 DOI가 여러 번 나와도 한 번만 담는다", () => {
  const text = "10.1234/abcd 그리고 다시 10.1234/abcd";

  assert.deepEqual(findDois(text), ["10.1234/abcd"]);
});

test("여러 DOI를 나온 순서대로 담는다", () => {
  // 하나를 고르는 일은 여기서 하지 않는다. 사용자가 고른다.
  assert.deepEqual(findDois("10.1111/aaa 와 10.2222/bbb"), [
    "10.1111/aaa",
    "10.2222/bbb",
  ]);
});

test("DOI가 없으면 빈 목록이다", () => {
  assert.deepEqual(findDois("여기에는 아무것도 없습니다"), []);
});

test("등록기관 번호가 짧으면 DOI로 보지 않는다", () => {
  assert.deepEqual(findDois("10.12/abcd"), []);
});

test("슬래시 뒤가 비면 DOI로 보지 않는다", () => {
  assert.deepEqual(findDois("10.1234/"), []);
});

// -----------------------------------------------------------------------------
// 줄이 끊긴 PDF
// -----------------------------------------------------------------------------

test("공백 없이 끊긴 줄을 이어 붙인다", () => {
  // PDF는 긴 DOI를 아무 데서나 끊는다. 이어 붙이지 않으면 못 찾는다.
  assert.deepEqual(findDois("10.1007/s10649-\n006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("줄바꿈 하나로 끊긴 DOI를 찾는다", () => {
  assert.deepEqual(findDois("10.1007/\ns10649-006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("PDF가 공백으로 이어 붙인 DOI를 찾는다", () => {
  /*
    2026-09-23에 실제로 PDF에서 글자를 꺼내 보고 알게 된 것이다.
    PDF.js는 줄이 끊긴 자리를 줄바꿈이 아니라 공백으로 이어 붙인다.
    메우지 않으면 10.1007/s10649- 에서 끊긴 값을 얻는데, 그 값은
    그럴듯해 보이면서 어느 논문도 가리키지 않는다.
  */
  assert.deepEqual(findDois("doi:10.1007/s10649- 006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("빗금 뒤의 공백도 메운다", () => {
  assert.deepEqual(findDois("10.1007/ s10649-006-9028-2"), [
    "10.1007/s10649-006-9028-2",
  ]);
});

test("잘린 DOI와 온전한 DOI가 같이 나오면 온전한 것만 남긴다", () => {
  // 고르라고 물을 일이 아니다. 한쪽은 아무것도 가리키지 않는 값이다.
  const dois = findDois("10.1007/s10649- 006-9028-2");

  assert.equal(dois.length, 1);
  assert.equal(dois[0], "10.1007/s10649-006-9028-2");
});

test("빈틈 메우기는 붙임표와 빗금 뒤에만 한다", () => {
  assert.equal(mendBrokenTokens("앞 뒤"), "앞 뒤");
  assert.equal(mendBrokenTokens("pre- and"), "pre-and");
  assert.equal(mendBrokenTokens("끝. 다음"), "끝. 다음");
});

test("서로 다른 DOI는 둘 다 남긴다", () => {
  // 앞부분이 겹치지 않으면 잘린 것이 아니다.
  assert.deepEqual(findDois("10.1111/aaa 와 10.1111/aaab"), [
    "10.1111/aaab",
  ]);
  assert.deepEqual(findDois("10.1111/aaa 와 10.2222/bbb"), [
    "10.1111/aaa",
    "10.2222/bbb",
  ]);
});

test("공백이 있는 줄바꿈은 잇지 않는다", () => {
  // 원래 떨어져 있던 말이다. 이어 붙이면 없던 말이 생긴다.
  assert.equal(joinBrokenLines("앞 \n 뒤"), "앞 \n 뒤");
});

// -----------------------------------------------------------------------------
// Crossref 응답 읽기
// -----------------------------------------------------------------------------

test("실제 응답을 우리 모양으로 바꾼다", () => {
  const paper = mapCrossrefWork(crossrefWork());

  assert.equal(paper.title, "Affect in Mathematics Education: An Introduction");
  assert.equal(paper.journalName, "Educational Studies in Mathematics");
  assert.equal(paper.volume, "63");
  assert.equal(paper.issue, "2");
  assert.equal(paper.pageRange, "113-121");
  assert.equal(paper.publicationYear, 2006);
  assert.equal(paper.doi, "10.1007/s10649-006-9028-2");
  assert.equal(paper.originalLanguage, "en");
  assert.equal(paper.source, "crossref");
});

test("제목과 학술지명은 배열의 첫 번째를 쓴다", () => {
  const paper = mapCrossrefWork(
    crossrefWork({ title: ["첫 제목", "둘째 제목"] }),
  );

  assert.equal(paper.title, "첫 제목");
});

test("ISSN은 배열의 첫 번째만 담는다", () => {
  // 인쇄본과 온라인본이 같이 온다. 참고문헌에 하나만 적는다.
  const paper = mapCrossrefWork(crossrefWork());

  assert.equal(paper.issn, "0013-1954");
});

test("저자를 성과 이름으로 갈라 받는다", () => {
  // Crossref가 이미 갈라서 준다. 우리가 추측할 일이 없다.
  const paper = mapCrossrefWork(crossrefWork());

  assert.deepEqual(paper.authors, [
    { family: "Zan", given: "Rosetta" },
    { family: "Brown", given: "Laurinda" },
  ]);
});

test("기관 저자는 name으로 오고 family에 담긴다", () => {
  const authors = readCrossrefAuthors([
    { name: "한국교육과정평가원" },
    { given: "Daesoo", family: "Kim" },
  ]);

  assert.deepEqual(authors, [
    { family: "한국교육과정평가원" },
    { family: "Kim", given: "Daesoo" },
  ]);
});

test("이름이 없는 저자 항목은 버린다", () => {
  const authors = readCrossrefAuthors([
    { given: "Daesoo" },
    { family: "   " },
    { family: "Kim" },
  ]);

  assert.deepEqual(authors, [{ family: "Kim" }]);
});

test("저자가 배열이 아니면 빈 목록이다", () => {
  assert.deepEqual(readCrossrefAuthors(null), []);
  assert.deepEqual(readCrossrefAuthors("Kim"), []);
});

// -----------------------------------------------------------------------------
// 발행 연도
// -----------------------------------------------------------------------------

test("issued의 연도를 쓴다", () => {
  assert.equal(readCrossrefYear(crossrefWork()), 2006);
});

test("issued가 없으면 인쇄본 발행일을 본다", () => {
  const work = crossrefWork({ issued: undefined });

  assert.equal(readCrossrefYear(work), 2006);
});

test("날짜가 아예 없으면 null이다", () => {
  const work = crossrefWork({
    issued: undefined,
    "published-print": undefined,
    "published-online": undefined,
  });

  assert.equal(readCrossrefYear(work), null);
});

test("date-parts 모양이 깨지면 null이다", () => {
  assert.equal(readCrossrefYear({ issued: { "date-parts": [] } }), null);
  assert.equal(readCrossrefYear({ issued: { "date-parts": "2006" } }), null);
});

// -----------------------------------------------------------------------------
// 초록
// -----------------------------------------------------------------------------

test("초록에서 JATS 태그를 걷어낸다", () => {
  assert.equal(
    stripJats("<jats:p>학생의 오류는 중요하다.</jats:p>"),
    "학생의 오류는 중요하다.",
  );
});

test("태그를 지운 자리에 말이 붙지 않게 한다", () => {
  assert.equal(stripJats("<jats:p>앞</jats:p><jats:p>뒤</jats:p>"), "앞 뒤");
});

test("초록이 없으면 null이다", () => {
  const paper = mapCrossrefWork(crossrefWork({ abstract: null }));

  assert.equal(paper.abstract, null);
});

// -----------------------------------------------------------------------------
// 쓸 수 없는 응답
// -----------------------------------------------------------------------------

test("제목도 DOI도 없으면 받아들이지 않는다", () => {
  // "찾았다"고 해놓고 빈 칸을 주면 안 된다.
  assert.equal(mapCrossrefWork({ volume: "12" }), null);
});

test("객체가 아니면 받아들이지 않는다", () => {
  assert.equal(mapCrossrefWork(null), null);
  assert.equal(mapCrossrefWork("10.1234/abcd"), null);
});

test("모르는 언어는 비워둔다", () => {
  const paper = mapCrossrefWork(crossrefWork({ language: "fr" }));

  assert.equal(paper.originalLanguage, null);
});

test("한국어 논문의 언어를 읽는다", () => {
  const paper = mapCrossrefWork(crossrefWork({ language: "ko" }));

  assert.equal(paper.originalLanguage, "ko");
});

// -----------------------------------------------------------------------------
// 후보 요약과 주소
// -----------------------------------------------------------------------------

test("후보를 한 줄로 요약한다", () => {
  assert.equal(
    summarizeCandidate(mapCrossrefWork(crossrefWork())),
    "Zan, Brown · 2006 · Educational Studies in Mathematics",
  );
});

test("저자가 셋 이상이면 외로 줄인다", () => {
  const paper = mapCrossrefWork(
    crossrefWork({
      author: [
        { family: "Zan" },
        { family: "Brown" },
        { family: "Evans" },
      ],
    }),
  );

  assert.ok(summarizeCandidate(paper).startsWith("Zan, Brown 외 · 2006"));
});

test("한글이 섞였는지 가린다", () => {
  /*
    Crossref는 한글 제목을 색인하지 않는다. 적게 나오는 것이 아니라 0건이다.
    2026-09-23에 query, query.title, query.bibliographic 모두 확인했다.
    그래서 보내기 전에 가려서, 헛되이 기다리지 않게 한다.
  */
  assert.equal(containsHangul("중학생의 인공지능 리터러시"), true);
  assert.equal(containsHangul("AI literacy in Korea"), false);
  assert.equal(containsHangul("PISA 2022 결과"), true);
  assert.equal(containsHangul(""), false);
  assert.equal(containsHangul("10.1234/abcd"), false);
});

test("DOI 조회 주소를 만든다", () => {
  assert.equal(
    doiLookupUrl("10.1007/s10649-006-9028-2"),
    "https://api.crossref.org/works/10.1007%2Fs10649-006-9028-2",
  );
});

test("제목 검색 주소를 만든다", () => {
  const url = titleSearchUrl("오류 분석", 5);

  assert.ok(url.startsWith("https://api.crossref.org/works?"));
  assert.ok(url.includes("rows=5"));
  assert.ok(url.includes("query.bibliographic="));
});
