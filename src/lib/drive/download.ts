/**
 * Drive 파일을 읽어오는 호출.
 *
 * 설계 문서 9.2절이 방식을 정해두었다.
 *
 *   브라우저에 장기 refresh token을 전달하지 않는다.
 *   서버가 사용자 세션을 확인한 후 Drive 파일을 스트리밍한다.
 *   가능하면 HTTP Range 요청을 전달하여 큰 PDF를 효율적으로 읽는다.
 *
 * 올릴 때와 반대 방향이다. 왜 다르게 하는지 적어둔다.
 *
 *   올릴 때  파일이 서버를 거치지 않는다. Vercel 함수가 큰 본문을 받지 못한다.
 *   읽을 때  파일이 서버를 거친다. 브라우저에 토큰을 주지 않으려면 그래야 한다.
 *
 * 받는 제한과 보내는 제한은 다르다. 보내는 쪽은 흘려보낼 수 있어서,
 * 서버가 파일을 통째로 메모리에 담지 않고 그대로 흘려보낸다.
 */

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

export type DriveDownload =
  | { outcome: "ok"; response: Response }
  | { outcome: "missing" }
  | { outcome: "failed" };

/**
 * Drive에서 파일 내용을 받아온다.
 *
 * 응답을 읽지 않고 그대로 돌려준다. 부르는 쪽이 본문을 흘려보낸다.
 * 여기서 `await response.arrayBuffer()`를 하면 100MB PDF가 서버 메모리에
 * 통째로 올라간다. 그러지 않으려고 Response를 그대로 넘긴다.
 *
 * Range를 받으면 그대로 전달한다. 그래야 17쪽을 보려고 1쪽부터 다 받지 않는다.
 * Drive는 Range를 지원하며 206과 Content-Range로 답한다.
 */
export async function fetchDriveFileContent(options: {
  accessToken: string;
  fileId: string;
  range: string | null;
}): Promise<DriveDownload> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
  };

  if (options.range) {
    headers.Range = options.range;
  }

  let response: Response;

  try {
    response = await fetch(
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(options.fileId)}?alt=media`,
      { headers },
    );
  } catch (error) {
    console.error(
      "[ThreadMark] Drive 파일 내려받기 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return { outcome: "failed" };
  }

  // 404는 파일이 없거나, drive.file 권한으로는 볼 수 없는 파일이다.
  // 둘을 구분하지 않는다. 구분하면 어떤 파일이 존재하는지 알려주는 셈이 된다.
  if (response.status === 404) {
    return { outcome: "missing" };
  }

  // 200은 전체, 206은 요청한 구간만이다. 둘 다 정상이다.
  if (response.status !== 200 && response.status !== 206) {
    console.error(
      `[ThreadMark] Drive 파일 내려받기가 거부되었습니다. 상태 ${response.status}`,
    );

    return { outcome: "failed" };
  }

  return { outcome: "ok", response };
}

/**
 * Drive의 응답에서 브라우저로 넘겨도 되는 헤더만 고른다.
 *
 * 응답 헤더를 통째로 넘기지 않는다. Google이 붙여 보내는 헤더 중에는
 * 우리 응답에 있으면 안 되는 것들이 섞여 있다. 인증 관련 값이나 쿠키가
 * 그대로 흘러가면 곤란하고, 압축 관련 헤더는 우리가 다시 쓰는 순간
 * 실제 본문과 어긋나 브라우저가 파일을 못 읽는다.
 *
 * 그래서 넘길 것을 고른다. 설계 문서 10.5절의 "로그에 token과 authorization
 * header를 남기지 않는다"와 같은 태도다. 필요한 것만 지나가게 한다.
 */
export function relayableHeaders(source: Headers): Headers {
  const headers = new Headers();

  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = source.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  return headers;
}
