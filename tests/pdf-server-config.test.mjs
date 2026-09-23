/**
 * 서버에서 PDF를 읽기 위한 설정 검사. (14-C, 2026-09-24)
 *
 * 이 설정들은 **틀려도 빌드가 통과한다.** 그리고 로컬에서는 멀쩡히 돌아간다.
 * 배포에서만 "PDF를 읽지 못했습니다"로 끝난다. 그때 코드를 의심하게 되는데
 * 코드는 멀쩡하다. 두 번 겪었다.
 *
 *   2026-09-23  pdfjs-dist가 서버 묶음에 묶여서 깨졌다
 *               → serverExternalPackages로 뺐다
 *   2026-09-24  배포에 pdf.worker.mjs가 올라가지 않아 깨졌다
 *               → outputFileTracingIncludes로 함께 올리게 했다
 *
 * 두 번째를 고칠 때도 한 번 헛디뎠다. 열쇠에 `[id]`를 그대로 적었더니
 * 글로브 무늬로 읽혀 아무 경로에도 맞지 않았다. **설정은 있는데 아무 일도
 * 하지 않는** 상태였고 빌드는 조용히 통과했다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const config = readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");

/** 배포에 함께 올라가야 하는 파일. pdf.js가 Node에서 이것을 불러온다. */
const WORKER = "pdfjs-dist/legacy/build/pdf.worker.mjs";

test("pdfjs-dist를 서버 묶음에 넣지 않는다", () => {
  /*
    묶이면 worker 경로와 import.meta.url을 번들러가 다시 써버려 깨진다.
  */
  assert.ok(
    /serverExternalPackages:\s*\[[^\]]*"pdfjs-dist"/.test(config),
    "serverExternalPackages에 pdfjs-dist가 없다",
  );
});

test("worker 파일을 배포에 함께 올린다", () => {
  assert.ok(
    config.includes(WORKER),
    `${WORKER}를 outputFileTracingIncludes에 넣지 않았다. 배포에서만 실패한다`,
  );
});

test("추적 열쇠의 대괄호를 이스케이프한다", () => {
  /*
    이 열쇠는 경로가 아니라 글로브 무늬다. `[id]`를 그대로 적으면
    "i 또는 d 한 글자"라는 뜻이 되어 우리 경로에 맞지 않는다.
    맞지 않아도 오류가 나지 않는 것이 이 함정의 고약한 점이다.
  */
  const keys = [...config.matchAll(/"(\/[^"]*)":\s*\[/g)].map(
    (match) => match[1],
  );

  const tracing = keys.filter((key) => key.includes("sources"));

  assert.ok(tracing.length > 0, "추적 열쇠를 찾을 수 없다");

  for (const key of tracing) {
    assert.ok(
      !/(?<!\\)\[/.test(key),
      `${key}: 대괄호를 이스케이프하지 않았다. 아무 경로에도 맞지 않는다`,
    );
  }
});

test("빌드 결과에 worker가 실제로 들어 있다", (t) => {
  /*
    위의 셋은 글자만 본다. 이 검사는 빌드가 만든 추적 파일을 직접 본다.
    Vercel이 올릴 파일을 정하는 것이 바로 그 파일이다.

    빌드하지 않았으면 건너뛴다. 검사가 빌드를 요구하면 `npm test`가 느려지고,
    빌드 없이 돌릴 수 없게 된다.
  */
  const trace = path.join(
    repoRoot,
    ".next",
    "server",
    "app",
    "(app)",
    "sources",
    "[id]",
    "paper",
    "page.js.nft.json",
  );

  if (!existsSync(trace)) {
    t.skip("빌드 결과가 없다. npm run build 뒤에 다시 본다");

    return;
  }

  const traced = readFileSync(trace, "utf8");

  assert.ok(
    traced.includes("pdf.worker.mjs"),
    "빌드 결과에 worker가 없다. 배포하면 PDF를 읽지 못한다",
  );
});
