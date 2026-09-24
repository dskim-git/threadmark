/**
 * PDF 선택 위치 단위 검사.
 *
 * 이 값이 틀리면 기록은 남는데 "어디서 가져온 말인지" 되짚을 수 없게 된다.
 * 설계 문서 9.3절이 좌표만 저장하지 말라고 한 이유가 그것이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_TEXT_LENGTH } from "../src/lib/captures/schema.ts";
import {
  MAX_CONTEXT_LENGTH,
  MAX_RECTS,
  PDF_PAGE_KIND,
  PDF_SELECTION_KIND,
  describeLocator,
  parsePdfLocator,
  parsePdfSelectionLocator,
  tidySelectedText,
  toPageRatioRect,
  trimContextAfter,
  trimContextBefore,
  describeLocatorPages,
  joinSelectedText,
} from "../src/lib/captures/pdf-locator.ts";

const FILE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function locator(overrides = {}) {
  return {
    kind: PDF_SELECTION_KIND,
    sourceFileId: FILE_ID,
    page: 17,
    selectedText: "학생의 오류는 단순한 실수가 아니다.",
    contextBefore: "앞 문맥",
    contextAfter: "뒤 문맥",
    rects: [{ x: 0.18, y: 0.32, width: 0.54, height: 0.04 }],
    fileChecksum: "d41d8cd98f00b204e9800998ecf8427e",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 형태 검사
// -----------------------------------------------------------------------------

test("설계 문서 6.3절의 모양을 받아들인다", () => {
  const parsed = parsePdfSelectionLocator(locator());

  assert.ok(parsed);
  assert.equal(parsed.page, 17);
  assert.equal(parsed.rects.length, 1);
});

test("좌표가 0~1 밖이면 받아들이지 않는다", () => {
  // 설계 문서 6.3절: 좌표는 픽셀이 아니라 0~1 비율로 저장한다.
  // 픽셀 값이 잘못 들어오면 여기서 걸러야 한다.
  assert.equal(
    parsePdfSelectionLocator(
      locator({ rects: [{ x: 120, y: 340, width: 500, height: 20 }] }),
    ),
    null,
  );

  assert.equal(
    parsePdfSelectionLocator(
      locator({ rects: [{ x: -0.1, y: 0.2, width: 0.3, height: 0.1 }] }),
    ),
    null,
  );
});

test("고른 글이 비어 있으면 받아들이지 않는다", () => {
  assert.equal(parsePdfSelectionLocator(locator({ selectedText: "" })), null);
});

test("페이지 번호가 1보다 작으면 받아들이지 않는다", () => {
  assert.equal(parsePdfSelectionLocator(locator({ page: 0 })), null);
  assert.equal(parsePdfSelectionLocator(locator({ page: 1.5 })), null);
});

test("어느 파일인지 없으면 받아들이지 않는다", () => {
  // 한 자료에 PDF가 여럿일 수 있어서, 이 값이 없으면 되짚을 수 없다.
  assert.equal(parsePdfSelectionLocator(locator({ sourceFileId: "" })), null);
  assert.equal(
    parsePdfSelectionLocator(locator({ sourceFileId: "파일1" })),
    null,
  );
});

test("checksum이 없는 파일도 받아들인다", () => {
  // Google 문서처럼 바이너리가 아닌 파일에는 checksum이 없다.
  assert.ok(parsePdfSelectionLocator(locator({ fileChecksum: null })));
});

test("사각형이 너무 많으면 받아들이지 않는다", () => {
  const many = Array.from({ length: MAX_RECTS + 1 }, () => ({
    x: 0.1,
    y: 0.1,
    width: 0.1,
    height: 0.1,
  }));

  assert.equal(parsePdfSelectionLocator(locator({ rects: many })), null);

  // 한계까지는 받아들인다.
  assert.ok(parsePdfSelectionLocator(locator({ rects: many.slice(0, MAX_RECTS) })));
});

test("PDF 선택이 아닌 값은 null이다", () => {
  // locator는 JSONB라 무엇이든 들어갈 수 있다. 읽는 쪽이 모양을 확인한다.
  assert.equal(parsePdfSelectionLocator({}), null);
  assert.equal(parsePdfSelectionLocator(null), null);
  assert.equal(parsePdfSelectionLocator("17쪽"), null);
  assert.equal(
    parsePdfSelectionLocator({ kind: "video-time", startSeconds: 754 }),
    null,
  );
});

test("고른 글 길이는 기록 본문과 같은 한계를 쓴다", () => {
  // 화면에서 통과한 글이 저장에서 거부되면 사용자는 이유를 알 수 없다.
  assert.ok(parsePdfSelectionLocator(locator({ selectedText: "가".repeat(MAX_TEXT_LENGTH) })));
  assert.equal(
    parsePdfSelectionLocator(
      locator({ selectedText: "가".repeat(MAX_TEXT_LENGTH + 1) }),
    ),
    null,
  );
});

// -----------------------------------------------------------------------------
// 페이지 메모 (문장을 고르지 않은 기록)
// -----------------------------------------------------------------------------

function pageLocator(overrides = {}) {
  return {
    kind: PDF_PAGE_KIND,
    sourceFileId: FILE_ID,
    page: 17,
    fileChecksum: "d41d8cd98f00b204e9800998ecf8427e",
    ...overrides,
  };
}

test("쪽만 가리키는 자리를 받아들인다", () => {
  const parsed = parsePdfLocator(pageLocator());

  assert.ok(parsed);
  assert.equal(parsed.kind, PDF_PAGE_KIND);
  assert.equal(parsed.page, 17);
});

test("쪽 메모는 고른 문장 자리를 통과하지 않는다", () => {
  // 두 모양을 섞으면 "고르긴 했는데 내용이 없다"와 "애초에 고르지 않았다"를
  // 구분할 수 없게 된다.
  assert.equal(parsePdfSelectionLocator(pageLocator()), null);
});

test("고른 문장 자리도 통합 판독기가 받아들인다", () => {
  const parsed = parsePdfLocator(locator());

  assert.ok(parsed);
  assert.equal(parsed.kind, PDF_SELECTION_KIND);
});

test("쪽 메모에도 어느 파일인지와 쪽 번호가 있어야 한다", () => {
  assert.equal(parsePdfLocator(pageLocator({ sourceFileId: "없음" })), null);
  assert.equal(parsePdfLocator(pageLocator({ page: 0 })), null);
});

test("알 수 없는 종류는 통합 판독기도 거부한다", () => {
  assert.equal(parsePdfLocator({ kind: "video-time", startSeconds: 754 }), null);
  assert.equal(parsePdfLocator({}), null);
});

test("두 모양 모두 몇 쪽인지 보여준다", () => {
  assert.equal(describeLocator(pageLocator()), "17쪽");
  assert.equal(describeLocator(locator()), "17쪽");
});

// -----------------------------------------------------------------------------
// 고른 글 다듬기
// -----------------------------------------------------------------------------

test("줄이 끝나서 생긴 줄바꿈을 공백으로 바꾼다", () => {
  // PDF에서 고르면 줄마다 줄바꿈이 들어간다. 원래 문단이 아니다.
  assert.equal(
    tidySelectedText("학생의 오류는\n단순한 실수가\n아니다."),
    "학생의 오류는 단순한 실수가 아니다.",
  );
});

test("빈 줄은 문단이 바뀐 것으로 본다", () => {
  assert.equal(
    tidySelectedText("첫 문단이다.\n\n둘째 문단이다."),
    "첫 문단이다.\n둘째 문단이다.",
  );
});

test("줄 끝의 붙임표는 건드리지 않는다", () => {
  // 설계 문서 9.3절이 하이픈 처리를 오차가 생길 수 있는 경우로 꼽았다.
  // 원래 붙임표인지 줄 끝에서 잘린 것인지 우리가 가릴 수 없다.
  assert.equal(tidySelectedText("co-\noperate"), "co- operate");
});

test("여러 공백과 탭을 한 칸으로 줄인다", () => {
  assert.equal(tidySelectedText("앞  \t  뒤"), "앞 뒤");
  assert.equal(tidySelectedText("   \n  "), "");
});

// -----------------------------------------------------------------------------
// 앞뒤 문맥
// -----------------------------------------------------------------------------

test("앞 문맥은 뒤쪽을, 뒤 문맥은 앞쪽을 남긴다", () => {
  // 선택한 글에 붙어 있는 쪽이 되짚을 때 쓸모 있다.
  const long = `시작${"가".repeat(MAX_CONTEXT_LENGTH)}끝`;

  const before = trimContextBefore(long);
  const after = trimContextAfter(long);

  assert.equal(before.length, MAX_CONTEXT_LENGTH);
  assert.equal(after.length, MAX_CONTEXT_LENGTH);

  assert.ok(before.endsWith("끝"));
  assert.ok(after.startsWith("시작"));
});

test("짧은 문맥은 그대로 둔다", () => {
  assert.equal(trimContextBefore("앞 문맥"), "앞 문맥");
  assert.equal(trimContextAfter("뒤 문맥"), "뒤 문맥");
});

// -----------------------------------------------------------------------------
// 좌표 변환
// -----------------------------------------------------------------------------

const PAGE = { left: 100, top: 50, width: 800, height: 1000 };

test("화면 좌표를 0~1 비율로 바꾼다", () => {
  const rect = toPageRatioRect(
    { left: 260, top: 150, width: 400, height: 20 },
    PAGE,
  );

  assert.ok(rect);
  assert.equal(rect.x, 0.2);
  assert.equal(rect.y, 0.1);
  assert.equal(rect.width, 0.5);
  assert.equal(rect.height, 0.02);
});

test("배율이 달라도 같은 자리는 같은 값이 나온다", () => {
  // 비율로 담는 이유다. 픽셀로 담으면 확대율에 묶인다.
  const atOneX = toPageRatioRect(
    { left: 260, top: 150, width: 400, height: 20 },
    PAGE,
  );

  const atTwoX = toPageRatioRect(
    { left: 520, top: 300, width: 800, height: 40 },
    { left: 200, top: 100, width: 1600, height: 2000 },
  );

  assert.deepEqual(atOneX, atTwoX);
});

test("페이지를 벗어난 선택은 잘라 넣는다", () => {
  // 가장자리를 살짝 넘겼다고 저장이 통째로 거부되면 사용자만 답답하다.
  const rect = toPageRatioRect(
    { left: 0, top: 0, width: 2000, height: 3000 },
    PAGE,
  );

  assert.ok(rect);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, 0);
  assert.equal(rect.width, 1);
  assert.equal(rect.height, 1);
});

test("크기가 없는 조각은 버린다", () => {
  // 줄 사이의 빈틈에서 생기는 것들이다.
  assert.equal(
    toPageRatioRect({ left: 200, top: 100, width: 0, height: 10 }, PAGE),
    null,
  );
  assert.equal(
    toPageRatioRect({ left: 200, top: 100, width: 10, height: 0 }, PAGE),
    null,
  );
});

test("페이지 크기를 모르면 계산하지 않는다", () => {
  assert.equal(
    toPageRatioRect(
      { left: 200, top: 100, width: 10, height: 10 },
      { left: 0, top: 0, width: 0, height: 0 },
    ),
    null,
  );
});

// -----------------------------------------------------------------------------
// 화면 표시
// -----------------------------------------------------------------------------

test("기록 목록에 보여줄 자리를 만든다", () => {
  assert.equal(describeLocator(locator()), "17쪽");
  assert.equal(describeLocator({}), null);
});

// -----------------------------------------------------------------------------
// 쪽을 넘어가는 문장 잇기 (15-G)
// -----------------------------------------------------------------------------

test("보통은 공백 하나로 잇는다", () => {
  assert.equal(
    joinSelectedText("학생의 오류는", "교사의 설명과 무관하지 않다."),
    "학생의 오류는 교사의 설명과 무관하지 않다.",
  );
});

test("붙임표로 끝나면 공백 없이 붙인다", () => {
  // 조판이 낱말을 쪼갠 자리다. 공백을 넣으면 없던 띄어쓰기가 생긴다.
  assert.equal(joinSelectedText("develop-", "ment of proof"), "develop-ment of proof");
});

test("붙임표를 지우지 않는다", () => {
  /*
    인쇄된 쪽에 그 표가 있다. 인용은 원문 그대로여야 하고, 무엇을 지울지
    우리가 판단할 수 없다. (설계 문서 2.4절)
  */
  assert.ok(joinSelectedText("develop-", "ment").includes("-"));
});

test("여러 모양의 붙임표를 모두 알아본다", () => {
  // 소프트 하이픈은 눈에 보이지 않으면서 글자로는 있다. 빠뜨리면 공백이 낀다.
  for (const hyphen of ["-", "‐", "‑", "­"]) {
    assert.equal(
      joinSelectedText(`develop${hyphen}`, "ment"),
      `develop${hyphen}ment`,
      JSON.stringify(hyphen),
    );
  }
});

test("잇기 전에 각 조각을 다듬는다", () => {
  // PDF에서 온 글에는 줄바꿈과 이어진 공백이 섞여 있다.
  assert.equal(
    joinSelectedText("앞 조각\n입니다  ", "  뒤\n조각입니다"),
    "앞 조각 입니다 뒤 조각입니다",
  );
});

test("한쪽이 비면 나머지를 그대로 돌려준다", () => {
  assert.equal(joinSelectedText("", "뒤 조각"), "뒤 조각");
  assert.equal(joinSelectedText("앞 조각", ""), "앞 조각");
  assert.equal(joinSelectedText("   ", "뒤 조각"), "뒤 조각");
});

test("세 조각을 차례로 이을 수 있다", () => {
  // 문장이 세 쪽에 걸칠 수도 있다. 이어 붙이기를 두 번 누르는 경우다.
  const first = joinSelectedText("한 문장이", "쪽을 두 번");

  assert.equal(joinSelectedText(first, "넘어간다."), "한 문장이 쪽을 두 번 넘어간다.");
});

test("한 쪽에서 끝난 인용은 쪽 하나로 말한다", () => {
  assert.equal(describeLocatorPages({ page: 9 }), "9쪽");
  // endPage가 시작 쪽과 같아도 범위로 보이지 않는다.
  assert.equal(describeLocatorPages({ page: 9, endPage: 9 }), "9쪽");
});

test("쪽을 넘어간 인용은 범위로 말한다", () => {
  assert.equal(describeLocatorPages({ page: 9, endPage: 10 }), "9~10쪽");
  assert.equal(describeLocatorPages({ page: 9, endPage: 11 }), "9~11쪽");
});

test("쪽을 넘어간 인용도 저장할 수 있는 모양이다", () => {
  /*
    endPage는 나중에 더한 칸이다. 예전에 저장한 기록에는 없다.
    둘 다 통과해야 한다.
  */
  const base = {
    kind: PDF_SELECTION_KIND,
    sourceFileId: FILE_ID,
    page: 9,
    selectedText: "쪽을 넘어가는 문장이다.",
    contextBefore: "",
    contextAfter: "",
    rects: [],
    fileChecksum: null,
  };

  assert.ok(parsePdfSelectionLocator(base));
  assert.ok(parsePdfSelectionLocator({ ...base, endPage: 10 }));
});
