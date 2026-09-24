/**
 * 음악 기록의 자리 단위 검사. (설계 문서 13.4절)
 *
 * 13.4절의 예가 이 검사가 지키는 것이다.
 *
 *   01:08–01:34 / 2절 후렴
 *
 * `locator`는 JSONB라 무엇이든 들어갈 수 있다. PDF의 자리가 이미 그 칸을
 * 쓰고 있고 여기에 음악의 자리가 더해진다. 둘이 섞이지 않는지, 이상한 값이
 * 와도 화면이 터지지 않는지를 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MUSIC_LABEL_LENGTH,
  MUSIC_TIME_KIND,
  describeMusicTime,
  parseMusicTimeLocator,
} from "../src/lib/captures/music-locator.ts";
import { PDF_SELECTION_KIND } from "../src/lib/captures/pdf-locator.ts";

function locator(overrides = {}) {
  return {
    kind: MUSIC_TIME_KIND,
    startSeconds: 68,
    endSeconds: 94,
    label: "2절 후렴",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 받아들이는 모양
// -----------------------------------------------------------------------------

test("13.4절의 모양을 받아들인다", () => {
  const parsed = parseMusicTimeLocator(locator());

  assert.ok(parsed);
  assert.equal(parsed.startSeconds, 68);
  assert.equal(parsed.endSeconds, 94);
  assert.equal(parsed.label, "2절 후렴");
});

test("끝 시점이 없어도 된다", () => {
  /*
    "여기부터 저기까지"가 아니라 "이 순간"을 가리키는 메모가 있다.
    없는 값을 시작과 같게 채워 넣지 않는다.
  */
  assert.ok(parseMusicTimeLocator(locator({ endSeconds: null })));
  assert.ok(parseMusicTimeLocator({ kind: MUSIC_TIME_KIND, startSeconds: 68 }));
});

test("이름이 없어도 된다", () => {
  assert.ok(parseMusicTimeLocator(locator({ label: null })));
  assert.ok(
    parseMusicTimeLocator({ kind: MUSIC_TIME_KIND, startSeconds: 0 }),
  );
});

test("시작과 끝이 같아도 된다", () => {
  assert.ok(parseMusicTimeLocator(locator({ startSeconds: 68, endSeconds: 68 })));
});

// -----------------------------------------------------------------------------
// 받지 않는 모양
// -----------------------------------------------------------------------------

test("끝이 시작보다 앞이면 받지 않는다", () => {
  // 그대로 그리면 `01:34–01:08`이 된다.
  assert.equal(
    parseMusicTimeLocator(locator({ startSeconds: 94, endSeconds: 68 })),
    null,
  );
});

test("시작 시점이 없으면 받지 않는다", () => {
  assert.equal(parseMusicTimeLocator({ kind: MUSIC_TIME_KIND }), null);
  assert.equal(
    parseMusicTimeLocator({ kind: MUSIC_TIME_KIND, startSeconds: null }),
    null,
  );
});

test("음수와 소수를 받지 않는다", () => {
  assert.equal(parseMusicTimeLocator(locator({ startSeconds: -1 })), null);
  assert.equal(parseMusicTimeLocator(locator({ startSeconds: 1.5 })), null);
  assert.equal(parseMusicTimeLocator(locator({ endSeconds: -5 })), null);
});

test("터무니없이 긴 시점을 받지 않는다", () => {
  assert.equal(
    parseMusicTimeLocator(locator({ startSeconds: 86401, endSeconds: null })),
    null,
  );
});

test("너무 긴 이름을 받지 않는다", () => {
  const long = "가".repeat(MAX_MUSIC_LABEL_LENGTH + 1);

  assert.equal(parseMusicTimeLocator(locator({ label: long })), null);
  assert.ok(
    parseMusicTimeLocator(
      locator({ label: "가".repeat(MAX_MUSIC_LABEL_LENGTH) }),
    ),
  );
});

test("PDF의 자리를 음악으로 읽지 않는다", () => {
  /*
    둘이 같은 칸(JSONB)을 쓴다. 섞이면 음악 화면이 PDF 기록을 그리려 들고
    그 반대도 된다. `kind`가 그것을 가른다.
  */
  assert.equal(
    parseMusicTimeLocator({
      kind: PDF_SELECTION_KIND,
      sourceFileId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      page: 17,
      selectedText: "문장",
      contextBefore: "",
      contextAfter: "",
      rects: [],
      fileChecksum: null,
    }),
    null,
  );
});

test("아무 값이나 받지 않는다", () => {
  for (const value of [null, undefined, {}, "01:08", 68, [], { kind: "x" }]) {
    assert.equal(parseMusicTimeLocator(value), null, JSON.stringify(value));
  }
});

// -----------------------------------------------------------------------------
// 사람이 보는 줄
// -----------------------------------------------------------------------------

test("13.4절의 첫 줄을 그대로 만든다", () => {
  assert.equal(describeMusicTime(locator()), "01:08–01:34 / 2절 후렴");
});

test("이름이 없으면 시간만 적는다", () => {
  // 슬래시 뒤에 아무것도 없는 줄을 두지 않는다.
  assert.equal(
    describeMusicTime({ kind: MUSIC_TIME_KIND, startSeconds: 68, endSeconds: 94 }),
    "01:08–01:34",
  );
  assert.equal(
    describeMusicTime(locator({ label: "   " })),
    "01:08–01:34",
  );
});

test("끝이 없으면 한 시점만 적는다", () => {
  assert.equal(
    describeMusicTime({
      kind: MUSIC_TIME_KIND,
      startSeconds: 68,
      label: "도입부",
    }),
    "01:08 / 도입부",
  );
});
