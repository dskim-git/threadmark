/**
 * APA 7판 참고문헌 생성 단위 검사. (설계 문서 8.1절)
 *
 * 참고문헌은 논문에 그대로 실리는 글이다. 틀리면 사람이 한 줄씩 고쳐야 하고,
 * 틀린 줄 하나가 심사에서 지적된다. 그래서 규칙 하나하나를 검사로 묶어둔다.
 *
 * 특히 저자 표기를 조심한다. 이름을 잘못 가르면 사람이 알아채기 어렵다.
 * `Kim, D.`와 `D., Kim`은 눈에 띄지만, `Lee, S. H.`와 `Lee, S.`는 안 띈다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatApaCitation,
  formatAuthor,
  formatAuthorList,
  normalizePageRange,
  resolveCitation,
  toDoiUrl,
  toInitials,
} from "../src/lib/papers/apa.ts";
import { usesKoreanCitationStyle } from "../src/lib/papers/types.ts";

/** 검사에 쓸 기본값. 필요한 것만 덮어쓴다. */
function citation(overrides = {}) {
  return {
    authors: [{ family: "Kim", given: "Daesoo" }],
    year: 2024,
    title: "Understanding student errors",
    journalName: "Journal of Mathematics Education",
    volume: "12",
    issue: "3",
    pageRange: "45-67",
    doi: null,
    url: null,
    language: "en",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 머리글자
// -----------------------------------------------------------------------------

test("이름을 머리글자로 줄인다", () => {
  assert.equal(toInitials("Daesoo"), "D.");
});

test("띄어 쓴 이름은 머리글자도 띄어 쓴다", () => {
  assert.equal(toInitials("Dae Soo"), "D. S.");
});

test("붙임표로 이은 이름은 붙임표를 지킨다", () => {
  // APA는 Dae-Soo를 D.-S.로 적는다. 공백으로 바꾸면 다른 이름이 된다.
  assert.equal(toInitials("Dae-Soo"), "D.-S.");
});

test("소문자로 시작하는 이름도 머리글자는 대문자다", () => {
  assert.equal(toInitials("daesoo"), "D.");
});

test("빈 이름은 빈 글자를 돌려준다", () => {
  assert.equal(toInitials("   "), "");
});

// -----------------------------------------------------------------------------
// 저자 한 사람
// -----------------------------------------------------------------------------

test("영문 저자는 성을 앞에 두고 이름을 줄인다", () => {
  assert.equal(formatAuthor({ family: "Kim", given: "Daesoo" }, false), "Kim, D.");
});

test("한국어 저자는 가르지 않고 붙여 적는다", () => {
  assert.equal(formatAuthor({ family: "김", given: "대수" }, true), "김대수");
});

test("이름이 없는 저자는 그대로 적는다", () => {
  // 기관 저자다. `한국교육과정평가원, 한.`이 되면 안 된다.
  const org = { family: "한국교육과정평가원" };

  assert.equal(formatAuthor(org, true), "한국교육과정평가원");
  assert.equal(formatAuthor(org, false), "한국교육과정평가원");
});

test("이름이 공백뿐이면 없는 것으로 본다", () => {
  assert.equal(formatAuthor({ family: "Kim", given: "   " }, false), "Kim");
});

// -----------------------------------------------------------------------------
// 저자 목록
// -----------------------------------------------------------------------------

test("저자가 한 명이면 그대로 적는다", () => {
  assert.equal(
    formatAuthorList([{ family: "Kim", given: "Daesoo" }], false),
    "Kim, D.",
  );
});

test("저자가 둘이면 사이에 &를 넣는다", () => {
  assert.equal(
    formatAuthorList(
      [
        { family: "Kim", given: "Daesoo" },
        { family: "Lee", given: "Seoyeon" },
      ],
      false,
    ),
    "Kim, D., & Lee, S.",
  );
});

test("저자가 셋이면 마지막 앞에만 &를 넣는다", () => {
  assert.equal(
    formatAuthorList(
      [
        { family: "Kim", given: "Daesoo" },
        { family: "Lee", given: "Seoyeon" },
        { family: "Park", given: "Jihun" },
      ],
      false,
    ),
    "Kim, D., Lee, S., & Park, J.",
  );
});

test("한국어 표기에는 &를 쓰지 않는다", () => {
  assert.equal(
    formatAuthorList(
      [
        { family: "김", given: "대수" },
        { family: "이", given: "서연" },
      ],
      true,
    ),
    "김대수, 이서연",
  );
});

test("저자 20명까지는 모두 적는다", () => {
  const authors = Array.from({ length: 20 }, (_, i) => ({
    family: `A${i + 1}`,
    given: "B",
  }));

  const result = formatAuthorList(authors, false);

  assert.ok(!result.includes(". . ."), "20명에서 줄임표가 나오면 안 된다");
  assert.ok(result.includes("& A20, B."), "마지막 저자 앞에 &가 있어야 한다");
});

test("저자 21명부터는 앞 19명과 마지막 한 명만 적는다", () => {
  // APA 7판 §9.8. 경계가 20과 21 사이다.
  const authors = Array.from({ length: 21 }, (_, i) => ({
    family: `A${i + 1}`,
    given: "B",
  }));

  const result = formatAuthorList(authors, false);

  assert.ok(result.startsWith("A1, B., A2, B."));
  assert.ok(result.includes(". . . A21, B."));
  // 줄임표를 쓸 때는 &를 쓰지 않는다.
  assert.ok(!result.includes("&"));
  assert.ok(!result.includes("A20"), "20번째는 생략되어야 한다");
});

test("이름이 비어 있는 저자는 목록에서 뺀다", () => {
  assert.equal(
    formatAuthorList(
      [{ family: "Kim", given: "Daesoo" }, { family: "  " }],
      false,
    ),
    "Kim, D.",
  );
});

test("저자가 없으면 빈 글자를 돌려준다", () => {
  assert.equal(formatAuthorList([], false), "");
});

// -----------------------------------------------------------------------------
// 쪽 범위
// -----------------------------------------------------------------------------

test("쪽 범위의 붙임표를 반각 대시로 바꾼다", () => {
  assert.equal(normalizePageRange("45-67"), "45–67");
});

test("범위가 아닌 쪽 표기는 건드리지 않는다", () => {
  assert.equal(normalizePageRange("e012345"), "e012345");
});

test("공백이 섞인 쪽 표기는 그대로 둔다", () => {
  // 모양을 확신할 수 없는 값이다. 손대지 않는다.
  assert.equal(normalizePageRange("45 - 67"), "45 - 67");
});

test("S로 시작하는 쪽 범위도 바꾼다", () => {
  assert.equal(normalizePageRange("S1-S14"), "S1–S14");
});

// -----------------------------------------------------------------------------
// 참고문헌 한 줄
// -----------------------------------------------------------------------------

test("영문 논문의 기본 형태", () => {
  assert.equal(
    formatApaCitation(citation()),
    "Kim, D. (2024). Understanding student errors. Journal of Mathematics Education, 12(3), 45–67.",
  );
});

test("한국어 논문의 기본 형태", () => {
  assert.equal(
    formatApaCitation(
      citation({
        authors: [
          { family: "김", given: "대수" },
          { family: "이", given: "서연" },
        ],
        title: "학생의 오류에 대한 이해",
        journalName: "수학교육연구",
        language: "ko",
      }),
    ),
    "김대수, 이서연 (2024). 학생의 오류에 대한 이해. 수학교육연구, 12(3), 45-67.",
  );
});

test("한국어 논문은 쪽의 붙임표를 바꾸지 않는다", () => {
  const result = formatApaCitation(
    citation({ language: "ko", authors: [{ family: "김대수" }] }),
  );

  assert.ok(result.includes("45-67"));
  assert.ok(!result.includes("45–67"));
});

test("DOI가 있으면 주소로 적는다", () => {
  const result = formatApaCitation(citation({ doi: "10.1234/abcd" }));

  assert.ok(result.endsWith("https://doi.org/10.1234/abcd"));
});

test("DOI가 없고 주소만 있으면 주소를 적는다", () => {
  const result = formatApaCitation(
    citation({ url: "https://example.org/paper" }),
  );

  assert.ok(result.endsWith("https://example.org/paper"));
});

test("DOI와 주소가 모두 있으면 DOI를 적는다", () => {
  // DOI는 주소가 바뀌어도 따라가는 값이라 더 오래 간다.
  const result = formatApaCitation(
    citation({ doi: "10.1234/abcd", url: "https://example.org/paper" }),
  );

  assert.ok(result.includes("doi.org/10.1234/abcd"));
  assert.ok(!result.includes("example.org"));
});

test("주소 뒤에는 마침표를 찍지 않는다", () => {
  // 마침표까지 주소로 읽혀 열리지 않는 일이 있다.
  const result = formatApaCitation(citation({ doi: "10.1234/abcd" }));

  assert.ok(!result.endsWith("."));
});

test("연도를 모르면 n.d.로 적는다", () => {
  const result = formatApaCitation(citation({ year: null }));

  assert.ok(result.includes("(n.d.)."));
});

test("저자를 모르면 제목을 앞으로 보낸다", () => {
  // APA 7판 §9.12. "저자 없음"이라고 적지 않는다.
  const result = formatApaCitation(citation({ authors: [] }));

  assert.ok(result.startsWith("Understanding student errors. (2024)."));
});

test("호가 없으면 권만 적는다", () => {
  const result = formatApaCitation(citation({ issue: null }));

  assert.ok(result.includes("Journal of Mathematics Education, 12, 45–67."));
});

test("권이 없고 호만 있으면 호를 괄호로 적는다", () => {
  const result = formatApaCitation(citation({ volume: null }));

  assert.ok(result.includes("Journal of Mathematics Education, (3), 45–67."));
});

test("학술지 정보가 아예 없어도 만들어진다", () => {
  const result = formatApaCitation(
    citation({ journalName: null, volume: null, issue: null, pageRange: null }),
  );

  assert.equal(result, "Kim, D. (2024). Understanding student errors.");
});

test("물음표로 끝나는 제목 뒤에 마침표를 덧붙이지 않는다", () => {
  const result = formatApaCitation(
    citation({ title: "What makes a good error?" }),
  );

  assert.ok(result.includes("What makes a good error? Journal"));
  assert.ok(!result.includes("error?."));
});

test("제목의 대소문자를 바꾸지 않는다", () => {
  // 고유명사와 약어를 가려낼 수 없다. 적어준 그대로 둔다.
  const result = formatApaCitation(
    citation({ title: "PISA and TIMSS in Korea" }),
  );

  assert.ok(result.includes("PISA and TIMSS in Korea."));
});

// -----------------------------------------------------------------------------
// 언어 판정
// -----------------------------------------------------------------------------

test("ko로 시작하면 한국어 표기를 쓴다", () => {
  assert.equal(usesKoreanCitationStyle("ko"), true);
  assert.equal(usesKoreanCitationStyle("ko-KR"), true);
});

test("모르는 언어는 영문 표기로 간다", () => {
  // 둘 다 틀릴 수 있다면 고칠 엄두가 나는 쪽으로 틀린다.
  assert.equal(usesKoreanCitationStyle(null), false);
  assert.equal(usesKoreanCitationStyle("en"), false);
  assert.equal(usesKoreanCitationStyle(""), false);
});

// -----------------------------------------------------------------------------
// 고쳐 쓴 참고문헌
// -----------------------------------------------------------------------------

test("고쳐 쓴 것이 있으면 그것을 쓴다", () => {
  const result = resolveCitation(citation(), "내가 고친 참고문헌");

  assert.equal(result.text, "내가 고친 참고문헌");
  assert.equal(result.edited, true);
});

test("고쳐 쓴 것이 없으면 만들어 쓴다", () => {
  const result = resolveCitation(citation(), null);

  assert.ok(result.text.startsWith("Kim, D. (2024)."));
  assert.equal(result.edited, false);
});

test("고쳐 쓴 것이 공백뿐이면 만들어 쓴다", () => {
  const result = resolveCitation(citation(), "   \n  ");

  assert.equal(result.edited, false);
});

test("DOI 주소를 만든다", () => {
  assert.equal(toDoiUrl("10.1234/abcd"), "https://doi.org/10.1234/abcd");
});
