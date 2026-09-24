/**
 * 사용법이 앱과 어긋나지 않는지 확인한다. (AGENTS.md 4절의 15-F)
 *
 * **사용법이 코드와 어긋나면 없는 것보다 나쁘다.** 처음 쓰는 사람이 사용법대로
 * 했는데 그 단추가 없으면, 앱이 고장났다고 생각하거나 자기가 잘못한 줄 안다.
 * 아예 없었으면 화면을 뒤져보기라도 했을 것이다.
 *
 * 말로만 적은 약속은 잊힌다. 이 저장소가 화면 색 목록·PDF worker·논문 분석
 * 서른 칸을 검사로 붙잡아 둔 것과 같은 이유로, 사용법도 검사가 붙잡는다.
 *
 * 여기서 붙잡는 것 넷.
 *   1. 앱 메뉴에 있는 화면이 모두 사용법에 설명되어 있는가
 *   2. 화면에 붙인 물음표 단추가 가리키는 대목이 실제로 있는가
 *   3. 사용법이 가리키는 경로가 실제로 있는 화면인가
 *   4. 대목마다 제목·요약·순서가 비어 있지 않고 열쇠가 겹치지 않는가
 *
 * 1번이 핵심이다. 새 화면을 만들고 사용법을 쓰지 않으면 여기서 실패한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  GUIDE_SECTIONS,
  GUIDE_TOPICS,
  findGuideTopic,
} from "../src/lib/guide/content.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const appDir = path.join(root, "src", "app");

/** 사용법이 덮는다고 선언한 경로 전부. */
const coveredRoutes = new Set(
  GUIDE_TOPICS.flatMap((topic) => topic.routes ?? []),
);

// -----------------------------------------------------------------------------
// 1. 메뉴에 있는 화면이 모두 설명되어 있는가
// -----------------------------------------------------------------------------

/**
 * 앱 메뉴(app-nav.tsx)에 적힌 경로를 읽는다.
 *
 * 메뉴를 기준으로 삼는 이유는, 그것이 **사용자가 닿을 수 있다고 우리가 정한
 * 화면 목록**이기 때문이다. 파일이 있다고 다 설명할 필요는 없다.
 */
function navRoutes() {
  const source = readFileSync(
    path.join(appDir, "(app)", "app-nav.tsx"),
    "utf8",
  );

  return [...source.matchAll(/href:\s*"([^"]+)"/gu)].map((match) => match[1]);
}

test("앱 메뉴의 화면이 모두 사용법에 있다", () => {
  const missing = navRoutes().filter((route) => !coveredRoutes.has(route));

  assert.deepEqual(
    missing,
    [],
    `이 화면들의 사용법이 없다. src/lib/guide/content.ts의 어느 대목에든 routes로 적는다: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 2. 물음표 단추가 가리키는 대목이 실제로 있는가
// -----------------------------------------------------------------------------

/** src 아래 모든 tsx 파일. */
function sourceFiles(dir) {
  const found = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (entry.endsWith(".tsx")) {
      found.push(full);
    }
  }

  return found;
}

test("화면에 붙인 물음표 단추의 열쇠가 모두 있다", () => {
  // 오타 하나로 설명이 안 뜨는 단추가 생기는 것을 막는다.
  const used = new Set();

  for (const file of sourceFiles(path.join(root, "src"))) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(
      /<HelpButton[^>]*?\btopic=\{?"([^"]+)"/gu,
    )) {
      used.add(match[1]);
    }
  }

  const unknown = [...used].filter((id) => findGuideTopic(id) === null);

  assert.deepEqual(
    unknown,
    [],
    `이 열쇠의 사용법 대목이 없다: ${unknown.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 3. 사용법이 가리키는 경로가 실제로 있는가
// -----------------------------------------------------------------------------

test("사용법이 적어둔 경로가 모두 실제 화면이다", () => {
  /*
    없어진 화면을 설명한 채로 두면, 사용법대로 갔는데 404가 난다.
    경로를 폴더 구조에서 직접 만들어 견준다.
  */
  const routes = new Set();

  const walk = (dir, route) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);

      if (!statSync(full).isDirectory()) {
        if (entry === "page.tsx") {
          routes.add(route === "" ? "/" : route);
        }

        continue;
      }

      // (app)처럼 괄호로 묶인 폴더는 주소에 들어가지 않는다.
      const next = entry.startsWith("(") ? route : `${route}/${entry}`;

      walk(full, next);
    }
  };

  walk(appDir, "");

  const missing = [...coveredRoutes].filter((route) => !routes.has(route));

  assert.deepEqual(
    missing,
    [],
    `사용법이 없는 화면을 가리킨다: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 4. 글이 비어 있지 않은가
// -----------------------------------------------------------------------------

test("대목마다 열쇠가 겹치지 않는다", () => {
  const ids = GUIDE_TOPICS.map((topic) => topic.id);

  assert.equal(new Set(ids).size, ids.length, "물음표 열쇠가 겹친다");
});

test("묶음마다 열쇠가 겹치지 않는다", () => {
  const ids = GUIDE_SECTIONS.map((section) => section.id);

  assert.equal(new Set(ids).size, ids.length);
});

test("대목마다 제목·한 줄 요약·순서가 있다", () => {
  for (const topic of GUIDE_TOPICS) {
    assert.ok(topic.title.length > 0, `${topic.id}: 제목이 없다`);
    assert.ok(topic.summary.length > 0, `${topic.id}: 한 줄 요약이 없다`);
    assert.ok(topic.steps.length > 0, `${topic.id}: 순서가 비어 있다`);

    for (const step of topic.steps) {
      assert.ok(step.trim().length > 0, `${topic.id}: 빈 순서가 있다`);
    }
  }
});

test("묶음마다 대목이 하나 이상 있다", () => {
  for (const section of GUIDE_SECTIONS) {
    assert.ok(section.intro.length > 0, `${section.id}: 설명이 없다`);
    assert.ok(section.topics.length > 0, `${section.id}: 대목이 없다`);
  }
});

test("굵게 표시가 짝이 맞는다", () => {
  // 짝이 안 맞으면 별표가 화면에 그대로 나온다.
  for (const topic of GUIDE_TOPICS) {
    for (const text of [...topic.steps, ...(topic.notes ?? [])]) {
      const stars = (text.match(/\*\*/gu) ?? []).length;

      assert.equal(stars % 2, 0, `${topic.id}: 굵게 표시의 짝이 맞지 않는다`);
    }
  }
});

test("사용법 화면 자체는 로그인을 요구하지 않는다", () => {
  /*
    승인을 기다리는 사람이 볼 수 있어야 하고, 남에게 알릴 때 링크 하나면
    되어야 한다. 앱 묶음 안으로 옮기면 그것이 깨진다.
  */
  const guidePage = path.join(appDir, "guide", "page.tsx");
  const source = readFileSync(guidePage, "utf8");

  assert.ok(
    !source.includes("requireActiveAccount"),
    "사용법 화면이 승인을 요구하면 기다리는 사람이 볼 수 없다",
  );
});
