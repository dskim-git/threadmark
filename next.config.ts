import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Next.js 16은 개발 서버를 켤 때마다 AGENTS.md와 CLAUDE.md에
   * 자기 안내문을 끼워 넣는다. 기본값이 true다.
   *
   * 끄는 이유는 CLAUDE.md에 적어둔 약속 때문이다.
   * "지침은 AGENTS.md 한 곳에만 둔다." 그 파일을 도구가 말없이 고치면
   * 사람이 쓴 것과 도구가 쓴 것이 섞이고, 커밋할 때마다 따라붙는다.
   *
   * 안내문이 알려주던 쓸모 있는 사실 — 이 버전은 예전 Next.js와 다르고
   * 버전에 맞는 문서가 node_modules/next/dist/docs/에 있다는 것 — 은
   * AGENTS.md 6절에 직접 적어두었다.
   */
  agentRules: false,

  /*
   * pdfjs-dist를 서버 묶음에 넣지 않는다.
   *
   * 14-C에서 서버가 PDF의 글자를 꺼내 DOI를 찾게 되면서 필요해졌다.
   * Next.js는 서버에서 쓰는 의존성을 기본적으로 묶음에 넣는데, pdfjs-dist는
   * 묶이면 깨진다. worker 경로와 import.meta.url을 스스로 풀어 쓰는데
   * 번들러가 그것을 다시 써버리기 때문이다.
   *
   * 증상은 엉뚱하다. Node에서 따로 돌리면 멀쩡히 되는 코드가 앱 안에서만
   * "PDF를 읽지 못했습니다"로 끝난다. 2026-09-23에 여기서 한 번 막혔다.
   *
   * Next.js가 기본으로 빼주는 목록에 pdfjs-dist는 없다.
   * (node_modules/next/dist/docs/.../serverExternalPackages.md에서 확인)
   *
   * 브라우저 쪽 뷰어(13-A)에는 영향이 없다. 이 설정은 서버 묶음만 건드린다.
   */
  serverExternalPackages: ["pdfjs-dist"],

  /*
   * pdfjs-dist의 worker 파일을 배포에 함께 올린다.
   *
   * 위의 serverExternalPackages는 "묶지 말고 node_modules에서 가져다 써라"는
   * 뜻이다. 로컬에서는 node_modules가 통째로 있으니 문제가 없다. 그런데
   * **배포에는 필요하다고 추적된 파일만 올라간다.**
   *
   * pdf.js는 Node에서 돌 때 진짜 worker를 띄우지 않는 대신
   * `GlobalWorkerOptions.workerSrc`를 `./pdf.worker.mjs`로 잡고 그 파일을
   * 불러온다. 그 불러오기는 코드에 적힌 경로가 아니라 실행 중에 만들어지는
   * 문자열이라, 추적기가 따라가지 못한다. 그래서 pdf.mjs만 올라가고
   * worker는 빠진다.
   *
   * 증상이 또 사람을 헷갈리게 한다. 로컬에서는 멀쩡히 되고 **배포에서만**
   * "PDF를 읽지 못했습니다"로 끝난다. 2026-09-24에 여기서 막혔다.
   * 2026-09-23에 같은 문구로 막혔던 것(묶임 문제)과 원인이 다르다.
   *
   * 열쇠의 대괄호를 이스케이프하는 이유
   *   이 열쇠는 경로가 아니라 **글로브 무늬**다. `[id]`를 그대로 적으면
   *   "i 또는 d 한 글자"라는 뜻이 되어, `/sources/i/paper`에는 맞고 정작
   *   우리 경로에는 맞지 않는다. 설정은 있는데 아무 일도 하지 않는 상태가
   *   되고, 빌드는 조용히 통과한다. 이 버전의 문서
   *   (node_modules/next/dist/docs/.../output.md)의 예시도 그렇게 적혀 있다.
   *
   * 확인하는 법
   *   .next/server/app/(app)/sources/[id]/paper/page.js.nft.json 을 열어
   *   pdf.worker.mjs 가 들어 있는지 본다. 없으면 배포에서 실패한다.
   *   tests/pdf-server-config.test.mjs가 그 확인을 대신한다.
   */
  outputFileTracingIncludes: {
    "/sources/\\[id\\]/paper": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
