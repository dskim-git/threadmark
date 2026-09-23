/**
 * 논문 서지 정보 입력 검증 단위 검사. (설계 문서 8.1절)
 *
 * 여기서 지키려는 것은 둘이다.
 *
 * 하나, 저자 이름을 추측해서 가르지 않는다. 잘못 갈라놓은 이름은 참고문헌에
 * 조용히 틀린 채로 실린다.
 *
 * 둘, DOI는 모양을 확인하고 담는다. 다른 값들과 달리 그 값으로 주소를 만들어
 * 열기 때문에, 틀린 값을 담아두면 나중에 그것이 DOI인 줄 알게 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  doiWasRejected,
  formatAuthorsInput,
  normalizeDoi,
  parseAuthorsInput,
  parseKeywordsInput,
  readPaperProfileForm,
} from "../src/lib/papers/schema.ts";
import { MAX_KEYWORDS } from "../src/lib/papers/types.ts";

/** 폼 기본값. 필요한 칸만 덮어쓴다. */
function form(overrides = {}) {
  return {
    authors: "Kim, Daesoo",
    publicationYear: "2024",
    journalName: "Journal of Mathematics Education",
    volume: "12",
    issue: "3",
    pageRange: "45-67",
    doi: "",
    issn: "",
    abstract: "",
    keywords: "",
    originalLanguage: "en",
    citationOverride: "",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 저자 읽기
// -----------------------------------------------------------------------------

test("쉼표가 있으면 성과 이름을 가른다", () => {
  assert.deepEqual(parseAuthorsInput("Kim, Daesoo"), [
    { family: "Kim", given: "Daesoo" },
  ]);
});

test("쉼표가 없으면 가르지 않는다", () => {
  // Daesoo Kim의 성이 앞인지 뒤인지 알 방법이 없다. 추측하면 틀린다.
  assert.deepEqual(parseAuthorsInput("김대수"), [{ family: "김대수" }]);
  assert.deepEqual(parseAuthorsInput("Daesoo Kim"), [
    { family: "Daesoo Kim" },
  ]);
});

test("한 줄에 한 사람씩 읽는다", () => {
  assert.deepEqual(parseAuthorsInput("Kim, Daesoo\nLee, Seoyeon"), [
    { family: "Kim", given: "Daesoo" },
    { family: "Lee", given: "Seoyeon" },
  ]);
});

test("빈 줄은 건너뛴다", () => {
  assert.deepEqual(parseAuthorsInput("\n\nKim, Daesoo\n\n\nLee, Seoyeon\n"), [
    { family: "Kim", given: "Daesoo" },
    { family: "Lee", given: "Seoyeon" },
  ]);
});

test("쉼표가 둘 이상이면 첫 번째만 가르는 데 쓴다", () => {
  assert.deepEqual(parseAuthorsInput("Kim, Daesoo, Jr."), [
    { family: "Kim", given: "Daesoo, Jr." },
  ]);
});

test("쉼표 뒤가 비면 이름 없는 저자로 본다", () => {
  assert.deepEqual(parseAuthorsInput("한국교육과정평가원,"), [
    { family: "한국교육과정평가원" },
  ]);
});

test("쉼표로 시작하는 줄은 통째로 성으로 본다", () => {
  assert.deepEqual(parseAuthorsInput(", Daesoo"), [{ family: "Daesoo" }]);
});

test("윈도우 줄바꿈도 읽는다", () => {
  assert.deepEqual(parseAuthorsInput("Kim, Daesoo\r\nLee, Seoyeon"), [
    { family: "Kim", given: "Daesoo" },
    { family: "Lee", given: "Seoyeon" },
  ]);
});

test("저자가 없으면 빈 목록이다", () => {
  assert.deepEqual(parseAuthorsInput("   \n  \n"), []);
});

test("저장된 저자를 다시 입력란 모양으로 되돌린다", () => {
  const authors = [
    { family: "Kim", given: "Daesoo" },
    { family: "한국교육과정평가원" },
  ];

  assert.equal(
    formatAuthorsInput(authors),
    "Kim, Daesoo\n한국교육과정평가원",
  );
});

test("읽고 되돌려도 같은 값이 나온다", () => {
  const text = "Kim, Daesoo\nLee, Seoyeon\n한국교육과정평가원";

  assert.equal(formatAuthorsInput(parseAuthorsInput(text)), text);
});

// -----------------------------------------------------------------------------
// DOI
// -----------------------------------------------------------------------------

test("알맹이만 있는 DOI는 그대로 둔다", () => {
  assert.equal(normalizeDoi("10.1234/abcd"), "10.1234/abcd");
});

test("주소 형태의 DOI에서 앞부분을 떼어낸다", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1234/abcd"), "10.1234/abcd");
  assert.equal(normalizeDoi("http://dx.doi.org/10.1234/abcd"), "10.1234/abcd");
});

test("doi: 앞머리를 떼어낸다", () => {
  assert.equal(normalizeDoi("doi:10.1234/abcd"), "10.1234/abcd");
  assert.equal(normalizeDoi("DOI: 10.1234/abcd"), "10.1234/abcd");
});

test("소문자로 바꾼다", () => {
  // DOI는 대소문자를 가리지 않는 값이다. 같은 모양으로 담아야 견줄 수 있다.
  assert.equal(normalizeDoi("10.1234/ABCD"), "10.1234/abcd");
});

test("10.으로 시작하지 않으면 DOI가 아니다", () => {
  assert.equal(normalizeDoi("abcd"), null);
  assert.equal(normalizeDoi("https://example.org/paper"), null);
  assert.equal(normalizeDoi("11.1234/abcd"), null);
});

test("빈 값은 null이다", () => {
  assert.equal(normalizeDoi("   "), null);
});

test("적었는데 알아볼 수 없으면 알려준다", () => {
  // 조용히 사라지면 사용자는 적은 것이 어디 갔는지 알 수 없다.
  assert.equal(doiWasRejected("그냥 아무 글자"), true);
  assert.equal(doiWasRejected("10.1234/abcd"), false);
  assert.equal(doiWasRejected("  "), false);
});

// -----------------------------------------------------------------------------
// 키워드
// -----------------------------------------------------------------------------

test("쉼표로 키워드를 나눈다", () => {
  assert.deepEqual(parseKeywordsInput("오류 분석, 수학교육, 형성평가"), [
    "오류 분석",
    "수학교육",
    "형성평가",
  ]);
});

test("줄바꿈도 나누는 기준이다", () => {
  // 초록에서 키워드를 복사해 오면 줄이 섞여 들어온다.
  assert.deepEqual(parseKeywordsInput("오류 분석\n수학교육"), [
    "오류 분석",
    "수학교육",
  ]);
});

test("같은 키워드를 두 번 담지 않는다", () => {
  assert.deepEqual(parseKeywordsInput("수학교육, 수학교육, 오류"), [
    "수학교육",
    "오류",
  ]);
});

test("대소문자만 다른 키워드도 같은 것으로 본다", () => {
  assert.deepEqual(parseKeywordsInput("PISA, pisa"), ["PISA"]);
});

test("키워드 개수 상한을 넘기면 자른다", () => {
  const many = Array.from({ length: MAX_KEYWORDS + 10 }, (_, i) => `k${i}`);

  assert.equal(parseKeywordsInput(many.join(",")).length, MAX_KEYWORDS);
});

test("빈 키워드는 담지 않는다", () => {
  assert.deepEqual(parseKeywordsInput(", ,수학교육, ,"), ["수학교육"]);
});

// -----------------------------------------------------------------------------
// 폼 전체
// -----------------------------------------------------------------------------

test("기본 입력이 통과한다", () => {
  const result = readPaperProfileForm(form());

  assert.equal(result.success, true);
  assert.equal(result.data.publicationYear, 2024);
  assert.deepEqual(result.data.authors, [{ family: "Kim", given: "Daesoo" }]);
});

test("연도를 비우면 모른다는 뜻이다", () => {
  // 빈 칸은 "모른다"이지 "0년"이 아니다.
  const result = readPaperProfileForm(form({ publicationYear: "" }));

  assert.equal(result.success, true);
  assert.equal(result.data.publicationYear, null);
});

test("연도가 범위를 벗어나면 거부한다", () => {
  assert.equal(readPaperProfileForm(form({ publicationYear: "20244" })).success, false);
  assert.equal(readPaperProfileForm(form({ publicationYear: "0" })).success, false);
});

test("연도에 글자를 적으면 거부한다", () => {
  assert.equal(
    readPaperProfileForm(form({ publicationYear: "작년" })).success,
    false,
  );
});

test("빈 칸은 null로 담긴다", () => {
  const result = readPaperProfileForm(
    form({ journalName: "", volume: "", issue: "", pageRange: "" }),
  );

  assert.equal(result.success, true);
  assert.equal(result.data.journalName, null);
  assert.equal(result.data.volume, null);
});

test("DOI는 다듬어 담긴다", () => {
  const result = readPaperProfileForm(
    form({ doi: "https://doi.org/10.1234/ABCD" }),
  );

  assert.equal(result.success, true);
  assert.equal(result.data.doi, "10.1234/abcd");
});

test("모르는 언어는 null이 된다", () => {
  const result = readPaperProfileForm(form({ originalLanguage: "fr" }));

  assert.equal(result.success, true);
  assert.equal(result.data.originalLanguage, null);
});

test("아무것도 적지 않아도 통과한다", () => {
  // 논문 정보는 나중에 채울 수 있다. 자료를 만드는 것을 막지 않는다.
  const result = readPaperProfileForm(
    form({
      authors: "",
      publicationYear: "",
      journalName: "",
      volume: "",
      issue: "",
      pageRange: "",
      originalLanguage: "",
    }),
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.data.authors, []);
});

test("저자가 너무 많으면 거부한다", () => {
  const many = Array.from({ length: 101 }, (_, i) => `A${i}, B`).join("\n");
  const result = readPaperProfileForm(form({ authors: many }));

  assert.equal(result.success, false);
});
