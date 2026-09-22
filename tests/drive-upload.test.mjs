/**
 * Drive 업로드 판단 로직 단위 검사.
 *
 * 여기서 잘못되면 두 가지가 일어난다.
 * 다룰 수 없는 파일이 Drive에 올라가거나, 올라가지 않은 파일이 완료로 기록된다.
 * 뒤쪽이 더 나쁘다. 화면에는 파일이 있다고 나오는데 열 수 없는 상태가 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_TITLE_LENGTH } from "../src/lib/sources/schema.ts";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_FILE_NAME_LENGTH,
  MAX_UPLOAD_BYTES,
  PICKER_MIME_TYPES,
  STALE_PENDING_MINUTES,
  describePickedFileProblem,
  describeUnacceptableFile,
  driveViewUrl,
  fileNameToTitle,
  folderNameForUpload,
  formatByteSize,
  isAllowedUploadMimeType,
  isStalePending,
  isTrustedUploadSessionUrl,
  parseDriveFile,
  sanitizeFileName,
  uploadStartSchema,
  verifyUploadedFile,
} from "../src/lib/drive/upload.ts";

const SOURCE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function startInput(overrides = {}) {
  return {
    sourceId: SOURCE_ID,
    fileName: "논문.pdf",
    mimeType: "application/pdf",
    byteSize: 1024,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 무엇을 받아들이는가
// -----------------------------------------------------------------------------

test("허용 목록에 있는 종류만 올릴 수 있다", () => {
  for (const mimeType of ALLOWED_UPLOAD_MIME_TYPES) {
    assert.ok(isAllowedUploadMimeType(mimeType), `${mimeType}이 막혔다`);
  }

  // 실행 가능한 파일과 압축 파일은 열어주는 화면이 없다.
  for (const mimeType of [
    "application/x-msdownload",
    "application/zip",
    "text/html",
    "image/svg+xml",
    "",
  ]) {
    assert.ok(!isAllowedUploadMimeType(mimeType), `${mimeType}이 통과했다`);
  }

  assert.ok(!isAllowedUploadMimeType(null));
  assert.ok(!isAllowedUploadMimeType(undefined));
});

test("image/svg+xml은 이미지처럼 보여도 거부한다", () => {
  // SVG 안에는 스크립트를 넣을 수 있다. 이미지 목록에 넣고 싶어지는 형식이라
  // 실수로 들어오지 않았는지 따로 확인한다.
  const parsed = uploadStartSchema.safeParse(
    startInput({ mimeType: "image/svg+xml" }),
  );

  assert.equal(parsed.success, false);
});

test("크기 상한을 넘으면 거부한다", () => {
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);

  assert.equal(
    uploadStartSchema.safeParse(startInput({ byteSize: MAX_UPLOAD_BYTES }))
      .success,
    true,
  );

  assert.equal(
    uploadStartSchema.safeParse(startInput({ byteSize: MAX_UPLOAD_BYTES + 1 }))
      .success,
    false,
  );
});

test("빈 파일과 크기를 알 수 없는 파일을 거부한다", () => {
  for (const byteSize of [0, -1, 1.5, Number.NaN]) {
    assert.equal(
      uploadStartSchema.safeParse(startInput({ byteSize })).success,
      false,
      `크기 ${byteSize}가 통과했다`,
    );
  }
});

test("잘못된 자료 식별자를 거부한다", () => {
  assert.equal(
    uploadStartSchema.safeParse(startInput({ sourceId: "not-a-uuid" })).success,
    false,
  );
});

// -----------------------------------------------------------------------------
// 파일 이름
// -----------------------------------------------------------------------------

test("경로 구분자를 이름에 남기지 않는다", () => {
  assert.equal(sanitizeFileName("자료/2026/논문.pdf"), "자료 2026 논문.pdf");
  assert.equal(sanitizeFileName("C:\\문서\\논문.pdf"), "C: 문서 논문.pdf");
});

test("눈에 보이지 않는 문자를 지운다", () => {
  // 방향 바꾸기 문자는 확장자를 다르게 보이게 만든다.
  const disguised = `보고서${String.fromCodePoint(0x202e)}fdp.exe`;

  assert.equal(sanitizeFileName(disguised), "보고서fdp.exe");

  // 폭 없는 공백으로 이름을 쪼개 두 파일을 같아 보이게 만들 수 있다.
  assert.equal(
    sanitizeFileName(`논문${String.fromCodePoint(0x200b)}.pdf`),
    "논문.pdf",
  );

  // 줄바꿈과 탭은 공백 한 칸으로 합쳐진다.
  assert.equal(sanitizeFileName("논문\n\t제목.pdf"), "논문 제목.pdf");
});

test("이름이 비거나 전부 지워지면 거부한다", () => {
  assert.equal(sanitizeFileName(""), null);
  assert.equal(sanitizeFileName("   "), null);
  assert.equal(sanitizeFileName(String.fromCodePoint(0x200b)), null);

  assert.equal(
    uploadStartSchema.safeParse(startInput({ fileName: "   " })).success,
    false,
  );
});

test("이름이 지나치게 길면 잘라낸다", () => {
  const long = `${"가".repeat(400)}.pdf`;

  assert.equal(sanitizeFileName(long)?.length, 300);
});

// -----------------------------------------------------------------------------
// 고르자마자 막는 것
// -----------------------------------------------------------------------------
// 자료를 만들면서 파일을 함께 올릴 때, 이 판단이 자료를 만들기 전에 일어난다.
// 여기서 통과시키면 "자료만 덩그러니 생기고 파일은 못 올리는" 상태가 된다.

function pickedFile(overrides = {}) {
  return {
    name: "논문.pdf",
    size: 1024,
    type: "application/pdf",
    ...overrides,
  };
}

test("올릴 수 있는 파일에는 거부 이유가 없다", () => {
  assert.equal(describeUnacceptableFile(pickedFile()), null);
  assert.equal(
    describeUnacceptableFile(pickedFile({ name: "그림.png", type: "image/png" })),
    null,
  );
});

test("고른 파일이 조건에 맞지 않으면 이유를 돌려준다", () => {
  assert.match(
    describeUnacceptableFile(pickedFile({ size: 0 })) ?? "",
    /빈 파일/,
  );
  assert.match(
    describeUnacceptableFile(pickedFile({ size: MAX_UPLOAD_BYTES + 1 })) ?? "",
    /100MB/,
  );
  assert.match(
    describeUnacceptableFile(pickedFile({ type: "application/zip" })) ?? "",
    /PDF와 이미지/,
  );
  assert.match(
    describeUnacceptableFile(pickedFile({ name: "   " })) ?? "",
    /파일 이름/,
  );
});

test("고를 때와 보낼 때의 판단이 어긋나지 않는다", () => {
  // 화면이 통과시킨 파일을 서버가 거부하면, 사용자는 "왜 되다 말지" 하게 된다.
  // 두 판단의 기준이 같은지 확인한다.
  const candidates = [
    pickedFile(),
    pickedFile({ size: 0 }),
    pickedFile({ size: MAX_UPLOAD_BYTES }),
    pickedFile({ size: MAX_UPLOAD_BYTES + 1 }),
    pickedFile({ type: "image/svg+xml" }),
    pickedFile({ type: "" }),
    pickedFile({ name: "   " }),
  ];

  for (const candidate of candidates) {
    const screenAccepts = describeUnacceptableFile(candidate) === null;
    const serverAccepts = uploadStartSchema.safeParse({
      sourceId: SOURCE_ID,
      fileName: candidate.name,
      mimeType: candidate.type,
      byteSize: candidate.size,
    }).success;

    assert.equal(
      screenAccepts,
      serverAccepts,
      `화면과 서버의 판단이 다르다: ${JSON.stringify(candidate)}`,
    );
  }
});

// -----------------------------------------------------------------------------
// 파일 이름으로 제목 만들기
// -----------------------------------------------------------------------------

test("파일 이름에서 확장자를 떼고 밑줄을 공백으로 바꾼다", () => {
  assert.equal(fileNameToTitle("벡터공간의_기저.pdf"), "벡터공간의 기저");
  assert.equal(fileNameToTitle("논문.PDF"), "논문");
});

test("붙임표는 그대로 둔다", () => {
  // 2026-03처럼 붙임표 자체가 뜻을 가지는 경우가 많다.
  assert.equal(fileNameToTitle("2026-03-보고서.pdf"), "2026-03-보고서");
});

test("확장자가 없어도 제목을 만든다", () => {
  assert.equal(fileNameToTitle("제목만있는파일"), "제목만있는파일");
});

test("쓸 만한 제목이 없으면 null을 돌려준다", () => {
  // 어설프게 채우면 사용자가 지우고 다시 쓰는 수고만 는다.
  assert.equal(fileNameToTitle(".pdf"), null);
  assert.equal(fileNameToTitle("   "), null);
  assert.equal(fileNameToTitle(""), null);
});

test("제목 한계를 넘는 제목을 만들지 않는다", () => {
  // upload.ts는 sources 쪽 모듈을 가져오지 않는다. 브라우저 번들에 딸려
  // 들어가는 것을 줄이려는 것이다. 대신 두 숫자의 관계를 여기서 지킨다.
  // 이것이 깨지면 파일 이름으로 채운 제목이 저장에서 거부된다.
  assert.ok(
    MAX_FILE_NAME_LENGTH <= MAX_TITLE_LENGTH,
    `파일 이름 한계(${MAX_FILE_NAME_LENGTH})가 제목 한계(${MAX_TITLE_LENGTH})보다 크다`,
  );

  const long = `${"가".repeat(400)}.pdf`;

  assert.ok((fileNameToTitle(long) ?? "").length <= MAX_TITLE_LENGTH);
});

test("제목에도 숨은 제어 문자를 남기지 않는다", () => {
  assert.equal(
    fileNameToTitle(`보고서${String.fromCodePoint(0x202e)}fdp.exe`),
    "보고서fdp",
  );
});

// -----------------------------------------------------------------------------
// 폴더 선택
// -----------------------------------------------------------------------------

test("논문 PDF는 Papers, 나머지 PDF는 PDFs로 간다", () => {
  assert.equal(
    folderNameForUpload({ sourceType: "paper", mimeType: "application/pdf" }),
    "Papers",
  );
  assert.equal(
    folderNameForUpload({ sourceType: "book", mimeType: "application/pdf" }),
    "PDFs",
  );
  assert.equal(
    folderNameForUpload({ sourceType: "note", mimeType: "application/pdf" }),
    "PDFs",
  );
});

test("이미지는 Images, 손글씨 자료의 이미지는 Drawings로 간다", () => {
  assert.equal(
    folderNameForUpload({ sourceType: "image", mimeType: "image/png" }),
    "Images",
  );
  assert.equal(
    folderNameForUpload({ sourceType: "drawing", mimeType: "image/png" }),
    "Drawings",
  );
});

test("아는 폴더가 없으면 null을 돌려준다", () => {
  assert.equal(
    folderNameForUpload({ sourceType: "note", mimeType: "text/plain" }),
    null,
  );
});

// -----------------------------------------------------------------------------
// 업로드 자리 주소
// -----------------------------------------------------------------------------

test("Google이 준 자리 주소만 브라우저에 넘긴다", () => {
  assert.ok(
    isTrustedUploadSessionUrl(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ABC",
    ),
  );
  assert.ok(isTrustedUploadSessionUrl("https://googleapis.com/upload/x"));
});

test("자리 주소가 https가 아니면 거부한다", () => {
  // 평문으로 보내면 파일 내용이 그대로 드러난다.
  assert.ok(
    !isTrustedUploadSessionUrl("http://www.googleapis.com/upload/drive/v3/files"),
  );
});

test("Google을 흉내 낸 주소를 거부한다", () => {
  const impostors = [
    "https://googleapis.com.example.test/upload",
    "https://notgoogleapis.com/upload",
    "https://www.googleapis.com.evil.test/upload",
    "https://evil.test/?x=https://www.googleapis.com/upload",
    "not a url",
    "",
    null,
    undefined,
    42,
  ];

  for (const value of impostors) {
    assert.ok(
      !isTrustedUploadSessionUrl(value),
      `${String(value)}가 통과했다`,
    );
  }
});

// -----------------------------------------------------------------------------
// Drive 응답 읽기
// -----------------------------------------------------------------------------

test("Drive 응답에서 필요한 값만 꺼낸다", () => {
  const file = parseDriveFile({
    id: "file-1",
    name: "논문.pdf",
    mimeType: "application/pdf",
    // Drive는 크기를 문자열로 준다.
    size: "204800",
    md5Checksum: "d41d8cd98f00b204e9800998ecf8427e",
    modifiedTime: "2026-09-22T01:02:03.000Z",
    parents: ["folder-1", 7, null],
    webViewLink: "https://drive.google.com/file/d/file-1/view",
  });

  assert.ok(file);
  assert.equal(file.byteSize, 204800);
  assert.equal(file.checksum, "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(file.modifiedAt, "2026-09-22T01:02:03.000Z");
  assert.deepEqual(file.parents, ["folder-1"]);
});

test("형태가 어긋난 Drive 응답은 받아들이지 않는다", () => {
  assert.equal(parseDriveFile(null), null);
  assert.equal(parseDriveFile("ok"), null);
  assert.equal(parseDriveFile({}), null);
  assert.equal(parseDriveFile({ id: "", name: "a", mimeType: "b" }), null);
  assert.equal(parseDriveFile({ id: "a", name: 1, mimeType: "b" }), null);
});

test("크기와 checksum이 없어도 응답 자체는 읽는다", () => {
  // Google 문서처럼 바이너리가 아닌 파일에는 이 값들이 없다.
  // 읽기는 하되 완료 판정에서 걸러낸다.
  const file = parseDriveFile({
    id: "doc-1",
    name: "문서",
    mimeType: "application/vnd.google-apps.document",
  });

  assert.ok(file);
  assert.equal(file.byteSize, null);
  assert.equal(file.checksum, null);
  assert.deepEqual(file.parents, []);
});

// -----------------------------------------------------------------------------
// 완료 판정
// -----------------------------------------------------------------------------

const expected = {
  fileName: "논문.pdf",
  byteSize: 204800,
  folderId: "folder-1",
};

function uploadedFile(overrides = {}) {
  return {
    id: "file-1",
    name: "논문.pdf",
    mimeType: "application/pdf",
    byteSize: 204800,
    checksum: "abc",
    modifiedAt: "2026-09-22T01:02:03.000Z",
    parents: ["folder-1"],
    ...overrides,
  };
}

test("시작할 때 기록한 것과 같은 파일이면 완료로 인정한다", () => {
  assert.equal(verifyUploadedFile(uploadedFile(), expected), null);
});

test("다 올라가지 않은 파일을 완료로 인정하지 않는다", () => {
  // 크기가 모자라면 중간에 끊긴 것이다.
  assert.equal(
    verifyUploadedFile(uploadedFile({ byteSize: 100 }), expected),
    "size_mismatch",
  );

  // 크기를 모르면 확인할 방법이 없다. 모르면 거부한다.
  assert.equal(
    verifyUploadedFile(uploadedFile({ byteSize: null }), expected),
    "size_mismatch",
  );
});

test("다른 파일로 바꿔치기한 결과를 완료로 인정하지 않는다", () => {
  // 브라우저가 알려준 식별자를 그대로 믿지 않는다는 뜻이다.
  assert.equal(
    verifyUploadedFile(uploadedFile({ name: "다른파일.pdf" }), expected),
    "name_mismatch",
  );

  assert.equal(
    verifyUploadedFile(uploadedFile({ parents: ["folder-2"] }), expected),
    "folder_mismatch",
  );

  assert.equal(
    verifyUploadedFile(uploadedFile({ parents: [] }), expected),
    "folder_mismatch",
  );
});

test("Drive가 정한 종류가 허용 목록 밖이면 거부한다", () => {
  assert.equal(
    verifyUploadedFile(uploadedFile({ mimeType: "text/html" }), expected),
    "type_not_allowed",
  );
});

test("폴더를 지정하지 않았으면 위치를 따지지 않는다", () => {
  assert.equal(
    verifyUploadedFile(uploadedFile({ parents: ["아무데나"] }), {
      ...expected,
      folderId: null,
    }),
    null,
  );
});

// -----------------------------------------------------------------------------
// Drive에서 고른 파일
// -----------------------------------------------------------------------------

test("Picker에는 붙일 수 있는 종류만 보여준다", () => {
  // 목록에 뜬 파일을 골랐는데 거부당하면, 사용자는 왜 안 되는지 알 수 없다.
  for (const mimeType of ALLOWED_UPLOAD_MIME_TYPES) {
    assert.ok(
      PICKER_MIME_TYPES.split(",").includes(mimeType),
      `${mimeType}이 Picker 목록에서 빠졌다`,
    );
  }

  assert.equal(PICKER_MIME_TYPES.split(",").length, ALLOWED_UPLOAD_MIME_TYPES.length);
});

test("고른 파일이 조건에 맞으면 붙일 수 있다", () => {
  assert.equal(describePickedFileProblem(uploadedFile()), null);
});

test("다룰 수 없는 종류는 골라도 거부한다", () => {
  assert.match(
    describePickedFileProblem(uploadedFile({ mimeType: "application/zip" })) ?? "",
    /PDF와 이미지/,
  );
});

test("크기를 알 수 없는 파일은 거부한다", () => {
  // Google 문서와 스프레드시트가 그렇다. 크기가 없으면 파일이 바뀌었는지
  // 판단할 근거도 없다. (설계 문서 9.2절)
  assert.match(
    describePickedFileProblem(uploadedFile({ byteSize: null })) ?? "",
    /크기를 알 수 없는/,
  );
});

test("고른 파일에는 크기 상한을 걸지 않는다", () => {
  // 상한은 "우리를 거쳐 Drive로 보내는 것"에 대한 제한이었다.
  // 이미 사용자의 Drive에 있는 파일을 크다는 이유로 막을 근거가 없다.
  const huge = uploadedFile({ byteSize: MAX_UPLOAD_BYTES * 10 });

  assert.equal(describePickedFileProblem(huge), null);

  // 반대로 올리는 쪽에는 그대로 상한이 걸린다.
  assert.notEqual(
    describeUnacceptableFile({
      name: "큰파일.pdf",
      size: MAX_UPLOAD_BYTES * 10,
      type: "application/pdf",
    }),
    null,
  );
});

test("이름을 확인할 수 없는 파일은 거부한다", () => {
  assert.match(
    describePickedFileProblem(uploadedFile({ name: "   " })) ?? "",
    /파일 이름/,
  );
});

// -----------------------------------------------------------------------------
// 정리 대상 판단
// -----------------------------------------------------------------------------

test("오래 끝나지 않은 업로드만 정리 대상으로 본다", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");

  const justStarted = new Date(now.getTime() - 60 * 1000).toISOString();
  const longAgo = new Date(
    now.getTime() - (STALE_PENDING_MINUTES + 1) * 60 * 1000,
  ).toISOString();

  assert.equal(isStalePending(justStarted, now), false);
  assert.equal(isStalePending(longAgo, now), true);
});

test("시각을 읽지 못하면 정리하지 않는다", () => {
  assert.equal(isStalePending("언제인지 모름", new Date()), false);
});

// -----------------------------------------------------------------------------
// 화면 표시
// -----------------------------------------------------------------------------

test("Drive 보기 주소에 식별자를 그대로 붙이지 않는다", () => {
  assert.equal(
    driveViewUrl("abc123"),
    "https://drive.google.com/file/d/abc123/view",
  );

  // 식별자에 경로를 끼워 넣어도 주소가 바뀌지 않는다.
  assert.ok(!driveViewUrl("../../evil").includes("../"));
});

test("크기를 읽기 쉬운 문구로 바꾼다", () => {
  assert.equal(formatByteSize(512), "512B");
  assert.equal(formatByteSize(2048), "2.0KB");
  assert.equal(formatByteSize(5 * 1024 * 1024), "5.0MB");
  assert.equal(formatByteSize(-1), "크기 알 수 없음");
});
