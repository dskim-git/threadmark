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
};

export default nextConfig;
