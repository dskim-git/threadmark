/**
 * 그림 기록의 자리 단위 검사. (설계 문서 16절, 2026-10-04)
 *
 * 이 값이 틀리면 **기록은 남는데 어느 장의 것인지 되짚을 수 없다.**
 * PDF 쪽과 같은 까닭으로 붙잡는다. (`pdf-locator.test.mjs`)
 *
 * 특히 **몇 번째 장인지를 담지 않기로 한 결정**을 여기서 지킨다. 번호를
 * 담으면 파일을 떼거나 더할 때 밀리는데, 그때 오류는 나지 않고 가리키는
 * 곳만 달라진다. 조용한 고장이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_PAGE_KIND,
  IMAGE_REGION_KIND,
  MIN_REGION_SIZE,
  describeImageLocator,
  describeImagePage,
  formatRegionParam,
  parseImageLocator,
  parseRegionParam,
} from "../src/lib/captures/image-locator.ts";

const FILE_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const FILE_B = "9c858901-8a57-4791-81fe-4c455b099bc9";
const FILE_C = "0e37df36-f698-11e6-8dd4-cb9ced3df976";

// -----------------------------------------------------------------------------
// 담긴 값 읽기
// -----------------------------------------------------------------------------

test("그림 자리를 읽는다", () => {
  const locator = parseImageLocator({
    kind: IMAGE_PAGE_KIND,
    sourceFileId: FILE_A,
    fileChecksum: "abc123",
  });

  assert.equal(locator.kind, IMAGE_PAGE_KIND);
  assert.equal(locator.sourceFileId, FILE_A);
  assert.equal(locator.fileChecksum, "abc123");
});

test("checksum이 없어도 읽는다", () => {
  // 바이너리가 아닌 파일에는 Drive가 md5를 주지 않는다.
  const locator = parseImageLocator({
    kind: IMAGE_PAGE_KIND,
    sourceFileId: FILE_A,
    fileChecksum: null,
  });

  assert.equal(locator.fileChecksum, null);
});

test("어느 파일인지 없으면 자리가 아니다", () => {
  /*
    **이 값 하나가 장을 가린다.** 없으면 되짚어 갈 데가 없고, 그런 기록은
    `어디서 가져온 말인지` 모르는 기록이 된다.
  */
  assert.equal(
    parseImageLocator({ kind: IMAGE_PAGE_KIND, fileChecksum: null }),
    null,
  );
  assert.equal(
    parseImageLocator({
      kind: IMAGE_PAGE_KIND,
      sourceFileId: "파일아님",
      fileChecksum: null,
    }),
    null,
  );
});

test("다른 갈래의 자리를 그림 자리로 읽지 않는다", () => {
  /*
    `locator`는 jsonb 한 칸이라 PDF·음악·영상의 자리가 모두 같은 자리에
    들어온다. **`kind`가 가린다.** 섞이면 기록 목록이 PDF 메모에
    `2장으로`를 붙인다.
  */
  assert.equal(
    parseImageLocator({
      kind: "pdf-page",
      sourceFileId: FILE_A,
      page: 3,
      fileChecksum: null,
    }),
    null,
  );
  assert.equal(parseImageLocator({ kind: "music-time", seconds: 10 }), null);
  assert.equal(parseImageLocator({}), null);
  assert.equal(parseImageLocator(null), null);
  assert.equal(parseImageLocator("image-page"), null);
});

test("쪽 번호를 담아도 읽지 않는 값으로 둔다", () => {
  /*
    **번호를 담지 않기로 한 것이 이 설계의 핵심이다.** 넣어 보내도 자리에
    남지 않는다. 남겨두면 다음 사람이 그 값을 믿고 쓰게 되고, 파일을 떼는
    순간 어긋난다.
  */
  const locator = parseImageLocator({
    kind: IMAGE_PAGE_KIND,
    sourceFileId: FILE_A,
    fileChecksum: null,
    page: 7,
  });

  assert.equal(locator.sourceFileId, FILE_A);
  assert.equal("page" in locator, false);
});

// -----------------------------------------------------------------------------
// 몇 번째 장인지 세기
// -----------------------------------------------------------------------------

test("지금 목록에서 세어 장 번호를 만든다", () => {
  const order = [FILE_A, FILE_B, FILE_C];

  assert.equal(describeImagePage({ sourceFileId: FILE_A }, order), "1장");
  assert.equal(describeImagePage({ sourceFileId: FILE_B }, order), "2장");
  assert.equal(describeImagePage({ sourceFileId: FILE_C }, order), "3장");
});

test("앞의 장을 떼면 뒤의 번호가 따라 올라간다", () => {
  /*
    **번호를 담지 않아서 얻는 것이 이것이다.** 1장을 떼면 2장이 1장이 된다.
    번호를 담아 두었다면 `2장`이라고 적힌 기록이 1장짜리 자료를 가리키게
    되고, 눌러도 아무 일이 없거나 엉뚱한 곳이 열린다.
  */
  assert.equal(describeImagePage({ sourceFileId: FILE_B }, [FILE_B, FILE_C]), "1장");
});

test("목록에 없으면 null이다. 1장으로 둘러대지 않는다", () => {
  /*
    파일을 뗐거나 지운 경우다. 화면은 이 값이 null이면 `2장으로` 단추를
    아예 그리지 않는다. **없는 자리를 가리키는 링크를 만들지 않는다.**
  */
  assert.equal(describeImagePage({ sourceFileId: FILE_A }, [FILE_B]), null);
  assert.equal(describeImagePage({ sourceFileId: FILE_A }, []), null);
});

// -----------------------------------------------------------------------------
// 한 부분 고르기 (16-2)
// -----------------------------------------------------------------------------

/** 그림의 한 부분을 가리키는 자리 하나. */
function region(extra = {}) {
  return {
    kind: IMAGE_REGION_KIND,
    sourceFileId: FILE_A,
    fileChecksum: "abc",
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
    ...extra,
  };
}

test("한 부분을 가리키는 자리를 읽는다", () => {
  const parsed = parseImageLocator(region());

  assert.ok(parsed);
  assert.equal(parsed.kind, IMAGE_REGION_KIND);
  assert.equal(parsed.x, 0.1);
  assert.equal(parsed.height, 0.4);
});

test("장 전체와 한 부분이 같은 목록에서 갈린다", () => {
  /*
    `locator`는 jsonb 한 칸이라 두 갈래가 같은 데로 들어온다. **`kind`가
    가린다.** 섞여 들어와도 각자로 읽혀야 한다.
  */
  const page = parseImageLocator({
    kind: IMAGE_PAGE_KIND,
    sourceFileId: FILE_A,
    fileChecksum: null,
  });

  assert.equal(page.kind, IMAGE_PAGE_KIND);
  assert.equal(parseImageLocator(region()).kind, IMAGE_REGION_KIND);
});

test("0과 1을 벗어난 값은 자리가 아니다", () => {
  /*
    **상대값이라 0~1 안에 있어야 한다.** 벗어나면 그림 밖을 가리키고,
    화면은 보이지 않는 상자를 그린다. 오류는 나지 않는다.
  */
  assert.equal(parseImageLocator(region({ x: -0.1 })), null);
  assert.equal(parseImageLocator(region({ y: 1.2 })), null);
  assert.equal(parseImageLocator(region({ width: 2 })), null);
});

test("그림 밖으로 넘어가는 상자는 자리가 아니다", () => {
  /*
    칸마다 0~1이어도 **합이 1을 넘으면 바깥을 가리킨다.** 끌다가 칸 밖으로
    나가면 그런 값이 만들어진다. 화면에서 가두더라도 마지막 보장은 여기다.
  */
  assert.equal(parseImageLocator(region({ x: 0.8, width: 0.3 })), null);
  assert.equal(parseImageLocator(region({ y: 0.9, height: 0.2 })), null);

  // 딱 맞는 것은 받는다. 오른쪽 끝까지 고를 수 있어야 한다.
  assert.ok(parseImageLocator(region({ x: 0.7, width: 0.3 })));
});

test("눈에 보이지 않을 만큼 작은 상자는 자리가 아니다", () => {
  /*
    **누르기만 해도 크기 0인 상자가 만들어진다.** 그런 상자는 보이지
    않으면서 "한 부분"이라고 적힌다. 보는 사람은 어디인지 찾다가 못 찾는다.
  */
  assert.equal(parseImageLocator(region({ width: 0 })), null);
  assert.equal(parseImageLocator(region({ height: 0.0001 })), null);
  assert.ok(parseImageLocator(region({ width: MIN_REGION_SIZE })));
});

test("장 전체에는 상자 값을 담지 않는다", () => {
  /*
    `image-page`에 좌표를 붙여 보내도 읽지 않는다. 두 갈래를 가른 뜻이
    흐려지면, 목록에서 `3장`과 `3장의 한 부분`을 가릴 수 없게 된다.
  */
  const parsed = parseImageLocator({
    kind: IMAGE_PAGE_KIND,
    sourceFileId: FILE_A,
    fileChecksum: null,
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.5,
  });

  assert.ok(parsed);
  assert.equal(parsed.kind, IMAGE_PAGE_KIND);
  assert.ok(!("x" in parsed), "장 전체 자리에 좌표가 섞여 들어왔다");
});

// -----------------------------------------------------------------------------
// 목록에 적는 말
// -----------------------------------------------------------------------------

test("장 전체와 한 부분을 다르게 적는다", () => {
  /*
    **목록에서 그 차이가 보여야 한다.** 보이지 않으면 상자를 그려 남긴
    메모를 눌렀을 때 왜 그림에 상자가 뜨는지 알 수 없다.
  */
  const ids = [FILE_A, FILE_B];

  assert.equal(
    describeImageLocator(
      { kind: IMAGE_PAGE_KIND, sourceFileId: FILE_B, fileChecksum: null },
      ids,
    ),
    "2장",
  );

  assert.equal(describeImageLocator(region(), ids), "1장의 한 부분");
});

test("셀 수 없으면 한 부분도 null이다", () => {
  // 파일을 뗀 경우다. `1장의 한 부분`으로 둘러대지 않는다.
  assert.equal(describeImageLocator(region(), [FILE_B, FILE_C]), null);
});

// -----------------------------------------------------------------------------
// 주소에 싣고 읽기
// -----------------------------------------------------------------------------

test("영역을 주소 글자로 만들고 그대로 읽는다", () => {
  const value = formatRegionParam({
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
  });

  assert.equal(value, "0.1,0.2,0.3,0.4");
  assert.deepEqual(parseRegionParam(value), {
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
  });
});

test("소수점을 넷째 자리에서 끊는다", () => {
  // 더 길게 담아도 눈이 구분하지 못한다. 주소만 길어진다.
  const value = formatRegionParam({
    x: 0.123456789,
    y: 0.5,
    width: 0.25,
    height: 0.25,
  });

  assert.equal(value, "0.1235,0.5,0.25,0.25");
});

test("모양이 어긋난 주소는 읽지 않는다", () => {
  /*
    **주소는 사람이 손으로 고칠 수 있는 자리다.** 잘못된 상자는 엉뚱한
    자리를 가리키고, 보는 사람은 그것이 틀렸다는 것을 알 수 없다.
    지어내지 않는다.
  */
  assert.equal(parseRegionParam(null), null);
  assert.equal(parseRegionParam(undefined), null);
  assert.equal(parseRegionParam(""), null);
  assert.equal(parseRegionParam("0.1,0.2,0.3"), null, "칸이 셋이면 안 된다");
  assert.equal(parseRegionParam("0.1,0.2,0.3,0.4,0.5"), null);
  assert.equal(parseRegionParam("왼쪽,0.2,0.3,0.4"), null);
  assert.equal(parseRegionParam("NaN,0.2,0.3,0.4"), null);
});

test("주소로 들어온 값도 0~1과 최소 크기를 지킨다", () => {
  // 담길 때와 읽힐 때가 같은 규칙을 쓴다. 한쪽만 느슨하면 그 길로 들어온다.
  assert.equal(parseRegionParam("-0.1,0.2,0.3,0.4"), null);
  assert.equal(parseRegionParam("0.1,0.2,1.3,0.4"), null);
  assert.equal(parseRegionParam("0.9,0.2,0.3,0.4"), null, "오른쪽을 넘는다");
  assert.equal(parseRegionParam("0.1,0.2,0,0.4"), null, "너무 작다");
});
