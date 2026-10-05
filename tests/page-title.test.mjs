/**
 * 탭에 보이는 제목. (2026-10-05, 사용자 요청)
 *
 * > "(페이지 이름)·ThreadMark" 의 형식으로 나오는데 이를
 * > "ThreadMark·(페이지 이름)"의 형식으로 나오게 바꾸어줘.
 *
 * **틀은 뿌리 레이아웃 한 곳에 있다.** 화면은 자기 이름만 적는다.
 *
 * 무엇이 조용히 틀리는가
 *   화면을 새로 만들면서 **옛 모양으로 적으면** `ThreadMark · 홈 ·
 *   ThreadMark`가 된다. 틀이 앞에 붙고 적은 글에도 꼬리가 있어서다.
 *   오류가 나지 않고 그 탭만 길어진다.
 *
 *   반대로 **틀을 지우면** 모든 탭에서 앱 이름이 사라진다. 그것도 오류가
 *   나지 않는다.
 *
 * 그전에는 서른여섯 곳에 통째로 적혀 있었다. **차례를 바꾸라는 말 한마디에
 * 서른여섯 곳을 고쳐야 했고, 한 곳만 빠뜨려도 그 탭만 다른 모양이 된다.**
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appDir = path.join(repoRoot, "src/app");

const layout = readFileSync(path.join(appDir, "layout.tsx"), "utf8");

/** `src/app` 아래의 `.tsx`를 모두 모은다. */
function allPages(dir) {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...allPages(full));
    } else if (entry.name.endsWith(".tsx")) {
      found.push(full);
    }
  }

  return found;
}

const pages = allPages(appDir).filter(
  (file) => file !== path.join(appDir, "layout.tsx"),
);

test("제목 틀이 뿌리에 있다", () => {
  /*
    **틀이 사라지면 모든 탭에서 앱 이름이 없어진다.** 화면은 자기 이름만
    적고 있으므로, 틀이 없으면 `홈`만 남는다.
  */
  assert.match(
    layout,
    /template:\s*"ThreadMark · %s"/u,
    "뿌리 레이아웃에 제목 틀이 없다. 모든 탭에서 앱 이름이 사라진다",
  );

  assert.match(
    layout,
    /default:\s*"ThreadMark"/u,
    "이름을 적지 않은 화면이 쓸 기본 제목이 없다",
  );
});

test("앱 이름이 제목 앞에 온다", () => {
  /*
    > "ThreadMark·(페이지 이름)"의 형식으로 나오게
  */
  const at = layout.indexOf('"ThreadMark · %s"');

  assert.notEqual(at, -1, "제목 틀을 찾을 수 없다");

  const template = "ThreadMark · %s";

  assert.ok(
    template.indexOf("ThreadMark") < template.indexOf("%s"),
    "앱 이름이 화면 이름 뒤에 온다",
  );
});

test("화면이 제목에 앱 이름을 또 붙이지 않는다", () => {
  /*
    **이것이 이 검사의 핵심이다.** 옛 모양(`"홈 · ThreadMark"`)으로 적으면
    틀이 앞에 또 붙어 `ThreadMark · 홈 · ThreadMark`가 된다. 오류가 나지
    않고 그 탭만 길어진다.
  */
  const offenders = [];

  for (const file of pages) {
    const text = readFileSync(file, "utf8");

    if (/title: "[^"]*ThreadMark/u.test(text)) {
      offenders.push(path.relative(repoRoot, file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `제목에 앱 이름을 또 붙였다. 틀이 앞에 붙으므로 화면은 자기 이름만 적는다: ${offenders.join(", ")}`,
  );
});

test("제목을 적은 화면이 넉넉히 있다", () => {
  /*
    **뽑은 것이 있는지를 먼저 본다.** 위 검사는 제목을 하나도 못 찾아도
    통과한다. 그때는 검사가 헛도는 것이다.
    (`search-profile-targets`가 같은 생각을 적어 두었다)
  */
  const titled = pages.filter((file) =>
    /title: "/u.test(readFileSync(file, "utf8")),
  );

  assert.ok(
    titled.length >= 30,
    `제목을 적은 화면을 ${titled.length}곳밖에 못 찾았다. 이 검사가 헛돌고 있다`,
  );
});
