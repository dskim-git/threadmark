/**
 * 자료 안에서 기록 찾기. (2026-10-05, 사용자 요청)
 *
 * > + 모양의 버튼 왼쪽에 찾기 버튼(돋보기 모양)을 만들어서 그 버튼을 누르면
 * > 찾고자 하는 단어나 문구를 입력받아서 그 문구가 있는 기록(메모)만 찾아서
 * > 나오도록 하는 기능도 있었으면 좋겠어.
 *
 * 무엇이 조용히 틀리는가
 *   - 검색어를 **막아 쓰지 않으면** `%`나 `,`가 뜻을 가져서 **오류 없이
 *     결과만 틀린다.** `search/query.ts` 머리말이 겪은 일을 적어 두었다
 *   - 앱 전체 검색과 **뒤지는 칸이 어긋나면**, 같은 말로 찾았는데 한쪽에서
 *     찾은 것이 다른 쪽에서 안 나온다. 쓰는 사람은 둘 중 어느 쪽이 맞는지
 *     알 수 없다
 *   - 거르기를 **함께 들고 가지 않으면** 찾는 순간 별·태그가 풀린다
 *
 * 돌려 보는 검사가 이 저장소에 없어 소스 글을 읽어 확인한다.
 * (`pdf-server-config`, `wide-screen-scroll`과 같은 방식)
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function read(relative) {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

const captureQueries = read("src/lib/captures/queries.ts");
const searchQueries = read("src/lib/search/queries.ts");
const detailPage = read("src/app/(app)/sources/[id]/page.tsx");
const tools = read("src/app/(app)/captures/capture-tools.tsx");

/** 공백을 지운다. 줄바꿈과 들여쓰기는 묻는 것이 아니다. */
function squeeze(text) {
  return text.replace(/\s+/gu, "");
}

/** `["a", "b"]` 꼴에서 칸 이름을 뽑는다. */
function columnsOf(source, marker) {
  const at = source.indexOf(marker);

  assert.notEqual(at, -1, `${marker}를 찾을 수 없다`);

  const open = source.indexOf("[", at);
  const close = source.indexOf("]", open);

  return [...source.slice(open, close).matchAll(/"([a-z_]+)"/gu)].map(
    (match) => match[1],
  );
}

test("검색어를 막아 쓰는 일을 직접 하지 않는다", () => {
  /*
    **`search/query.ts`가 그 일을 하려고 있는 파일이다.** 손으로 무늬를
    만들면 `%`와 쉼표를 막는 순서까지 다시 맞춰야 하고, 틀려도 오류가 나지
    않는다.
  */
  assert.match(
    captureQueries,
    /buildIlikeFilter/u,
    "기록 찾기가 공용 ilike 만들기를 쓰지 않는다. 검색어의 %와 쉼표가 뜻을 가진다",
  );

  assert.match(
    captureQueries,
    /normalizeSearchTerm/u,
    "검색어를 다듬지 않는다. 빈 글자와 너무 긴 글이 그대로 질의에 간다",
  );

  // 손으로 무늬를 만든 자리가 없어야 한다.
  assert.ok(
    !/`%\$\{/u.test(captureQueries),
    "검색 무늬를 손으로 만들고 있다. toLikePattern을 쓴다",
  );
});

test("앱 전체 검색과 같은 칸을 뒤진다", () => {
  /*
    **이 검사가 이 기능에서 가장 값지다.**

    같은 말로 찾는데 두 화면이 다른 것을 뒤지면, 자료 안에서는 안 나오고
    전체 검색에서는 나온다. 쓰는 사람은 **어느 쪽이 맞는지 알 수 없고**,
    자기 기록이 사라진 줄 안다.

    2026-09-26에 이미 같은 일이 있었다. `AI에게 물어보기`와 `글자로 찾기`가
    서로 다른 것을 뒤지고 있었고, 사용법은 오히려 뒤처진 쪽을 권했다.
  */
  // `buildIlikeFilter(`로 찾는다. 괄호가 없으면 `import` 줄에 걸린다.
  const inSource = columnsOf(captureQueries, "buildIlikeFilter(");
  const appWide = columnsOf(searchQueries, 'from("captures")');

  assert.deepEqual(
    inSource,
    appWide,
    `자료 안 찾기와 앱 전체 찾기가 다른 칸을 뒤진다. 자료 안: ${inSource.join(", ")} / 전체: ${appWide.join(", ")}`,
  );

  // 세 칸이 맞는지 못 박는다. 한쪽이 통째로 비어도 위 검사는 통과한다.
  assert.deepEqual(inSource, ["content", "original_text", "translated_text"]);
});

test("찾는 말이 주소에 실린다", () => {
  /*
    **별과 태그가 이미 주소로 걸린다.** 찾기만 브라우저 안에서 하면 거르는
    길이 두 가지가 되고, 셋을 함께 쓸 때 어느 쪽이 이기는지 알 수 없다.
    걸러 놓은 자리를 다시 열거나 남에게 줄 수도 없다.
  */
  assert.match(
    detailPage,
    /params\.set\("q", nextTerm\)/u,
    "찾는 말이 주소에 실리지 않는다",
  );

  assert.match(
    detailPage,
    /firstValue\(query\.q\)/u,
    "주소에서 찾는 말을 읽지 않는다",
  );

  assert.ok(
    squeeze(detailPage).includes(squeeze("taggedCaptureIds,\n      captureTerm,")),
    "찾는 말을 기록 조회에 넘기지 않는다. 화면만 바뀌고 목록은 그대로다",
  );
});

test("찾을 때 별과 태그를 함께 들고 간다", () => {
  /*
    빠뜨리면 **찾는 순간 별만 보던 것이 풀린다.** 거르기가 서로를 지우는
    자리이고, 오류는 나지 않는다.
  */
  const at = detailPage.indexOf("<CaptureTools");
  const block = detailPage.slice(at, at + 1200);

  assert.match(block, /keep=\{/u, "걸려 있는 거르기를 넘기지 않는다");
  assert.match(block, /STARRED_PARAM/u, "별을 함께 들고 가지 않는다");
  assert.match(block, /tagSlug/u, "태그를 함께 들고 가지 않는다");

  // 받는 쪽이 그것을 숨은 칸으로 내보내야 뜻이 산다.
  assert.match(
    tools,
    /Object\.entries\(keep\)/u,
    "받은 거르기를 폼에 싣지 않는다",
  );
});

test("새 기록 칸은 눌러야 나온다", () => {
  /*
    > 추가 버튼이 눌리지 않으면 이 칸은 나오지 않는거야.

    **늘 펴져 있던 칸이다.** 화면 맨 아래에 있어서 기록 마흔 건을 다
    지나야 닿았고, 읽으러 온 사람에게는 늘 펴진 폼이 하나 더 있는
    것이었다. 자료 화면을 읽기 먼저로 고친 것과 같은 생각이다. (4-69)
  */
  assert.ok(
    !detailPage.includes('<Panel title="새 기록">'),
    "새 기록 칸이 늘 펴진 채로 남아 있다",
  );

  // 폼이 `+` 안에 들어 있어야 한다. 밖에 있으면 단추가 아무것도 안 한다.
  const at = detailPage.indexOf("<CaptureTools");
  const until = detailPage.indexOf("</CaptureTools>", at);

  assert.ok(at !== -1 && until !== -1, "CaptureTools를 찾을 수 없다");
  assert.ok(
    detailPage.slice(at, until).includes("<CaptureForm"),
    "새 기록 폼이 추가 단추 안에 있지 않다. 눌러도 아무 일이 없다",
  );

  assert.match(
    tools,
    /\{adding \? children : null\}/u,
    "추가 단추가 눌리지 않아도 칸이 나온다",
  );
});

test("펼쳐지는 칸이 머리말 줄 안에 들어가지 않는다", () => {
  /*
    **한 번 그렇게 만들었다가 사용자가 찾았다.** (2026-10-05)

    > 2단으로 만드는게 아니라는거야.

    단추만 돌려받고 펼쳐지는 칸을 머리말 줄 자리에서 내보냈더니, 그 칸이
    **줄의 칸 하나가 되어 제목 오른쪽에 세로로 길게 섰다.** 두 단으로
    나뉜 것처럼 보였다.

    단추는 줄 안에, 펼쳐지는 칸은 줄 아래 전체 너비여야 한다. 그 둘이 한
    묶음으로 나올 수 없으므로 **줄 자체를 `CaptureTools`가 그린다.**

    제목을 밖에서 받는다는 것이 곧 "줄을 이 칸이 들고 있다"는 뜻이다.
    `titleSlot`은 반드시 넘겨야 하는 값이라, 다시 줄 안으로 넣으면 타입
    검사가 먼저 멈춘다. 여기서는 그 약속이 살아 있는지만 본다.
  */
  const at = detailPage.indexOf("<CaptureTools");
  const block = detailPage.slice(at, at + 1600);

  assert.match(
    block,
    /titleSlot=\{/u,
    "머리말을 CaptureTools에 넘기지 않는다. 줄을 밖에서 그리면 펼쳐지는 칸이 그 줄의 칸이 된다",
  );

  assert.match(block, /filterSlot=\{/u, "별 거르기를 넘기지 않는다");

  /*
    펼쳐지는 칸이 줄 바깥에 있어야 한다. 줄을 닫은 뒤에 온다.

    공백을 지우고 본다. 들여쓰기는 묻는 것이 아니다.
  */
  const squeezedTools = squeeze(tools);
  const rowCloses = squeezedTools.lastIndexOf("</div></div></div>");

  assert.ok(rowCloses !== -1, "머리말 줄을 닫는 자리를 찾을 수 없다");
  assert.ok(
    squeezedTools.indexOf("{adding?children:null}") > rowCloses,
    "펼쳐지는 칸이 머리말 줄 안에 있다. 제목 오른쪽에 세로로 선다",
  );
});

test("찾아서 비었을 때와 처음부터 없을 때를 다르게 말한다", () => {
  /*
    **걸러서 빈 것과 처음부터 없는 것은 다른 일이다.** 같은 말로 적으면
    "내 기록이 사라졌나"를 묻게 된다. 별과 태그가 이미 그렇게 갈라 적는다.
  */
  assert.ok(
    detailPage.includes("이 든 기록이 없습니다"),
    "찾아서 비었을 때 할 말이 따로 없다",
  );

  // 그 말이 찾는 말을 보고 갈리는지까지 본다.
  const at = detailPage.indexOf("이 든 기록이 없습니다");
  assert.ok(
    detailPage.slice(Math.max(0, at - 200), at).includes("captureTerm"),
    "비었을 때 할 말이 찾는 말을 보고 갈리지 않는다",
  );
});
