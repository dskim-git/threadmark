/**
 * 태그 이름 다듬기 단위 검사. (설계 문서 20-1절)
 *
 * 태그는 사용자가 손으로 치는 값이고 고정 목록이 없다. 같은 것을 뜻하는
 * 글자가 여러 모양으로 들어오는데, 그것이 따로 쌓이면 태그 목록이 못 쓰게
 * 된다. 비슷한 것이 셋 있으면 어느 것을 눌러야 할지 알 수 없고, 하나를
 * 누르면 나머지 둘에 달아둔 것이 안 보인다.
 *
 * 그래서 이 검사가 지키는 것은 하나다. **눈에 같아 보이는 것은 같은 태그다.**
 * 그러면서 사람이 친 모양은 그대로 보여야 한다.
 *
 * 다듬는 규칙은 데이터베이스 제약조건과 같아야 한다. 어긋나면 화면에서는
 * 칠 수 있는데 저장만 거부된다. 마지막 검사가 그 둘을 맞대어 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_TAGS_PER_ITEM,
  MAX_TAG_LENGTH,
  isUsableTagName,
  parseTagInput,
  toTagName,
  toTagSlug,
} from "../src/lib/tags/name.ts";

// -----------------------------------------------------------------------------
// 보이는 이름
// -----------------------------------------------------------------------------

test("앞뒤 공백을 뗀다", () => {
  assert.equal(toTagName("  수업 준비  "), "수업 준비");
});

test("가운데 이어진 공백은 하나로 줄인다", () => {
  assert.equal(toTagName("AI  융합수업"), "AI 융합수업");
});

test("줄바꿈과 탭도 공백으로 본다", () => {
  // 붙여넣기로 들어온다.
  assert.equal(toTagName("수업\n준비"), "수업 준비");
  assert.equal(toTagName("수업\t준비"), "수업 준비");
});

test("대소문자는 건드리지 않는다", () => {
  // 친 그대로 보여야 한다. `AI`를 쳤는데 `ai`로 나오면 내가 친 것이 아닌 것 같다.
  assert.equal(toTagName("AI"), "AI");
  assert.equal(toTagName("ChatGPT"), "ChatGPT");
});

test("한글 자모로 들어온 것을 글자로 합친다", () => {
  // 맥에서 복사한 글이 이렇게 들어온다. 눈에는 똑같고 글자로는 다르다.
  const decomposed = "수업".normalize("NFD");

  assert.notEqual(decomposed, "수업");
  assert.equal(toTagName(decomposed), "수업");
});

test("글자가 아닌 값은 빈 이름이다", () => {
  for (const value of [undefined, null, 1, true, [], {}]) {
    assert.equal(toTagName(value), "");
  }
});

// -----------------------------------------------------------------------------
// 같은 태그인지 판정하는 값
// -----------------------------------------------------------------------------

test("대소문자만 다르면 같은 태그다", () => {
  assert.equal(toTagSlug("AI"), toTagSlug("ai"));
  assert.equal(toTagSlug("ChatGPT"), toTagSlug("chatgpt"));
});

test("공백 모양만 다르면 같은 태그다", () => {
  assert.equal(toTagSlug(" AI  융합수업 "), toTagSlug("AI 융합수업"));
});

test("공백이 있고 없는 것은 다른 태그다", () => {
  // 여기까지 같다고 보면 사용자가 다르게 쓸 뜻이었던 것을 합쳐버린다.
  assert.notEqual(toTagSlug("수업 준비"), toTagSlug("수업준비"));
});

test("한글은 소문자로 내려도 그대로다", () => {
  assert.equal(toTagSlug("수업 준비"), "수업 준비");
});

// -----------------------------------------------------------------------------
// 쓸 수 있는 이름인지
// -----------------------------------------------------------------------------

test("빈 이름은 쓸 수 없다", () => {
  assert.equal(isUsableTagName(""), false);
});

test("길이 상한까지는 쓸 수 있다", () => {
  assert.equal(isUsableTagName("가".repeat(MAX_TAG_LENGTH)), true);
  assert.equal(isUsableTagName("가".repeat(MAX_TAG_LENGTH + 1)), false);
});

test("쉼표가 든 이름은 쓸 수 없다", () => {
  // 쉼표는 여러 개를 가르는 글자다. 이름에 들어가면 가를 수 없다.
  assert.equal(isUsableTagName("수업,준비"), false);
});

// -----------------------------------------------------------------------------
// 한 줄에 쉼표로 이어 친 것
// -----------------------------------------------------------------------------

test("쉼표로 가른다", () => {
  assert.deepEqual(parseTagInput("수업 준비, AI, 발표"), [
    "수업 준비",
    "AI",
    "발표",
  ]);
});

test("공백으로 가르지 않는다", () => {
  // 공백으로 가르면 `수업 준비` 같은 이름을 칠 방법이 없어진다.
  assert.deepEqual(parseTagInput("수업 준비"), ["수업 준비"]);
});

test("같은 것이 여러 번 오면 처음 친 모양을 남긴다", () => {
  // 나중 것을 남기면 목록의 순서가 친 순서와 어긋난다.
  assert.deepEqual(parseTagInput("AI, ai, Ai"), ["AI"]);
});

test("빈 조각은 조용히 버린다", () => {
  // 여기서 막으면 나머지 멀쩡한 태그까지 달리지 않는다.
  assert.deepEqual(parseTagInput("AI,,  , 발표,"), ["AI", "발표"]);
});

test("너무 긴 것만 버리고 나머지는 담는다", () => {
  const long = "가".repeat(MAX_TAG_LENGTH + 1);

  assert.deepEqual(parseTagInput(`AI, ${long}, 발표`), ["AI", "발표"]);
});

test("한 번에 달 수 있는 개수까지만 담는다", () => {
  const many = Array.from({ length: MAX_TAGS_PER_ITEM + 5 }, (_, i) => `t${i}`);

  assert.equal(parseTagInput(many.join(",")).length, MAX_TAGS_PER_ITEM);
});

test("글자가 아닌 값은 빈 목록이다", () => {
  for (const value of [undefined, null, 1, true, [], {}]) {
    assert.deepEqual(parseTagInput(value), []);
  }
});

// -----------------------------------------------------------------------------
// 데이터베이스와 어긋나지 않는지
// -----------------------------------------------------------------------------

test("길이 상한이 마이그레이션의 제약조건과 같다", () => {
  // 어긋나면 화면에서는 칠 수 있는데 저장만 거부된다.
  const sql = readFileSync(
    new URL("../supabase/migrations/20260924140000_tags.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    sql,
    new RegExp(`char_length\\(name\\)\\s+between\\s+1\\s+and\\s+${MAX_TAG_LENGTH}`),
    "tags_name_length 제약조건이 MAX_TAG_LENGTH와 같아야 한다",
  );
});
