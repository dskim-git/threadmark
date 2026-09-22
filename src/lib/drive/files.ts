/**
 * Drive 파일 API 호출.
 *
 * 판단은 upload.ts가 하고, 여기서는 Google에 묻고 답을 그대로 옮긴다.
 * 네트워크에 의존하므로 단위 검사 대상이 아니다. 그래서 분기를 최소로 둔다.
 *
 * 토큰은 이 파일 밖으로 나가지 않는다. 인자로 받아 헤더에 넣고 끝이다.
 * 오류 기록에도 토큰과 인증 헤더를 남기지 않는다. (설계 문서 10.5절)
 */

import { parseDriveFile, type DriveFileFacts } from "./upload";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/drive/v3/files";

/** 파일을 확인할 때 받아올 값. 설계 문서 9.2절이 저장하라고 한 것들이다. */
/**
 * 파일을 확인할 때 받아올 값. 설계 문서 9.2절이 저장하라고 한 것들이다.
 *
 * `trashed`를 빠뜨리면 안 된다. Drive는 휴지통에 있는 파일도 **정상으로**
 * 돌려준다. 지워진 것이 아니라 표시만 붙기 때문이다. 이 값을 받지 않으면
 * 사용자가 파일을 지웠는데도 우리는 멀쩡하다고 판단한다.
 */
const FILE_FIELDS =
  "id,name,mimeType,size,md5Checksum,modifiedTime,parents,trashed";

/**
 * 업로드 자리를 잡는다.
 *
 * 설계 문서 10.3절이 요구한 resumable upload다. 서버가 자리를 잡고 브라우저가
 * 바이트를 보낸다. 이렇게 나누는 이유는 두 가지다.
 *
 *   1. 브라우저에 어떤 토큰도 주지 않는다. (설계 문서 9.2절)
 *      돌려주는 것은 이 파일 하나에만 쓰이고 만료되는 자리 주소뿐이다.
 *   2. 파일이 우리 서버를 거치지 않는다. Vercel 함수는 큰 본문을 받지 못하므로,
 *      서버를 거치게 만들면 웬만한 논문 PDF에서 막힌다.
 *
 * Origin 헤더를 함께 보내는 것이 핵심이다. Google은 자리를 잡을 때 들어온
 * Origin을 기억해 두었다가, 그 주소에서 오는 브라우저 요청만 받아준다.
 * 이것을 빠뜨리면 자리는 만들어지는데 브라우저의 업로드가 CORS에서 막힌다.
 * 서버끼리 주고받을 때는 없어도 되는 헤더라 놓치기 쉽다.
 */
export async function createResumableUploadSession(options: {
  accessToken: string;
  origin: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  parentFolderId: string | null;
}): Promise<string | null> {
  const metadata: Record<string, unknown> = {
    name: options.fileName,
    mimeType: options.mimeType,
  };

  if (options.parentFolderId) {
    metadata.parents = [options.parentFolderId];
  }

  let response: Response;

  try {
    response = await fetch(`${DRIVE_UPLOAD_ENDPOINT}?uploadType=resumable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        Origin: options.origin,
        "X-Upload-Content-Type": options.mimeType,
        "X-Upload-Content-Length": String(options.byteSize),
      },
      body: JSON.stringify(metadata),
    });
  } catch (error) {
    console.error(
      "[ThreadMark] Drive 업로드 자리 요청 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return null;
  }

  if (!response.ok) {
    console.error(
      `[ThreadMark] Drive 업로드 자리 요청이 거부되었습니다. 상태 ${response.status}`,
    );

    return null;
  }

  // 자리 주소는 본문이 아니라 Location 헤더로 온다.
  return response.headers.get("location");
}

/** Drive에 파일을 물어본 결과. 없어진 것과 실패한 것을 구분한다. */
export type DriveFileLookup =
  | { outcome: "found"; file: DriveFileFacts }
  | { outcome: "missing" }
  | { outcome: "failed" };

/**
 * 파일이 실제로 있는지 Drive에 직접 물어본다.
 *
 * 브라우저가 "다 올렸다"고 말해도 그것만으로 완료 처리하지 않는다.
 * 설계 문서 10.3절의 "업로드 성공 후에만"은 이 확인을 거친 뒤를 말한다.
 *
 * 없어진 경우와 물어보지 못한 경우를 구분해 돌려준다. 사용자가 할 일이
 * 각각 다르기 때문이다. (설계 문서 10.4절)
 */
export async function fetchDriveFile(options: {
  accessToken: string;
  fileId: string;
}): Promise<DriveFileLookup> {
  const params = new URLSearchParams({ fields: FILE_FIELDS });

  let response: Response;

  try {
    response = await fetch(
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(options.fileId)}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${options.accessToken}` } },
    );
  } catch (error) {
    console.error(
      "[ThreadMark] Drive 파일 조회 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return { outcome: "failed" };
  }

  // 404는 파일이 없거나, drive.file 권한으로는 볼 수 없는 파일이다.
  // 둘을 구분하지 않는다. 구분하면 어떤 파일이 존재하는지 알려주는 셈이 된다.
  if (response.status === 404) {
    return { outcome: "missing" };
  }

  if (!response.ok) {
    console.error(
      `[ThreadMark] Drive 파일 조회가 거부되었습니다. 상태 ${response.status}`,
    );

    return { outcome: "failed" };
  }

  const file = parseDriveFile(await response.json().catch(() => null));

  if (!file) {
    console.error("[ThreadMark] Drive 파일 응답을 이해하지 못했습니다.");

    return { outcome: "failed" };
  }

  return { outcome: "found", file };
}
