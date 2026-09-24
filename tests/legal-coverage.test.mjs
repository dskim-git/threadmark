/**
 * 개인정보 처리방침이 실제 코드와 어긋나지 않는지 확인한다. (17-B)
 *
 * **방침이 실제와 어긋나면 없는 것보다 나쁘다.** 사용법이 어긋나면 쓰는 사람이
 * 헤매는 데서 끝나지만, 방침이 어긋나면 하지 않는 일을 한다고 적어둔 것이거나
 * 하는 일을 감춘 것이 된다. 둘 다 약속을 어긴 것이다.
 *
 * 초안이 실제로 그랬다. 밖에 맡기는 곳 표에 아직 쓰지도 않는 Kakao·TMDB·
 * YouTube가 적혀 있었고, 정작 쓰고 있는 MusicBrainz·iTunes·Crossref는 빠져
 * 있었다. 사람이 눈으로 맞춰보기로 한 약속은 잊힌다.
 *
 * 여기서 붙잡는 것.
 *   1. 밖으로 요청을 보내는 곳이 방침의 표에 모두 있는가  ← 핵심
 *   2. 두 화면이 로그인을 요구하지 않는가
 *   3. 로그인 화면에서 두 곳으로 가는 길이 있는가
 *   4. 방침이 가리키는 앱 경로가 실제로 있는가
 *   5. 글이 비어 있지 않고 표의 칸 수가 맞는가
 *
 * 1번이 핵심이다. **새 연동을 만들고 방침을 고치지 않으면 `npm test`가
 * 실패한다.** `OUTGOING_HEADER_SETS`는 헤더 검사도 쓰는 목록이라, 거기에
 * 한 줄을 더하면 두 검사가 함께 따라온다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DELETION_SECTIONS,
  EXTERNAL_PROCESSORS,
  POLICY_UPDATED_AT,
  PRIVACY_SECTIONS,
} from "../src/lib/legal/content.ts";
import { OUTGOING_HEADER_SETS } from "../src/lib/net/request-headers.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const appDir = path.join(root, "src", "app");

const ALL_SECTIONS = [...PRIVACY_SECTIONS, ...DELETION_SECTIONS];

// -----------------------------------------------------------------------------
// 1. 밖으로 보내는 곳이 방침에 모두 있는가
// -----------------------------------------------------------------------------

test("밖으로 요청을 보내는 곳이 모두 방침의 표에 있다", () => {
  /*
    우리 서버가 직접 요청을 보내는 곳은 헤더 묶음을 하나씩 갖는다.
    그 열쇠가 방침의 표에도 있어야 한다.

    새 연동을 만들면서 방침을 잊는 것이 이 검사가 막으려는 일이다.
  */
  const declared = new Set(
    EXTERNAL_PROCESSORS.map((processor) => processor.headerSet).filter(Boolean),
  );

  const missing = Object.keys(OUTGOING_HEADER_SETS).filter(
    (key) => !declared.has(key),
  );

  assert.deepEqual(
    missing,
    [],
    `이 연동이 개인정보 처리방침에 없다. src/lib/legal/content.ts의 EXTERNAL_PROCESSORS에 더한다: ${missing.join(", ")}`,
  );
});

test("방침의 표에 있지도 않은 연동을 적지 않는다", () => {
  /*
    반대 방향도 본다. 없어진 연동을 표에 남겨두면 "아직 거기로 보내고 있나"를
    읽는 사람이 알 수 없다. 막는 것과 여는 것을 모두 본다. (보안 원칙 6)
  */
  const known = new Set(Object.keys(OUTGOING_HEADER_SETS));

  const phantom = EXTERNAL_PROCESSORS.filter(
    (processor) => processor.headerSet && !known.has(processor.headerSet),
  ).map((processor) => processor.name);

  assert.deepEqual(
    phantom,
    [],
    `방침이 없는 연동을 가리킨다: ${phantom.join(", ")}`,
  );
});

test("맡기는 곳마다 이름·하는 일·닿는 것이 모두 있다", () => {
  assert.ok(EXTERNAL_PROCESSORS.length > 0, "표가 비어 있다");

  for (const processor of EXTERNAL_PROCESSORS) {
    assert.ok(processor.name.length > 0, "이름이 없는 항목이 있다");
    assert.ok(processor.role.length > 0, `${processor.name}: 하는 일이 없다`);
    assert.ok(processor.data.length > 0, `${processor.name}: 닿는 것이 없다`);
  }
});

// -----------------------------------------------------------------------------
// 2. 로그인 없이 볼 수 있는가
// -----------------------------------------------------------------------------

test("방침과 삭제 안내는 로그인을 요구하지 않는다", () => {
  /*
    Google OAuth 동의 화면에 등록하는 주소다. 검수하는 사람에게는 우리
    계정이 없다. 가입을 망설이는 사람도 가입 전에 읽어야 한다.
    앱 묶음 안으로 옮기면 둘 다 깨진다.
  */
  for (const route of ["privacy", "data-deletion"]) {
    const source = readFileSync(
      path.join(appDir, route, "page.tsx"),
      "utf8",
    );

    for (const guard of ["requireActiveAccount", "requireAccount"]) {
      assert.ok(
        !source.includes(guard),
        `/${route}가 로그인을 요구하면 가입 전에 읽을 수 없다`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 3. 로그인 화면에서 닿을 수 있는가
// -----------------------------------------------------------------------------

test("로그인 화면에 방침과 삭제 안내로 가는 길이 있다", () => {
  // 읽을 수 있어도 찾을 수 없으면 없는 것과 같다.
  const source = readFileSync(path.join(appDir, "login", "page.tsx"), "utf8");

  for (const href of ["/privacy", "/data-deletion"]) {
    assert.ok(
      source.includes(`"${href}"`),
      `로그인 화면에 ${href} 링크가 없다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 4. 가리키는 경로가 실제로 있는가
// -----------------------------------------------------------------------------

test("방침과 삭제 안내가 가리키는 앱 경로가 모두 실제 화면이다", () => {
  /*
    없어진 화면을 가리킨 채로 두면, 지우러 갔는데 404가 난다.
    나가는 길이 막히는 것이라 특히 나쁘다.
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
      walk(full, entry.startsWith("(") ? route : `${route}/${entry}`);
    }
  };

  walk(appDir, "");

  const linked = new Set();

  for (const file of [
    path.join(appDir, "privacy", "page.tsx"),
    path.join(appDir, "data-deletion", "page.tsx"),
    path.join(appDir, "policy-document.tsx"),
  ]) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(/href="(\/[^"#]*)"/gu)) {
      linked.add(match[1]);
    }
  }

  const missing = [...linked].filter((route) => !routes.has(route));

  assert.deepEqual(
    missing,
    [],
    `없는 화면을 가리킨다: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 5. 글이 비어 있지 않은가
// -----------------------------------------------------------------------------

test("절마다 열쇠가 겹치지 않는다", () => {
  // 겹치면 차례의 링크가 엉뚱한 곳으로 간다.
  for (const sections of [PRIVACY_SECTIONS, DELETION_SECTIONS]) {
    const ids = sections.map((section) => section.id);

    assert.equal(new Set(ids).size, ids.length, "절의 열쇠가 겹친다");
  }
});

test("절마다 제목과 내용이 있다", () => {
  assert.ok(PRIVACY_SECTIONS.length > 0);
  assert.ok(DELETION_SECTIONS.length > 0);

  for (const section of ALL_SECTIONS) {
    assert.ok(section.title.length > 0, `${section.id}: 제목이 없다`);
    assert.ok(section.blocks.length > 0, `${section.id}: 내용이 없다`);
  }
});

test("글토막마다 비어 있지 않다", () => {
  for (const section of ALL_SECTIONS) {
    for (const block of section.blocks) {
      if (block.kind === "text") {
        assert.ok(block.text.trim().length > 0, `${section.id}: 빈 문단이 있다`);
        continue;
      }

      if (block.kind === "list") {
        assert.ok(block.items.length > 0, `${section.id}: 빈 목록이 있다`);

        for (const item of block.items) {
          assert.ok(item.trim().length > 0, `${section.id}: 빈 항목이 있다`);
        }

        continue;
      }

      assert.ok(block.head.length > 0, `${section.id}: 표의 머리가 없다`);
      assert.ok(block.rows.length > 0, `${section.id}: 표가 비어 있다`);
    }
  }
});

test("표의 칸 수가 머리와 맞는다", () => {
  // 어긋나면 화면에서 칸이 밀려 엉뚱한 줄에 붙어 읽힌다.
  for (const section of ALL_SECTIONS) {
    for (const block of section.blocks) {
      if (block.kind !== "table") {
        continue;
      }

      for (const [index, row] of block.rows.entries()) {
        assert.equal(
          row.length,
          block.head.length,
          `${section.id}: ${index + 1}번째 줄의 칸 수가 머리와 다르다`,
        );
      }
    }
  }
});

test("굵게 표시가 짝이 맞는다", () => {
  // 짝이 안 맞으면 별표가 화면에 그대로 나온다.
  for (const section of ALL_SECTIONS) {
    for (const block of section.blocks) {
      const texts =
        block.kind === "text"
          ? [block.text]
          : block.kind === "list"
            ? block.items
            : block.rows.flat();

      for (const text of texts) {
        const stars = (text.match(/\*\*/gu) ?? []).length;

        assert.equal(
          stars % 2,
          0,
          `${section.id}: 굵게 표시의 짝이 맞지 않는다`,
        );
      }
    }
  }
});

// -----------------------------------------------------------------------------
// 6. 방침이 갖춰야 하는 것
// -----------------------------------------------------------------------------

test("마지막으로 고친 날이 적혀 있다", () => {
  /*
    언제 적힌 글인지 모르면 지금도 유효한지 알 수 없다.
    모양까지 본다. "최근"이나 빈 값이 들어가지 않게 한다.
  */
  assert.match(POLICY_UPDATED_AT, /^\d{4}-\d{2}-\d{2}$/u);
});

test("두 화면이 문의할 곳을 보여준다", () => {
  /*
    앱에서 지울 수 없는 사람에게는 메일이 유일한 길이다. 그 길이 화면에서
    빠지면 나가지 못하는 사람이 생긴다.

    주소 자체는 코드에 적지 않는다. 이 저장소는 공개되어 있고, 운영자 메일
    주소가 코드에 들어가는 것을 막는 검사가 따로 있다. 그래서 "주소가
    맞는가"가 아니라 **"주소를 읽어 오기는 하는가"**를 본다.
  */
  for (const route of ["privacy", "data-deletion"]) {
    const source = readFileSync(path.join(appDir, route, "page.tsx"), "utf8");

    assert.ok(
      source.includes("contactEmail"),
      `/${route}가 문의할 곳을 보여주지 않는다`,
    );
  }
});

test("지우는 길을 방침이 실제로 안내한다", () => {
  /*
    "지울 수 있다"고만 적고 어디서 지우는지 적지 않으면, 나가려는 사람은
    화면을 뒤지게 된다. 나가는 길을 찾기 어렵게 만드는 것이 가장 흔한
    붙잡기 수법이라 여기서 못 박는다.
  */
  const everything = ALL_SECTIONS.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === "text"
        ? [block.text]
        : block.kind === "list"
          ? [...block.items]
          : block.rows.flat(),
    ),
  ).join("\n");

  assert.match(
    everything,
    /계정 지우기/u,
    "지우는 단추의 이름이 글 안에 없다",
  );
});
