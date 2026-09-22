/**
 * 글자 층 스타일이 PDF.js 원본과 같은지 확인한다.
 *
 * PDF를 그린 그림 위에 보이지 않는 글자를 정확히 겹쳐 놓는 스타일이다.
 * 어긋나면 드래그했을 때 엉뚱한 문장이 잡히거나 선택이 아예 안 된다.
 * 눈으로는 알아채기 어렵고, 기록에 남는 원문이 조용히 틀어진다.
 *
 * pdf_viewer.css는 6000줄이 넘고 대부분이 우리가 쓰지 않는 스타일이라
 * .textLayer 규칙만 옮겨 왔다. 그 대신 여기서 원본과 맞는지 지킨다.
 *
 * PDF.js를 올린 뒤 이 검사가 실패하면, 손으로 고치지 말고 원본에서 다시 옮긴다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

const ourCssPath = path.join(
  repoRoot,
  "src",
  "app",
  "(app)",
  "sources",
  "[id]",
  "reader",
  "text-layer.css",
);

const pdfjsCssPath = path.join(
  repoRoot,
  "node_modules",
  "pdfjs-dist",
  "web",
  "pdf_viewer.css",
);

/**
 * `.textLayer{` 로 시작하는 첫 규칙을 중괄호 짝을 세어 잘라낸다.
 *
 * 원본에는 `.textLayer` 규칙이 둘 있다. 두 번째는 주석 편집기용이라 쓰지 않는다.
 * 첫 번째만 본다.
 */
function extractTextLayerRule(css) {
  const start = css.indexOf(".textLayer{");

  if (start === -1) {
    return null;
  }

  let depth = 0;

  for (let index = start; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return css.slice(start, index + 1);
      }
    }
  }

  return null;
}

/** 공백과 줄바꿈 차이는 무시한다. 우리가 볼 것은 규칙의 내용이다. */
function normalize(rule) {
  return rule.replace(/\s+/g, " ").trim();
}

test("옮겨 온 글자 층 스타일이 PDF.js 원본과 같다", () => {
  const ours = extractTextLayerRule(readFileSync(ourCssPath, "utf8"));
  const theirs = extractTextLayerRule(readFileSync(pdfjsCssPath, "utf8"));

  assert.ok(ours, "우리 CSS에서 .textLayer 규칙을 찾지 못했다");
  assert.ok(theirs, "pdfjs-dist에서 .textLayer 규칙을 찾지 못했다");

  assert.equal(
    normalize(ours),
    normalize(theirs),
    "글자 층 스타일이 PDF.js 원본과 다르다. node_modules/pdfjs-dist/web/pdf_viewer.css의 .textLayer 규칙을 다시 옮겨 와라.",
  );
});

test("어느 버전에서 옮겨 왔는지 적어 두었다", () => {
  // 버전을 적어두지 않으면, 검사가 실패했을 때 무엇이 바뀐 것인지 알 수 없다.
  const ours = readFileSync(ourCssPath, "utf8");
  const installed = JSON.parse(
    readFileSync(
      path.join(repoRoot, "node_modules", "pdfjs-dist", "package.json"),
      "utf8",
    ),
  ).version;

  assert.ok(
    ours.includes(installed),
    `옮겨온 버전 표기가 설치된 pdfjs-dist(${installed})와 다르다`,
  );
});
