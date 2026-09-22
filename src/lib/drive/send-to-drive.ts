/**
 * 브라우저에서 Drive로 파일을 보낸다.
 *
 * 이 파일은 브라우저에서만 돈다. 서버에서 부르지 않는다.
 * 자료 상세의 첨부와 자료 등록 화면이 같은 동작을 해야 해서 따로 빼두었다.
 *
 * 보내는 곳은 서버가 만들어준 자리 주소다. 토큰은 여기 없다.
 * 그 주소는 이 파일 하나에만 쓰이고 만료된다. (설계 문서 9.2절, 10.3절)
 *
 * fetch가 아니라 XMLHttpRequest를 쓴다. fetch는 보내는 쪽 진행 상황을
 * 알려주지 않는다. 100MB 파일을 올리는 동안 아무 표시가 없으면
 * 사용자는 멈춘 것으로 본다.
 */

/**
 * 파일을 자리 주소로 보낸다.
 *
 * 성공하면 Drive가 정한 파일 식별자를 돌려준다.
 * 이 값은 서버로 전달되지만, 서버는 믿지 않고 이 식별자로 Drive에 다시 물어본다.
 * 그러니 여기서 돌려주는 값이 틀려도 잘못된 파일이 완료 처리되지는 않는다.
 */
export function sendFileToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();

    request.open("PUT", uploadUrl, true);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      // 자리를 다 채우면 200 또는 201과 함께 파일 정보가 온다.
      if (request.status !== 200 && request.status !== 201) {
        resolve(null);

        return;
      }

      try {
        const body: unknown = JSON.parse(request.responseText);
        const id =
          typeof body === "object" && body !== null
            ? (body as { id?: unknown }).id
            : null;

        resolve(typeof id === "string" && id.length > 0 ? id : null);
      } catch {
        resolve(null);
      }
    };

    request.onerror = () => resolve(null);
    request.onabort = () => resolve(null);
    request.ontimeout = () => resolve(null);

    request.send(file);
  });
}
