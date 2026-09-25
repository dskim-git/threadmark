/**
 * Source 입력 검증 단위 테스트.
 *
 * 저장된 주소는 나중에 화면에서 링크가 된다. 여기가 뚫리면 링크를 누른 사람의
 * 브라우저에서 스크립트가 실행될 수 있으므로 스킴 검사를 집중적으로 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TITLE_LENGTH,
  isSafeHttpUrl,
  sourceInputSchema,
} from "../src/lib/sources/schema.ts";
import {
  SOURCE_TYPES,
  getSourceTypeLabel,
  isSourceType,
} from "../src/lib/sources/types.ts";

const validInput = {
  type: "paper",
  title: "어떤 논문",
  subtitle: "",
  description: "",
  originalUrl: "",
};

/**
 * 자료 유형을 목록째로 못박아 둔다.
 *
 * **늘어나는 것 자체를 막는 검사가 아니다.** 설계 문서 5.1절과 데이터베이스
 * 열거형과 이 목록이 **셋 다 같아야 한다**는 것을 붙잡는다. 하나만 늘면
 * 화면에 보이는 갈래와 담을 수 있는 갈래가 어긋난다.
 *
 * 늘릴 때는 세 곳을 함께 고친다. 마이그레이션(`ALTER TYPE ... ADD VALUE`),
 * 설계 문서 5.1절, 그리고 이 검사다. **마이그레이션이 먼저 올라가야 한다.**
 * (`AGENTS.md` 2절)
 *
 * 2026-09-25에 `place`가 열두 번째로 들어왔다. (17-1절, 사용자 요청)
 * 가본 곳과 가볼 곳을 적어두는 자리가 없었다.
 */
test("자료 유형은 설계 문서 5.1절의 12가지다", () => {
  assert.deepEqual(
    [...SOURCE_TYPES],
    [
      "paper",
      "book",
      "website",
      "music",
      "youtube",
      "media",
      "place",
      "pdf",
      "image",
      "drawing",
      "audio",
      "note",
    ],
  );
});

test("모든 자료 유형에 표시 이름이 있다", () => {
  for (const type of SOURCE_TYPES) {
    const label = getSourceTypeLabel(type);

    assert.ok(label.length > 0, `${type}에 표시 이름이 없다`);
    assert.notEqual(label, "기타", `${type}이 기타로 표시된다`);
  }
});

test("알 수 없는 값은 자료 유형이 아니다", () => {
  for (const value of [null, undefined, "", "PAPER", "book ", "essay", 1, {}]) {
    assert.equal(isSourceType(value), false);
  }
});

test("http와 https 주소만 안전하다고 본다", () => {
  const safe = [
    "https://example.com",
    "http://example.com/path?q=1#top",
    "https://sub.example.co.kr/논문.pdf",
  ];

  for (const url of safe) {
    assert.equal(isSafeHttpUrl(url), true, `${url}은 허용되어야 한다`);
  }
});

test("스크립트를 실행할 수 있는 주소를 막는다", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:someone@example.com",
    "ftp://example.com",
    "example.com",
    "//example.com",
    "",
    "   ",
  ];

  for (const url of unsafe) {
    assert.equal(isSafeHttpUrl(url), false, `${url}은 막아야 한다`);
  }
});

test("올바른 입력을 통과시킨다", () => {
  const result = sourceInputSchema.safeParse(validInput);

  assert.equal(result.success, true);
  assert.equal(result.data.title, "어떤 논문");
  assert.equal(result.data.subtitle, null);
  assert.equal(result.data.originalUrl, null);
});

test("제목 앞뒤 공백을 정리한다", () => {
  const result = sourceInputSchema.safeParse({
    ...validInput,
    title: "  공백이 있는 제목  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.title, "공백이 있는 제목");
});

test("제목이 비어 있으면 거부한다", () => {
  for (const title of ["", "   ", "\t"]) {
    const result = sourceInputSchema.safeParse({ ...validInput, title });

    assert.equal(result.success, false, `"${title}"는 거부되어야 한다`);
  }
});

test("제목 길이 한계를 지킨다", () => {
  const atLimit = sourceInputSchema.safeParse({
    ...validInput,
    title: "가".repeat(MAX_TITLE_LENGTH),
  });
  const overLimit = sourceInputSchema.safeParse({
    ...validInput,
    title: "가".repeat(MAX_TITLE_LENGTH + 1),
  });

  assert.equal(atLimit.success, true);
  assert.equal(overLimit.success, false);
});

test("빈 선택 항목은 null이 된다", () => {
  // 빈 문자열과 "값 없음"을 구분하지 않기 위해서다.
  const result = sourceInputSchema.safeParse({
    ...validInput,
    subtitle: "   ",
    description: "",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.subtitle, null);
  assert.equal(result.data.description, null);
});

test("안전하지 않은 주소는 저장을 거부한다", () => {
  const result = sourceInputSchema.safeParse({
    ...validInput,
    originalUrl: "javascript:alert(document.cookie)",
  });

  assert.equal(result.success, false);
});

test("안전한 주소는 그대로 저장한다", () => {
  const result = sourceInputSchema.safeParse({
    ...validInput,
    originalUrl: "  https://example.com/paper.pdf  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.originalUrl, "https://example.com/paper.pdf");
});

test("알 수 없는 자료 유형은 거부한다", () => {
  const result = sourceInputSchema.safeParse({ ...validInput, type: "essay" });

  assert.equal(result.success, false);
});
