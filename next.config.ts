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
};

export default nextConfig;
