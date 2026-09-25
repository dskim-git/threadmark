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

test("항목마다 이름·설명·링크·문구가 있다", () => {
  for (const item of ATTRIBUTIONS) {
    assert.ok(item.name.length > 0, `${item.id}: 이름이 없다`);
    assert.ok(item.role.length > 0, `${item.id}: 설명이 없다`);
    assert.ok(item.notice.length > 0, `${item.id}: 고지 문구가 없다`);

    /*
      로고는 곳마다 다르다. TMDB는 공식 로고를 명시적으로 요구하고
      (15.1절), JustWatch는 출처를 밝히는 것이 요구다. **없을 수 있게
      두되, 두었으면 읽어주는 기계를 위한 글이 함께 있어야 한다.**
    */
    if (item.logoSrc) {
      assert.ok(
        item.logoAlt && item.logoAlt.length > 0,
        `${item.id}: 로고를 두었는데 대체 글이 없다`,
      );
    }

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
    if (!item.logoSrc) {
      continue;
    }

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

test("TMDB에는 로고가 반드시 있다", () => {
  /*
    **로고를 선택으로 열어둔 탓에 TMDB 로고까지 사라질 수 있다.**
    15.1절은 TMDB에 대해서만은 공식 승인 로고를 명시적으로 요구한다.
    느슨하게 만든 자리를 이름으로 콕 집어 다시 조인다.
  */
  const tmdb = ATTRIBUTIONS.find((item) => item.id === "tmdb");

  assert.ok(
    tmdb?.logoSrc,
    "TMDB 로고가 없다. 설계 문서 15.1절이 공식 승인 로고를 요구한다",
  );
});

test("JustWatch 표기가 있다", () => {
  /*
    볼 수 있는 곳 정보는 JustWatch가 모은 것이고, TMDB는 그것을 쓸 때
    출처를 JustWatch로 밝히라고 요구한다.
  */
  const justwatch = ATTRIBUTIONS.find((item) => item.id === "justwatch");

  assert.ok(justwatch, "JustWatch 표기가 없다");
  assert.ok(
    justwatch.notice.includes("JustWatch"),
    "고지 문구에 JustWatch가 없다. 출처를 그 이름으로 밝혀야 한다",
  );
});

test("Kakao 표기가 있다", () => {
  /*
    2026-09-25에 더했다. **그전까지 책 검색으로 Kakao를 쓰고 있었는데 이
    목록에 없었다.** 방침 표(`legal/content.ts`)에는 있었고 표기 화면에는
    없었다. 두 곳이 갈라져 있던 것이다.

    이름으로 콕 집어 확인하는 까닭은 위와 같다. 목록을 훑는 검사만 두면
    빠진 것을 잡지 못한다.

    **고지 문구를 글자 그대로 견주지는 않는다.** 카카오가 정해진 문구를
    요구하는지 확인하지 못했고, 우리가 쓴 글이기 때문이다. 요구를 찾으면
    그때 TMDB처럼 글자 그대로 견주는 검사를 더한다.
  */
  const kakao = ATTRIBUTIONS.find((item) => item.id === "kakao");

  assert.ok(kakao, "Kakao 표기가 없다. 책과 장소를 거기서 가져온다");
  assert.ok(
    kakao.role.includes("장소"),
    "Kakao 표기에 장소가 빠졌다. 나가는 것이 늘었으면 적힌 것도 늘어야 한다",
  );
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
