/**
 * `data-wide`와 바깥 스크롤의 약속. (2026-10-04, 사용자가 찾음)
 *
 * **이 고장은 오류를 내지 않는다.** 화면은 멀쩡히 그려지고 아래쪽이 그냥
 * 없는 것처럼 보인다. 그리고 **좁은 화면에서는 나지 않는다.** 잠금이
 * `min-width: 1024px`에만 걸려 있어서, 폭을 줄여 눌러봤다면 찾지 못한다.
 *
 * 무엇이 묶여 있나
 *   `data-wide`는 이름이 "넓게 쓴다"인데 하는 일이 둘이다.
 *
 *     main:has([data-wide])   너비 제한을 푼다
 *     body:has([data-wide])   **넓은 화면에서 바깥 스크롤을 잠근다**
 *
 *   PDF와 그림 작업대는 안쪽 두 칸이 각자 스크롤해서 괜찮다. 음성 작업대는
 *   위에서 아래로 쌓이는 보통 화면이라, 잠기면 재생기 아래의 메모와 기록
 *   목록에 닿을 수 없다. 2026-10-04에 사용자가 그것을 찾았다.
 *
 * 왜 소스 글을 읽어 검사하나
 *   이 약속은 **CSS 한 곳과 화면 한 곳 사이**에 있다. 돌려 보지 않고는
 *   확인할 수 없고, 돌려 보는 검사는 이 저장소에 없다. 그래서
 *   `pdf-server-config.test.mjs`가 `next.config.ts`를 글로 읽어 확인한
 *   것과 같은 방식을 쓴다. **약한 그물이지만 없는 것보다 낫다.**
 *
 *   `그 글자가 있는가`로 끝나지 않게 한다. 보는 것은 **조건이 걸려 있는가**다.
 *   조건을 떼면 이 검사가 실패한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

const css = readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");
const readerPage = readFileSync(
  path.join(repoRoot, "src/app/(app)/sources/[id]/reader/page.tsx"),
  "utf8",
);

test("data-wide가 넓은 화면에서 바깥 스크롤을 잠근다", () => {
  /*
    이 규칙이 있다는 것이 아래 검사들의 전제다. 규칙을 지우면 음성 쪽
    조건이 필요 없어지므로, 그때는 이 검사가 먼저 실패해 **왜 조건이
    있었는지**를 읽게 만든다.
  */
  assert.match(
    css,
    /body:has\(\[data-wide\]\)\s*\{[^}]*overflow:\s*hidden/u,
    "globals.css가 data-wide로 바깥 스크롤을 잠그지 않는다. 음성 쪽 조건의 전제가 사라졌다",
  );
});

test("읽기 화면이 data-wide를 조건으로 붙인다", () => {
  /*
    **조건 없이 붙이면 음성 화면의 아래쪽에 닿을 수 없다.**

    `<div data-wide className=...>`처럼 값 없이 적으면 늘 참이다. 그러면
    음성일 때도 잠긴다. 그 모양이 되살아나는 것을 막는다.
  */
  assert.ok(
    !/<div\s+data-wide\s+className/u.test(readerPage),
    "읽기 화면이 data-wide를 늘 붙인다. 음성 화면에서 아래쪽 메모에 닿을 수 없게 된다",
  );

  assert.match(
    readerPage,
    /data-wide=\{[^}]*showAudio[^}]*\}/u,
    "data-wide가 showAudio를 보고 갈리지 않는다",
  );
});

test("음성일 때 data-wide 칸 자체가 없다", () => {
  /*
    **`false`를 넣으면 안 된다.** React는 `data-*`에 `false`를 주면
    `data-wide="false"`로 그리고, 그 칸은 **여전히 `[data-wide]`에 걸린다.**
    값이 아니라 칸 자체가 없어야 한다.

    이 자리가 조용하다. 조건을 걸었으니 고쳤다고 여기는데 잠금은 그대로다.
  */
  const match = readerPage.match(/data-wide=\{([^}]*)\}/u);

  assert.ok(match !== null, "data-wide에 조건이 없다");

  const expression = match[1];

  assert.ok(
    expression.includes("undefined"),
    `음성일 때 undefined를 주어야 한다. data-wide={false}는 data-wide="false"로 그려져 여전히 잠근다. 지금: ${expression}`,
  );
});

test("안쪽이 스스로 스크롤하는 작업대만 넓게 쓴다", () => {
  /*
    **약속을 글로도 남겨둔다.** 다음에 `data-wide`를 다는 화면을 만드는
    사람이 CSS를 열어보지 않을 수 있다. 그 까닭이 globals.css에 적혀
    있는지 본다.

    `FillViewport`가 안쪽 높이를 재는 장치다. PDF와 그림 작업대가 그것을
    쓰고, 음성은 쓰지 않아서 이 문제가 났다.
  */
  assert.match(
    css,
    /안쪽이 각자 스크롤하지 않는 화면은 이 표시를 달지 않는다/u,
    "globals.css에 이 약속이 적혀 있지 않다. 다음에 또 같은 자리에 걸린다",
  );
});
