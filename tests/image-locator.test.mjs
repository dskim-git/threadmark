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
  describeImagePage,
  parseImageLocator,
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
