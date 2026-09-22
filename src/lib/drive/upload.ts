/**
 * Drive 업로드의 순수 판단 로직.
 *
 * 네트워크 호출은 files.ts에, 데이터베이스 접근은 Server Action에 둔다.
 * 여기에는 "무엇을 받아들이고 무엇을 거부하는가"만 남긴다. 단위 검사로 확인한다.
 *
 * 설계 문서 10.3절이 요구하는 것은 "업로드 성공 후에만 ready로 바꾼다"이다.
 * 성공했는지 판단하는 규칙이 이 파일의 verifyUploadedFile에 있다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
// 타입만 가져온다. 값을 가져오면 이 모듈이 sources 쪽 모듈을 함께 끌고 들어간다.
import type { SourceType } from "../sources/types.ts";

/**
 * 한 파일의 크기 상한.
 *
 * 설계 문서에 정해진 값이 없다. 논문 PDF는 대개 수 MB이고, 스캔본이나
 * 도판이 많은 자료가 수십 MB까지 간다. 100MB면 그 범위를 덮으면서,
 * 실수로 동영상을 올렸을 때는 걸린다.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * 올릴 수 있는 파일 종류.
 *
 * 설계 문서에 목록이 없다. MVP가 PDF 뷰어 중심(22절)이므로 PDF를 확실히 열고,
 * 이미지 Source 유형(5.1절)이 이미 있으므로 흔한 이미지 형식을 함께 연다.
 * 음성과 그림은 그 화면을 만드는 단계에서 늘린다.
 *
 * 목록을 좁게 시작하는 이유는, 무엇이 올라올지 모르는 상태로 파일을 받으면
 * 나중에 그 파일을 열어 보여주는 쪽에서 감당할 수 없기 때문이다.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export function isAllowedUploadMimeType(
  value: unknown,
): value is AllowedUploadMimeType {
  return (
    typeof value === "string" &&
    (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(value)
  );
}

export const MAX_FILE_NAME_LENGTH = 300;

/**
 * 파일 이름에서 지워야 할 문자인지 판단한다.
 *
 * 정규식 대신 코드 값으로 판단한다. 지우려는 것이 대부분 눈에 보이지 않는
 * 문자라서, 정규식 안에 그대로 적으면 소스 코드에서 무엇을 지우는지 읽을 수 없다.
 *
 *   0x00-0x1f, 0x7f-0x9f  제어 문자
 *   0x200b-0x200f         폭 없는 문자와 방향 표시
 *   0x202a-0x202e         방향 바꾸기
 *   0x2066-0x2069         방향 고립
 *
 * 방향 제어 문자를 지우는 이유는 그것이 이름을 실제와 다르게 보이게 만들기
 * 때문이다. `보고서fdp.exe`에 방향 바꾸기를 끼워 넣으면 화면에는
 * `보고서exe.pdf`로 보인다. 목록에서 파일 종류를 착각하게 된다.
 */
function isHiddenControlCharacter(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/**
 * 파일 이름을 정리한다.
 *
 * 이 이름은 Drive에 그대로 올라가고, 나중에 화면에 표시된다.
 *
 * 경로 구분자를 공백으로 바꾸는 이유는 브라우저가 폴더째 올릴 때
 * `폴더/파일.pdf` 같은 이름이 들어올 수 있어서다. Drive에서는 그 슬래시가
 * 폴더를 뜻하지 않으므로, 이름 안에 남으면 어디에 있는 파일인지 착각하게 만든다.
 */
export function sanitizeFileName(value: string): string | null {
  let cleaned = "";

  for (const character of value) {
    // 줄바꿈과 탭도 제어 문자다. 다만 이것들은 지우지 않고 공백으로 바꾼다.
    // 지워버리면 `논문\n제목.pdf`가 `논문제목.pdf`가 되어 단어가 붙는다.
    if (/\s/.test(character) || character === "/" || character === "\\") {
      cleaned += " ";
      continue;
    }

    if (isHiddenControlCharacter(character.codePointAt(0) ?? 0)) {
      continue;
    }

    cleaned += character;
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (cleaned.length === 0) {
    return null;
  }

  return cleaned.slice(0, MAX_FILE_NAME_LENGTH);
}

/**
 * 업로드 시작 요청.
 *
 * 브라우저가 보내는 값이다. 크기와 종류는 여기서 한 번 거르지만, 이것만으로
 * 끝나지 않는다. 브라우저는 크기를 거짓으로 말할 수 있다. 실제로 들어온 것이
 * 무엇인지는 업로드가 끝난 뒤 Drive에 물어서 확인한다. (verifyUploadedFile)
 */
export const uploadStartSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  fileName: z
    .string()
    .transform((value) => sanitizeFileName(value))
    .refine((value): value is string => value !== null, {
      message: "파일 이름을 확인할 수 없습니다.",
    }),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES, {
    message: "PDF와 이미지(PNG, JPEG, WebP) 파일만 올릴 수 있습니다.",
  }),
  byteSize: z
    .number()
    .int("파일 크기를 확인할 수 없습니다.")
    .positive("빈 파일은 올릴 수 없습니다.")
    .max(
      MAX_UPLOAD_BYTES,
      `파일은 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB를 넘을 수 없습니다.`,
    ),
});

export type UploadStartInput = z.infer<typeof uploadStartSchema>;

/**
 * 고른 파일을 올릴 수 없는 이유를 찾는다. 올릴 수 있으면 null이다.
 *
 * 서버도 uploadStartSchema로 같은 것을 확인한다. 여기서 한 번 더 보는 이유는
 * 두 가지다. 올릴 수 없는 파일을 고른 사람이 왕복을 기다리지 않아도 되고,
 * 자료를 만들면서 파일을 함께 올릴 때는 **자료를 만들기 전에** 걸러야
 * "자료만 덩그러니 생기는" 일이 없다.
 *
 * File 자체가 아니라 필요한 속성만 받는다. 그래야 브라우저 없이 검사할 수 있다.
 */
export function describeUnacceptableFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.size <= 0) {
    return "빈 파일은 올릴 수 없습니다.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `파일이 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB를 넘습니다. 지금 고른 파일은 ${formatByteSize(file.size)}입니다.`;
  }

  if (!isAllowedUploadMimeType(file.type)) {
    return "PDF와 이미지(PNG, JPEG, WebP) 파일만 올릴 수 있습니다.";
  }

  if (sanitizeFileName(file.name) === null) {
    return "파일 이름을 확인할 수 없습니다.";
  }

  return null;
}

/**
 * 파일 이름에서 자료 제목을 만든다.
 *
 * 자료를 만들면서 파일을 고르면 제목 칸을 이것으로 채운다.
 * 이미 적어둔 제목은 건드리지 않는다. 사용자가 쓴 것이 파일 이름보다 낫다.
 *
 * 확장자를 떼고 밑줄을 공백으로 바꾼다. 붙임표는 그대로 둔다.
 * `2026-03-보고서`처럼 붙임표 자체가 뜻을 가지는 경우가 많기 때문이다.
 *
 * 쓸 만한 제목이 나오지 않으면 null을 돌려주고, 그때는 칸을 비워둔다.
 * 어설프게 채우면 사용자가 지우고 다시 쓰는 수고만 는다.
 */
export function fileNameToTitle(fileName: string): string | null {
  const cleaned = sanitizeFileName(fileName);

  if (cleaned === null) {
    return null;
  }

  const title = cleaned
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // sanitizeFileName이 이미 MAX_FILE_NAME_LENGTH로 잘라두었고, 확장자를 떼면
  // 더 짧아지므로 여기서 다시 자를 필요는 없다.
  //
  // 다만 그 한계가 제목 한계(MAX_TITLE_LENGTH)를 넘지 않아야 저장이 된다.
  // 두 숫자를 여기서 import로 묶지 않는 이유는, 그러면 이 모듈이 sources 쪽
  // 모듈을 함께 끌고 들어가기 때문이다. 대신 단위 검사가 관계를 지킨다.
  // (tests/drive-upload.test.mjs의 "제목 한계를 넘는 제목을 만들지 않는다")
  return title.length > 0 ? title : null;
}

/**
 * 어느 폴더에 넣을지 정한다.
 *
 * 설계 문서 10.1절의 권장 폴더를 쓴다. 분류의 기준은 파일 종류이되,
 * 논문 자료의 PDF만 Papers로 보낸다. 사용자가 Drive에서 직접 열어볼 때
 * "논문은 Papers에, 나머지 PDF는 PDFs에"가 가장 찾기 쉽다.
 *
 * 폴더 구조를 Source·Project 관계와 같게 만들지 않는다는 원칙(10.1절)은
 * 그대로다. 여기서 보는 것은 파일의 성격이지 자료의 분류가 아니다.
 *
 * 아는 폴더가 없으면 null을 돌려주고, 그때는 ThreadMark 루트에 넣는다.
 */
export function folderNameForUpload(options: {
  sourceType: SourceType;
  mimeType: string;
}): string | null {
  if (options.mimeType === "application/pdf") {
    return options.sourceType === "paper" ? "Papers" : "PDFs";
  }

  if (options.mimeType.startsWith("image/")) {
    return options.sourceType === "drawing" ? "Drawings" : "Images";
  }

  if (options.mimeType.startsWith("audio/")) {
    return "Audio";
  }

  return null;
}

/**
 * 업로드 자리를 받아올 주소가 믿을 만한지 확인한다.
 *
 * 이 주소는 브라우저에 전달되고, 브라우저는 여기에 사용자의 파일을 그대로 보낸다.
 * 그래서 Google이 준 것이 맞는지 한 번 본다. 응답이 뒤바뀌었거나 중간에서
 * 손댄 값이 섞이면, 사용자의 파일이 엉뚱한 곳으로 나간다.
 *
 * https만 받는다. 평문으로 보내면 파일 내용이 그대로 드러난다.
 */
export function isTrustedUploadSessionUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  return (
    url.hostname === "googleapis.com" || url.hostname.endsWith(".googleapis.com")
  );
}

/** Drive가 알려주는 파일 정보 중 우리가 쓰는 부분. (설계 문서 9.2절) */
export type DriveFileFacts = {
  id: string;
  name: string;
  mimeType: string;
  /** Drive는 크기를 문자열로 준다. 바이너리가 아닌 파일에는 값이 없다. */
  byteSize: number | null;
  /** md5Checksum. 파일이 교체되었는지 판단하는 데 쓴다. */
  checksum: string | null;
  modifiedAt: string | null;
  parents: string[];
};

/**
 * Drive 응답에서 필요한 값만 꺼낸다.
 *
 * 외부 응답을 신뢰 가능한 입력으로 취급하지 않는다. (설계 문서 18절)
 * 형태가 어긋나면 null을 돌려주고, 부르는 쪽이 실패로 처리한다.
 */
export function parseDriveFile(value: unknown): DriveFileFacts | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;

  if (typeof body.id !== "string" || body.id.length === 0) {
    return null;
  }

  if (typeof body.name !== "string" || typeof body.mimeType !== "string") {
    return null;
  }

  let byteSize: number | null = null;

  if (typeof body.size === "string" && /^\d+$/.test(body.size)) {
    byteSize = Number.parseInt(body.size, 10);
  } else if (typeof body.size === "number" && Number.isInteger(body.size)) {
    byteSize = body.size;
  }

  const checksum =
    typeof body.md5Checksum === "string" && body.md5Checksum.length > 0
      ? body.md5Checksum
      : null;

  const modifiedAt =
    typeof body.modifiedTime === "string" && body.modifiedTime.length > 0
      ? body.modifiedTime
      : null;

  const parents = Array.isArray(body.parents)
    ? body.parents.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: body.id,
    name: body.name,
    mimeType: body.mimeType,
    byteSize,
    checksum,
    modifiedAt,
    parents,
  };
}

/**
 * Picker 화면에 보여줄 파일 종류.
 *
 * 올릴 수 없는 종류가 목록에 뜨면, 골랐다가 거부당하는 일이 생긴다.
 * 고를 수 있는 것만 보여주는 편이 낫다.
 */
export const PICKER_MIME_TYPES = ALLOWED_UPLOAD_MIME_TYPES.join(",");

/**
 * 사용자가 Picker로 고른 Drive 파일을 붙일 수 있는지 본다.
 *
 * 업로드와 다른 점이 하나 있다. **크기 상한을 걸지 않는다.**
 *
 * 상한(100MB)은 "우리 앱을 거쳐 Drive로 보내는 것"에 대한 제한이었다.
 * 고른 파일은 이미 사용자의 Drive에 있고, 우리는 그것을 가리키는 표지만 만든다.
 * 이미 가지고 있는 파일을 크다는 이유로 못 쓰게 하는 것은 근거가 없다.
 *
 * 종류는 그대로 제한한다. 나중에 화면에서 열어 보여줄 수 없는 파일을
 * 붙여두면, 목록에는 있는데 아무것도 할 수 없는 항목이 남는다.
 */
export function describePickedFileProblem(file: DriveFileFacts): string | null {
  if (!isAllowedUploadMimeType(file.mimeType)) {
    return "PDF와 이미지(PNG, JPEG, WebP)만 붙일 수 있습니다.";
  }

  // Google 문서나 스프레드시트에는 크기가 없다. 표에서 byte_size가 필수이기도 하고,
  // 나중에 파일이 바뀌었는지 판단할 근거도 없어진다. (설계 문서 9.2절)
  if (file.byteSize === null) {
    return "크기를 알 수 없는 파일입니다. Google 문서와 스프레드시트는 아직 다루지 못합니다.";
  }

  if (sanitizeFileName(file.name) === null) {
    return "파일 이름을 확인할 수 없습니다.";
  }

  return null;
}

/** 업로드를 완료로 인정하지 않은 이유. 화면 문구를 고르는 데 쓴다. */
export type UploadRejection =
  | "name_mismatch"
  | "size_mismatch"
  | "type_not_allowed"
  | "folder_mismatch";

/**
 * 올라온 파일이 우리가 자리를 잡아둔 그 파일인지 확인한다.
 *
 * 설계 문서 10.3절: 업로드 성공 후에만 ready로 바꾼다.
 * "성공했다"는 브라우저의 말이 아니라 Drive에 직접 물어본 결과로 판단한다.
 *
 * 브라우저는 업로드를 마친 뒤 파일 식별자를 우리에게 알려준다. 그 값 자체는
 * 믿지 않는다. 그 식별자로 Drive에 물어본 결과가 시작할 때 기록해둔 이름·크기·
 * 폴더와 맞는지 본다. 하나라도 어긋나면 완료로 인정하지 않는다.
 *
 * 권한 범위가 drive.file이라 애초에 이 앱이 만든 파일 바깥은 읽지도 못한다.
 * 이 확인은 그 위에 한 겹 더 얹는 것이다.
 */
export function verifyUploadedFile(
  file: DriveFileFacts,
  expected: {
    fileName: string;
    byteSize: number;
    folderId: string | null;
  },
): UploadRejection | null {
  if (file.name !== expected.fileName) {
    return "name_mismatch";
  }

  // Drive가 내용을 보고 종류를 다시 정할 수 있다. 정해진 결과가
  // 우리가 다룰 수 있는 종류가 아니면 받아들이지 않는다.
  if (!isAllowedUploadMimeType(file.mimeType)) {
    return "type_not_allowed";
  }

  // 크기를 모르는 경우는 Google 문서 같은 파일이다. 업로드로는 생기지 않는다.
  if (file.byteSize === null || file.byteSize !== expected.byteSize) {
    return "size_mismatch";
  }

  if (expected.folderId !== null && !file.parents.includes(expected.folderId)) {
    return "folder_mismatch";
  }

  return null;
}

export function describeUploadRejection(reason: UploadRejection): string {
  switch (reason) {
    case "name_mismatch":
      return "올라온 파일이 처음 고른 파일과 다릅니다. 다시 시도해 주세요.";
    case "size_mismatch":
      return "파일이 끝까지 올라가지 않았습니다. 다시 시도해 주세요.";
    case "type_not_allowed":
      return "이 종류의 파일은 보관할 수 없습니다.";
    case "folder_mismatch":
      return "파일이 ThreadMark 폴더 밖에 저장되었습니다. 다시 시도해 주세요.";
  }
}

/**
 * 끝나지 않은 업로드를 언제 정리 대상으로 볼 것인가.
 *
 * 설계 문서 10.3절: 업로드 도중 실패한 DB 레코드를 정리하는 작업을 둔다.
 *
 * 100MB를 느린 회선으로 올리는 데 걸리는 시간을 넉넉히 덮는다.
 * 너무 짧게 잡으면 진행 중인 업로드를 정리해 버린다.
 */
export const STALE_PENDING_MINUTES = 180;

export function isStalePending(createdAt: string, now: Date): boolean {
  const started = new Date(createdAt).getTime();

  if (!Number.isFinite(started)) {
    // 시각을 읽지 못하면 정리 대상으로 보지 않는다. 모르면 건드리지 않는다.
    return false;
  }

  return now.getTime() - started >= STALE_PENDING_MINUTES * 60 * 1000;
}

/**
 * Drive에서 파일을 열어보는 주소.
 *
 * 따로 저장하지 않고 식별자로 만든다. Drive가 주는 webViewLink를 저장해두면
 * 주소 형식이 바뀌었을 때 오래된 값이 남는다.
 *
 * 이 주소는 파일을 공개하지 않는다. 권한이 있는 사람에게만 열린다.
 * 설계 문서 2.3절이 금지한 "비공개 Drive 파일을 공개 공유 링크로 바꾸는 것"과는
 * 다른 이야기다.
 */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/** 화면에 보여줄 크기 문구. */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "크기 알 수 없음";
  }

  if (bytes < 1024) {
    return `${bytes}B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)}KB`;
  }

  const megabytes = kilobytes / 1024;

  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)}MB`;
}
