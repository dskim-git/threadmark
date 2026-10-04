/**
 * 파일 갈래와 "앱 안에서 열 수 있는가" 단위 검사. (17-V 2차례, 2026-10-04)
 *
 * **이 판단에 검사가 하나도 없었다.** `isReadable`이 혼자 "열기가 보이는가"를
 * 정하는데, PDF만 참이던 때부터 그림이 들어오고 음성이 들어올 때까지 아무도
 * 그것을 조이지 않았다.
 *
 * 틀려도 오류가 나지 않는 자리다. 목록에 파일이 있는데 **`열기`가 안 보이거나**,
 * 열리면 안 되는 것이 열려 빈 화면이 뜬다. 둘 다 조용해서 쓰다가 부딪히기
 * 전에는 모른다.
 *
 * 검사를 쓸 수 있게 하려고 `files.ts`에서 `file-kinds.ts`로 떼어냈다.
 * 그 파일은 서버 전용 모듈을 가져와서 단위 검사가 불러올 수 없었다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  isAudioFile,
  isImageFile,
  isOpenable,
  isPdfFile,
  isReadable,
} from "../src/lib/sources/file-kinds.ts";

/** 검사에 쓸 파일 하나. 갈래와 상태만 바꾼다. */
function file(mimeType, status = "ready") {
  return { mimeType, status };
}

// -----------------------------------------------------------------------------
// 갈래 가리기
// -----------------------------------------------------------------------------

test("갈래마다 하나씩만 참이다", () => {
  /*
    **둘이 함께 참이면 화면이 갈리는 자리에서 먼저 걸린 쪽으로 간다.**
    음성을 그림으로 보면 재생기 대신 빈 그림 칸이 뜬다.
  */
  const cases = [
    ["application/pdf", isPdfFile],
    ["image/png", isImageFile],
    ["audio/webm", isAudioFile],
  ];

  for (const [mimeType, expected] of cases) {
    for (const [, predicate] of cases) {
      assert.equal(
        predicate(file(mimeType)),
        predicate === expected,
        `${mimeType}의 갈래 판단이 어긋난다`,
      );
    }
  }
});

test("음성은 종류가 늘어도 audio로 알아본다", () => {
  /*
    `audio/`로 시작하는지로 본다. 올릴 때 받는 넷을 여기 또 적어두면,
    종류가 늘 때 고칠 곳이 둘이 된다.
  */
  for (const mimeType of [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
  ]) {
    assert.ok(isAudioFile(file(mimeType)), `${mimeType}을 음성으로 안 본다`);
  }
});

test("음성이 아닌 것을 음성으로 보지 않는다", () => {
  for (const mimeType of [
    "application/pdf",
    "image/png",
    "application/json",
    "video/mp4",
    "",
  ]) {
    assert.ok(!isAudioFile(file(mimeType)), `${mimeType}을 음성으로 봤다`);
  }
});

// -----------------------------------------------------------------------------
// 앱 안에서 열 수 있는가
// -----------------------------------------------------------------------------

test("PDF와 그림과 음성을 앱 안에서 연다", () => {
  for (const mimeType of ["application/pdf", "image/png", "audio/webm"]) {
    assert.ok(isReadable(file(mimeType)), `${mimeType}을 열 수 없다고 한다`);
  }
});

test("열어 보여줄 화면이 없는 것은 열지 않는다", () => {
  /*
    **막는 쪽도 함께 본다.** (보안 원칙 6) 여는 것만 보면 과하게 열린 것을
    놓친다. 획을 담은 json이 특히 그렇다. 올리는 것은 받지만 그것을 열어
    보여주는 화면은 없다. 열리면 빈 화면이 뜬다.
  */
  for (const mimeType of ["application/json", "video/mp4", "text/html", ""]) {
    assert.ok(!isReadable(file(mimeType)), `${mimeType}이 열렸다`);
  }
});

test("올라가는 중인 파일은 열지 않는다", () => {
  for (const mimeType of ["application/pdf", "image/png", "audio/webm"]) {
    assert.ok(
      !isReadable(file(mimeType, "pending")),
      `${mimeType}이 올라가는 중인데 열렸다`,
    );
  }
});

test("사라진 파일도 목록에는 남지만 열리지는 않는다", () => {
  /*
    둘을 가르는 것이 이 두 함수가 따로 있는 까닭이다. 목록에서 빼버리면
    Drive에서 되살린 뒤에도 들어갈 길이 없다. (설계 문서 10.4절)
  */
  for (const mimeType of ["application/pdf", "image/png", "audio/webm"]) {
    const missing = file(mimeType, "missing");

    assert.ok(isReadable(missing), `${mimeType}이 목록에서 빠졌다`);
    assert.ok(!isOpenable(missing), `${mimeType}이 없는데 열린다고 한다`);
  }
});

test("열 수 있는 것만 지금 열린다", () => {
  assert.ok(isOpenable(file("audio/mpeg")));

  // 갈래가 안 맞으면 상태가 ready여도 열리지 않는다.
  assert.ok(!isOpenable(file("application/json")));
});
