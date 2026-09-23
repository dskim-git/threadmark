/**
 * BibTeX·RIS 읽기 단위 검사. (설계 문서 8.5절)
 *
 * 이 두 형식에는 **정해진 규칙이 있다.** 그래서 여기서는 이름을 가른다.
 * 사용자가 직접 적은 글에서 가르지 않기로 한 것(papers-schema)과 다른 이유는,
 * 거기에는 규칙이 없고 여기에는 있기 때문이다. 추측과 규칙은 다르다.
 *
 * 다만 규칙이 있는 곳에서도 규칙이 없는 자리는 가르지 않는다.
 * RIS에는 "쉼표가 없으면 마지막 낱말이 성"이라는 규칙이 없어서 가르지 않고,
 * BibTeX에는 있어서 가른다. 형식마다 다르게 다룬다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  looksLikeBibtex,
  normalizeDoiValue,
  parseBibtex,
  parseBibtexAuthor,
  readLanguage,
  readYear,
  splitBibtexAuthors,
} from "../src/lib/papers/bibtex.ts";
import {
  looksLikeRis,
  parseRis,
  parseRisAuthor,
} from "../src/lib/papers/ris.ts";
import { parsePastedCitation } from "../src/lib/papers/paste.ts";

/** Springer가 내려주는 모양. */
const BIBTEX = `@article{Zan2006,
  author = {Zan, Rosetta and Brown, Laurinda and Evans, Jeff},
  title = {Affect in Mathematics Education: An Introduction},
  journal = {Educational Studies in Mathematics},
  year = {2006},
  volume = {63},
  number = {2},
  pages = {113--121},
  issn = {0013-1954},
  doi = {10.1007/s10649-006-9028-2},
  language = {english}
}`;

/** DBpia·RISS가 내려주는 모양. */
const RIS = `TY  - JOUR
AU  - 김성원
AU  - 이영준
TI  - 중학생의 인공지능 리터러시 검사 도구 개발
JO  - 정보교육학회논문지
VL  - 25
IS  - 3
SP  - 331
EP  - 342
PY  - 2021
SN  - 1229-3245
LA  - Korean
AB  - 본 연구의 목적은 중학생의 인공지능 리터러시를
      측정할 수 있는 검사 도구를 개발하는 것이다.
ER  - `;

// -----------------------------------------------------------------------------
// 형식 가리기
// -----------------------------------------------------------------------------

test("BibTeX를 알아본다", () => {
  assert.equal(looksLikeBibtex(BIBTEX), true);
  assert.equal(looksLikeBibtex(RIS), false);
});

test("RIS를 알아본다", () => {
  assert.equal(looksLikeRis(RIS), true);
  assert.equal(looksLikeRis(BIBTEX), false);
});

// -----------------------------------------------------------------------------
// BibTeX 저자
// -----------------------------------------------------------------------------

test("쉼표가 있으면 앞이 성이다", () => {
  assert.deepEqual(parseBibtexAuthor("Zan, Rosetta"), {
    family: "Zan",
    given: "Rosetta",
  });
});

test("쉼표가 없으면 마지막 낱말이 성이다", () => {
  // BibTeX가 정한 규칙이다. 추측이 아니다.
  assert.deepEqual(parseBibtexAuthor("Rosetta Zan"), {
    family: "Zan",
    given: "Rosetta",
  });
});

test("가운데 이름이 있어도 마지막 낱말만 성이다", () => {
  assert.deepEqual(parseBibtexAuthor("Markku S. Hannula"), {
    family: "Hannula",
    given: "Markku S.",
  });
});

test("중괄호로 감싼 이름은 통째로 둔다", () => {
  // 기관 이름이다. 마지막 낱말을 성으로 떼면 안 된다.
  assert.deepEqual(parseBibtexAuthor("{한국교육과정평가원}"), {
    family: "한국교육과정평가원",
  });
});

test("낱말이 하나면 가르지 않는다", () => {
  assert.deepEqual(parseBibtexAuthor("김대수"), { family: "김대수" });
});

test("and로 저자를 나눈다", () => {
  const authors = splitBibtexAuthors("Zan, Rosetta and Brown, Laurinda");

  assert.equal(authors.length, 2);
  assert.deepEqual(authors[1], { family: "Brown", given: "Laurinda" });
});

test("이름 속의 and를 자르지 않는다", () => {
  // Anderson의 and를 자르면 없는 사람이 둘 생긴다.
  const authors = splitBibtexAuthors("Anderson, Lorin");

  assert.equal(authors.length, 1);
  assert.deepEqual(authors[0], { family: "Anderson", given: "Lorin" });
});

// -----------------------------------------------------------------------------
// BibTeX 전체
// -----------------------------------------------------------------------------

test("BibTeX 한 편을 읽는다", () => {
  const paper = parseBibtex(BIBTEX);

  assert.equal(paper.title, "Affect in Mathematics Education: An Introduction");
  assert.equal(paper.journalName, "Educational Studies in Mathematics");
  assert.equal(paper.publicationYear, 2006);
  assert.equal(paper.volume, "63");
  assert.equal(paper.issue, "2");
  assert.equal(paper.doi, "10.1007/s10649-006-9028-2");
  assert.equal(paper.issn, "0013-1954");
  assert.equal(paper.originalLanguage, "en");
  assert.equal(paper.authors.length, 3);
  assert.equal(paper.source, "bibtex");
});

test("BibTeX의 두 겹 붙임표를 하나로 줄인다", () => {
  assert.equal(parseBibtex(BIBTEX).pageRange, "113-121");
});

test("값 안의 쉼표로 항목을 자르지 않는다", () => {
  // title = {A, B}를 쉼표로 자르면 제목이 두 동강 난다.
  const paper = parseBibtex(
    "@article{k, title = {Errors, Mistakes, and Slips}, year = {2020}}",
  );

  assert.equal(paper.title, "Errors, Mistakes, and Slips");
});

test("값 안의 중괄호는 서식 표시라 지운다", () => {
  const paper = parseBibtex("@article{k, title = {The {PISA} Study}}");

  assert.equal(paper.title, "The PISA Study");
});

test("따옴표로 감싼 값도 읽는다", () => {
  const paper = parseBibtex('@article{k, title = "학생의 오류", year = "2020"}');

  assert.equal(paper.title, "학생의 오류");
  assert.equal(paper.publicationYear, 2020);
});

test("닫는 괄호가 없어도 앞부분은 읽는다", () => {
  // 반쯤 붙여넣은 것도 쓸모가 있다. 아무것도 안 주는 것보다 낫다.
  const paper = parseBibtex("@article{k, title = {학생의 오류}, year = {2020}");

  assert.equal(paper.title, "학생의 오류");
});

test("제목도 DOI도 없으면 받아들이지 않는다", () => {
  assert.equal(parseBibtex("@article{k, volume = {12}}"), null);
});

test("BibTeX가 아니면 null이다", () => {
  assert.equal(parseBibtex("그냥 아무 글"), null);
});

// -----------------------------------------------------------------------------
// RIS
// -----------------------------------------------------------------------------

test("RIS 한 편을 읽는다", () => {
  const paper = parseRis(RIS);

  assert.equal(paper.title, "중학생의 인공지능 리터러시 검사 도구 개발");
  assert.equal(paper.journalName, "정보교육학회논문지");
  assert.equal(paper.publicationYear, 2021);
  assert.equal(paper.volume, "25");
  assert.equal(paper.issue, "3");
  assert.equal(paper.issn, "1229-3245");
  assert.equal(paper.originalLanguage, "ko");
  assert.equal(paper.source, "ris");
});

test("RIS의 시작쪽과 끝쪽을 범위로 잇는다", () => {
  assert.equal(parseRis(RIS).pageRange, "331-342");
});

test("끝쪽이 없으면 시작쪽만 적는다", () => {
  // 온라인 전용 논문에는 끝쪽이 없다.
  const paper = parseRis("TY  - JOUR\nTI  - 제목\nSP  - e12345\nER  - ");

  assert.equal(paper.pageRange, "e12345");
});

test("RIS 저자를 여러 줄에서 읽는다", () => {
  const paper = parseRis(RIS);

  assert.equal(paper.authors.length, 2);
  assert.deepEqual(paper.authors[0], { family: "김성원" });
  assert.deepEqual(paper.authors[1], { family: "이영준" });
});

test("RIS는 쉼표가 없으면 가르지 않는다", () => {
  // RIS에는 "마지막 낱말이 성"이라는 규칙이 없다. 규칙이 없으면 추측하지 않는다.
  assert.deepEqual(parseRisAuthor("Rosetta Zan"), { family: "Rosetta Zan" });
  assert.deepEqual(parseRisAuthor("Zan, Rosetta"), {
    family: "Zan",
    given: "Rosetta",
  });
});

test("들여 쓴 줄을 앞 줄에 이어 붙인다", () => {
  // 이어 붙이지 않으면 초록이 첫 줄만 남는다.
  const paper = parseRis(RIS);

  assert.ok(paper.abstract.includes("측정할 수 있는 검사 도구"));
});

test("ER에서 멈춘다. 뒤에 붙은 논문은 읽지 않는다", () => {
  const two = `${RIS}\nTY  - JOUR\nTI  - 두 번째 논문\nER  - `;

  assert.equal(
    parseRis(two).title,
    "중학생의 인공지능 리터러시 검사 도구 개발",
  );
});

test("RIS가 아니면 null이다", () => {
  assert.equal(parseRis("그냥 아무 글"), null);
});

// -----------------------------------------------------------------------------
// 공통 조각
// -----------------------------------------------------------------------------

test("연도에서 네 자리만 꺼낸다", () => {
  assert.equal(readYear("2006"), 2006);
  assert.equal(readYear("2006/10/24/"), 2006);
  assert.equal(readYear("2006-10"), 2006);
  assert.equal(readYear("작년"), null);
  assert.equal(readYear(null), null);
});

test("범위를 벗어난 연도는 담지 않는다", () => {
  assert.equal(readYear("0999"), null);
});

test("DOI를 다듬는다", () => {
  assert.equal(
    normalizeDoiValue("https://doi.org/10.1234/ABCD"),
    "10.1234/abcd",
  );
  assert.equal(normalizeDoiValue("doi:10.1234/abcd"), "10.1234/abcd");
  assert.equal(normalizeDoiValue("abcd"), null);
  assert.equal(normalizeDoiValue(null), null);
});

test("언어를 우리가 아는 값으로 바꾼다", () => {
  assert.equal(readLanguage("english"), "en");
  assert.equal(readLanguage("Korean"), "ko");
  assert.equal(readLanguage("ko-KR"), "ko");
  assert.equal(readLanguage("한국어"), "ko");
  assert.equal(readLanguage("français"), null);
});

// -----------------------------------------------------------------------------
// 붙여넣기 전체
// -----------------------------------------------------------------------------

test("붙여넣은 글의 종류를 가려서 읽는다", () => {
  assert.equal(parsePastedCitation(BIBTEX).paper.source, "bibtex");
  assert.equal(parsePastedCitation(RIS).paper.source, "ris");
});

test("빈 글은 거부한다", () => {
  const result = parsePastedCitation("   \n ");

  assert.equal(result.ok, false);
});

test("둘 다 아니면 무엇을 붙여넣어야 하는지 알려준다", () => {
  const result = parsePastedCitation("이것은 그냥 글입니다");

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("인용 내보내기"));
});

test("너무 길면 거부한다", () => {
  const result = parsePastedCitation("@article{k,".padEnd(60_000, "x"));

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("한 편"));
});
