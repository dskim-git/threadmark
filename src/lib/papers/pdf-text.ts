/**
 * PDF 앞쪽 몇 장의 글자를 서버에서 꺼낸다. (설계 문서 8.5절)
 *
 * 왜 서버에서 하는가
 *   파일은 Drive에 있고, 브라우저에 Drive 토큰을 주지 않는다는 것이 9.2절의
 *   결정이다. 뷰어가 PDF를 볼 수 있는 것도 서버가 중계하기 때문이다.
 *   서지 정보를 가져오는 화면은 뷰어가 아니므로, 여기서 직접 꺼낸다.
 *
 * 무엇을 꺼내는가
 *   **글자만 꺼낸다. 그림은 그리지 않는다.** 화면에 보여줄 일이 없으므로
 *   canvas도 글꼴도 필요 없다. 그래서 서버에서도 가볍게 돈다.
 *
 * 무엇을 하지 않는가
 *   꺼낸 글에서 저자나 학술지명을 읽어내려 하지 않는다. 첫 장의 생김새는
 *   학술지마다 달라서 그것은 추측이 된다. 여기서 꺼낸 글은 DOI를 찾는 데
 *   쓰이고(doi-scan.ts), DOI를 찾으면 Crossref가 나머지를 정확히 알려준다.
 *
 * 스캔 PDF에서는 빈 글이 나온다. 글자 층이 없기 때문이다. 오류가 아니다.
 * 설계 문서 9.5절이 OCR을 MVP에서 뺐다.
 *
 * **서버에서만 부른다.** 브라우저에서 부르면 Drive 파일을 받을 길이 없고,
 * pdfjs의 legacy 빌드를 브라우저 묶음에 끌어들이게 된다.
 */

/**
 * 몇 장까지 볼 것인가.
 *
 * DOI는 거의 언제나 첫 장에 있다. 그런데 표지가 따로 붙은 PDF가 있고,
 * 국내 학술지 중에는 둘째 장부터 본문이 시작하는 것이 있다.
 * 마지막 장(참고문헌 뒤)에 적는 학술지도 있지만 거기까지 가지 않는다.
 * 뒤로 갈수록 그 논문의 DOI가 아니라 참고문헌의 DOI를 주울 위험이 커진다.
 */
const PAGES_TO_SCAN = 3;

/**
 * 한 장에서 가져올 글자 수 상한.
 *
 * DOI를 찾는 데는 이만큼이면 넘친다. 상한을 두지 않으면 글자가 빽빽한
 * 논문에서 쓸데없이 큰 글이 메모리에 올라간다.
 */
const MAX_CHARS_PER_PAGE = 20_000;

/**
 * PDF 앞쪽의 글을 하나로 이어 돌려준다.
 *
 * @param data PDF 파일 전체.
 */
export async function readPdfHeadText(data: Uint8Array): Promise<string> {
  /*
    pdfjs-dist는 무겁다. 서지 정보를 가져올 때만 쓰므로 그때 올린다.
    모듈 맨 위에서 올리면 이 파일을 스치는 모든 경로가 함께 무거워진다.

    legacy 빌드를 쓴다. 브라우저 전용 API에 기대지 않아 Node에서 돈다.
  */
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  /*
    worker를 쓰지 않는다. 서버에서는 worker를 띄울 이유가 없고,
    띄우려 하면 경로를 찾지 못해 실패한다.
  */
  const loading = pdfjs.getDocument({
    data,
    /*
      글자만 꺼낸다. 화면에 그릴 때 필요한 것들은 끈다.
      시스템 글꼴을 찾아 헤매지 않게 하고, 미리 받아두지도 않게 한다.
      파일을 통째로 넘겼으므로 더 받아올 것도 없다.
    */
    useSystemFonts: false,
    disableAutoFetch: true,
    /*
      오류만 남긴다.

      글꼴 데이터를 주지 않았다고 경고가 나오는데, 글자를 꺼내는 데는 글꼴이
      필요 없다. 그 경고를 그대로 두면 서버 로그가 논문 한 편마다 지저분해지고,
      정작 봐야 할 오류가 묻힌다.
    */
    verbosity: 0,
  });

  const document = await loading.promise;

  try {
    const pages = Math.min(document.numPages, PAGES_TO_SCAN);
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const content = await page.getTextContent();

        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .slice(0, MAX_CHARS_PER_PAGE);

        chunks.push(text);
      } finally {
        // 쪽마다 정리한다. 하지 않으면 큰 PDF에서 메모리가 계속 쌓인다.
        page.cleanup();
      }
    }

    return chunks.join("\n");
  } finally {
    /*
      정리를 두 번 한다. cleanup은 문서가 들고 있던 것을 놓게 하고,
      destroy는 읽기 작업 자체를 끝낸다. 뒤엣것을 빠뜨리면 요청이 끝난 뒤에도
      붙들고 있는 것이 남는다.
    */
    await document.cleanup();
    await loading.destroy();
  }
}
