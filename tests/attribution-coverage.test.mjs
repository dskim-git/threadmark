/**
 * 출처 표기가 조건을 지키고 있는지 확인한다. (설계 문서 15.1절)
 *
 * **이것은 기능이 아니라 약속이다.** TMDB API를 쓰는 조건으로 표기하기로
 * 한 것이며, 지키지 않으면 쓸 자격이 없어진다. 사용법이나 화면과 달리
 * **어긋나도 아무 데서도 오류가 나지 않는다.** 그래서 더 쉽게 잊힌다.
 *
 * 잊히는 길이 셋 있다.
 *
 *   화면을 고치다가 로고가 눈에 거슬려 지운다
 *   문구가 영문이라 어색해서 번역한다
 *   표기 화면을 만들어 두고 메뉴에서 닿을 길을 빼먹는다
 *
 * 셋 다 악의 없이 일어난다. 여기서 막는다. 사용법(`guide-coverage`)과
 * 개인정보 처리방침(`legal-coverage`)을 검사로 붙잡아 둔 것과 같은 이유다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ATTRIBUTIONS,
  ATTRIBUTION_LOGO_HEIGHT,
} from "../src/lib/legal/attribution.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const creditsPage = path.join(root, "src", "app", "credits", "page.tsx");

test("표기할 곳이 적혀 있다", () => {
  assert.ok(ATTRIBUTIONS.length > 0, "표기 목록이 비어 있다");

  const ids = ATTRIBUTIONS.map((item) => item.id);

  assert.equal(new Set(ids).size, ids.length, "열쇠가 겹친다");
});

test("TMDB 표기가 있다", () => {
  /*
    **이름으로 콕 집어 확인한다.** 목록을 훑는 검사만 두면, 목록이 통째로
    비었을 때도 "모든 항목이 조건을 지킨다"가 참이 되어 통과한다.
    (`docs/VERIFICATION.md` 4-24절에서 겪은 것과 같은 함정이다)
  */
  const tmdb = ATTRIBUTIONS.find((item) => item.id === "tmdb");

  assert.ok(tmdb, "TMDB 표기가 없다. API를 쓰는 조건이다");
});

test("고지 문구를 번역하거나 고치지 않았다", () => {
  /*
    15.1절 3번: "다음 공식 고지 문구를 번역하거나 수정하지 않고 그대로
    표시한다."

    **글자 그대로 견준다.** 마침표 하나, 대소문자 하나까지다. 이 저장소의
    글이 전부 한글이라 이 한 줄만 영문으로 남는 것이 어색해 보이는데,
    그 어색함이 지켜야 할 모양이다.
  */
  const tmdb = ATTRIBUTIONS.find((item) => item.id === "tmdb");

  assert.equal(
    tmdb?.notice,
    "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    "TMDB 고지 문구가 바뀌었다. 번역하거나 고치면 안 된다",
  );
});

test("항목마다 이름·설명·링크·로고·문구가 있다", () => {
  for (const item of ATTRIBUTIONS) {
    assert.ok(item.name.length > 0, `${item.id}: 이름이 없다`);
    assert.ok(item.role.length > 0, `${item.id}: 설명이 없다`);
    assert.ok(item.notice.length > 0, `${item.id}: 고지 문구가 없다`);
    assert.ok(item.logoAlt.length > 0, `${item.id}: 로고 대체 글이 없다`);

    for (const [field, value] of [
      ["siteUrl", item.siteUrl],
      ["termsUrl", item.termsUrl],
    ]) {
      assert.ok(
        value.startsWith("https://"),
        `${item.id}: ${field}이 https가 아니다`,
      );
    }
  }
});

test("로고 파일이 실제로 있다", () => {
  /*
    **없는 그림을 가리키면 화면에 깨진 자리만 남는다.** 그것은 표기를 하지
    않은 것과 같고, 오류도 나지 않아 아무도 모른다.

    공식 승인 로고 파일만 쓴다는 조건이라 우리가 그려 넣을 수도 없다.
  */
  for (const item of ATTRIBUTIONS) {
    assert.ok(
      item.logoSrc.startsWith("/"),
      `${item.id}: 로고 주소가 / 로 시작하지 않는다`,
    );

    const file = path.join(root, "public", item.logoSrc.slice(1));

    assert.ok(
      existsSync(file),
      `${item.id}: 로고 파일이 없다. public${item.logoSrc}에 공식 파일을 넣는다`,
    );
  }
});

test("표기 화면이 세 가지를 모두 그린다", () => {
  /*
    15.1절이 요구하는 셋을 화면이 실제로 쓰는지 본다. 목록에만 있고 화면이
    안 그리면 표기가 없는 것과 같다.

      1. 공식 승인 로고
      2. 웹사이트 링크
      3. 고지 문구
  */
  const source = readFileSync(creditsPage, "utf8");

  assert.ok(
    source.includes("item.logoSrc"),
    "표기 화면이 로고를 그리지 않는다",
  );
  assert.ok(
    source.includes("item.siteUrl"),
    "표기 화면이 웹사이트 링크를 그리지 않는다",
  );
  assert.ok(
    source.includes("item.notice"),
    "표기 화면이 고지 문구를 그리지 않는다",
  );
});

test("표기 화면은 로그인을 요구하지 않는다", () => {
  /*
    표기는 누구에게나 보여야 하는 것이지 회원에게만 보일 것이 아니다.
    앱 묶음(`(app)`) 안으로 옮기면 그것이 깨진다. 사용법 화면과 같다.
  */
  const source = readFileSync(creditsPage, "utf8");

  assert.ok(
    !source.includes("requireActiveAccount"),
    "표기 화면이 승인을 요구하면 로그인하지 않은 사람이 볼 수 없다",
  );
});

test("표기 화면에 닿을 길이 있다", () => {
  /*
    **만들어 두고 닿을 길을 빼먹는 것이 가장 흔한 어긋남이다.** 화면은
    있는데 아무도 가지 못하면 표기하지 않은 것과 같다.

    **어느 화면에 두는지는 정하지 않는다.** 자리를 목록으로 못 박으면
    링크를 옮길 때마다 이 검사를 함께 고쳐야 하고, 고치는 김에 느슨하게
    만들기 쉽다. 붙잡을 것은 자리가 아니라 **닿을 수 있는가**다.

    표기 화면 자신은 세지 않는다. 자기 자신을 가리키는 링크는 길이 아니다.
  */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);

      return entry.isDirectory() ? walk(full) : [full];
    });

  const linked = walk(path.join(root, "src", "app"))
    .filter((file) => file.endsWith(".tsx") && file !== creditsPage)
    .some((file) => readFileSync(file, "utf8").includes('"/credits"'));

  assert.ok(
    linked,
    "어느 화면에서도 /credits로 갈 수 없다. 메뉴나 바닥글에 링크를 둔다",
  );
});

test("로고 높이를 한 곳에서 정한다", () => {
  // 화면마다 제각각이면 "우리 이름보다 덜 두드러지게"를 지키는지 알 수 없다.
  assert.ok(
    ATTRIBUTION_LOGO_HEIGHT > 0 && ATTRIBUTION_LOGO_HEIGHT <= 40,
    "로고 높이가 우리 이름보다 두드러지지 않는 크기여야 한다",
  );
});
