/**
 * 자료 화면은 **읽기가 먼저다.** (2026-10-04, 사용자가 쓰다가 말함)
 *
 * > 각 자료를 눌러보면 여기도 마찬가지로 기본값이 수정할 수 있는 창들로
 * > 되어 있어. (…) 그 버튼을 누르지 않았을 때는 입력되어 있는 내용들이
 * > 편집창처럼 나오지 않고 깔끔하게 기록되어 있는 화면을 보이게 해줘.
 *
 * 무엇이 조용히 깨지는가
 *   **`useSourceEditing`은 감싸지 않은 곳에서 `true`를 돌려준다.** 갈래 칸이
 *   자료 화면 밖에서도 쓰일 수 있어서 그렇게 두었다. 그 말은, 화면에서
 *   `SourceEditing`을 빼면 **모든 칸이 "늘 고치는 중"으로 돌아간다는**
 *   뜻이다. 오류가 나지 않는다. 고친 것이 통째로 되돌아가고 아무도 모른다.
 *
 *   갈래 칸을 새로 만들 때도 같다. 읽기 화면을 빠뜨리면 **그 갈래만** 늘
 *   펼친 폼이고, 그 갈래의 자료를 담아보기 전에는 보이지 않는다.
 *
 * 왜 소스 글을 읽어 검사하나
 *   갈래 칸은 모두 Client Component다. 그려서 확인하는 검사가 이 저장소에
 *   없다. `pdf-server-config`와 `wide-screen-scroll`이 쓴 방식을 따른다.
 *   **약한 그물이지만 없는 것보다 낫다.**
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourcesDir = path.join(repoRoot, "src/app/(app)/sources");

const detailPage = readFileSync(
  path.join(sourcesDir, "[id]/page.tsx"),
  "utf8",
);

function read(name) {
  return readFileSync(path.join(sourcesDir, name), "utf8");
}

// `[id]/page.tsx`도 같은 함수로 읽는다. 경로가 하위 폴더일 뿐이다.

/**
 * 담아둔 값을 고치는 폼을 들고 있는 파일.
 *
 * **이 목록은 빚이지 면제가 아니다.** 갈래 칸을 새로 만들면 여기에 더하고
 * 읽기 화면을 함께 만든다.
 *
 * 음악이 `music-panel.tsx`가 아닌 까닭: 그 파일은 껍데기이고 입력칸은
 * `music-profile-form.tsx`에 있다. **폼이 있는 파일을 가리켜야 한다.**
 */
const PANELS_WITH_FORMS = [
  "book-panel.tsx",
  "youtube-panel.tsx",
  "place-panel.tsx",
  "media-panel.tsx",
  "music-profile-form.tsx",
  "project-use-panel.tsx",
];

/**
 * 읽기 화면을 두지 않는 칸과 **그 까닭.**
 *
 * 까닭 없이 빼면 그것은 빠뜨린 것이지 정한 것이 아니다.
 * (`public-fields.ts`가 같은 방식이다)
 */
const WITHOUT_READ_VIEW = {
  "watch-panel.tsx":
    "볼 수 있는 곳입니다. 목록은 읽을 때도 그대로 보이고, 받아오기·직접 적기·빼기만 연필 안으로 들어갑니다. 공용 읽기 화면을 쓰지 않습니다",
  "music-panel.tsx":
    "껍데기입니다. 입력칸은 music-profile-form.tsx에 있고 그쪽이 읽기 화면을 갖춥니다",
  "music-workspace.tsx":
    "곡 정보와 들을 수 있는 곳을 묶어 들고 있는 껍데기입니다",
  "paper-summary.tsx": "처음부터 읽기 전용입니다. 고치기는 따로 있는 화면입니다",
  "paper-form.tsx": "자료를 새로 담는 화면의 폼입니다. 자료 화면이 아닙니다",
  "source-form.tsx": "자료를 새로 담거나 제목·설명을 고치는 화면의 폼입니다",
  "source-fields.tsx": "위 폼이 쓰는 칸들입니다",
  "new-source-form.tsx": "자료를 새로 담는 화면입니다",
  "analysis-form.tsx": "논문 분석 서식입니다. 따로 있는 화면입니다",
  "media-moment-form.tsx": "시즌·회차·타임코드 기록을 새로 만드는 칸입니다",
  "file-upload.tsx": "파일을 올리는 칸입니다",
  "music-find-links.tsx": "들을 수 있는 곳을 찾아오는 칸입니다",
  "place-picker.tsx": "지도에서 자리를 찍는 칸입니다",
  "place-map.tsx": "지도를 그리는 칸입니다",
  "file-list.tsx":
    "자료에 붙은 파일 목록입니다. 담아둔 값을 적는 칸이 아니라 파일마다의 단추들입니다",
  "drive-picker-button.tsx":
    "Drive에서 파일을 고르는 단추입니다. 고른 결과를 서버로 넘기는 숨은 칸들입니다",
  "source-editing.tsx":
    "고치는 상태와 연필 단추를 들고 있는 곳입니다. 입력칸이 없습니다",
  "recorded-fields.tsx":
    "읽기 화면을 그리는 곳 자체입니다. 입력칸이 없습니다",
  "website-form.tsx":
    "웹사이트 자료를 새로 담는 화면의 폼입니다. 자료 화면이 아닙니다. 자료 화면의 웹사이트 칸은 처음부터 읽기 전용입니다",
  "youtube-player.tsx":
    "영상을 보며 그 시점에 기록을 남기는 칸입니다. 담아둔 값을 읽는 자리가 아니라 새 기록을 만드는 자리입니다. 음성의 메모 칸과 같은 자리입니다",
};

test("자료 화면이 고치는 상태를 감싼다", () => {
  /*
    **이것이 빠지면 모든 갈래 칸이 `늘 고치는 중`으로 돌아간다.**
    `useSourceEditing`이 감싸지 않은 곳에서 `true`를 주기 때문이다.
    오류가 나지 않아서 고친 것이 통째로 되돌아가고 아무도 모른다.
  */
  assert.match(
    detailPage,
    /<SourceEditing>/u,
    "자료 화면이 SourceEditing으로 감싸지 않았다. 모든 갈래 칸이 늘 펼친 폼으로 돌아간다",
  );

  assert.match(
    detailPage,
    /<\/SourceEditing>/u,
    "SourceEditing을 닫지 않았다",
  );
});

test("고치기 단추가 자료 화면에 있다", () => {
  /*
    감싸기만 하고 단추가 없으면 **고칠 길이 사라진다.** 읽기 전용 화면만
    남고 값을 바꿀 수 없다. 반대 방향으로 조용한 고장이다.
    (보안 원칙 6의 "막는 것과 여는 것을 모두 검사한다"와 같은 생각)
  */
  assert.match(
    detailPage,
    /<SourceEditButton\s*\/>/u,
    "고치기 단추가 없다. 읽기 전용이 되어 값을 바꿀 수 없다",
  );
});

test("폼을 든 갈래 칸이 모두 읽기 화면을 갖춘다", () => {
  for (const name of PANELS_WITH_FORMS) {
    const source = read(name);

    /*
      **부르는 것까지 본다.** 처음에 `useSourceEditing`이라는 글자가 있는지만
      보았는데, `const editing = true`로 바꿔도 **`import` 줄에 그 글자가
      남아 통과했다.** 일부러 틀리게 고쳐 보고서 알았다.

      `그 글자가 있는가`로 쓴 검사는 `그 약속이 지켜지는가`를 묻지 않는다.
    */
    assert.match(
      source,
      /const editing = useSourceEditing\(\)/u,
      `${name}이 고치는 상태를 부르지 않는다. 그 갈래만 늘 펼친 폼이 된다`,
    );

    /*
      **보기만 하고 쓰지 않으면 아무것도 달라지지 않는다.** 값을 읽어
      두고 갈라 쓰지 않으면 읽기 화면이 그려질 길이 없다.
    */
    assert.match(
      source,
      /if\s*\(!editing\)/u,
      `${name}이 읽기 화면으로 갈라지지 않는다`,
    );
  }
});

test("읽기 화면은 같은 것을 쓴다", () => {
  // 갈래마다 따로 만들면 다섯 곳이 조금씩 달라진다.
  for (const name of PANELS_WITH_FORMS) {
    /*
      **쓰는 자리까지 본다.** 이름만 찾으면 `import` 줄에 걸려, 다른 것을
      그리도록 바꿔도 통과한다. 위와 같은 함정이다.
    */
    assert.match(
      read(name),
      /<RecordedFields/u,
      `${name}이 공용 읽기 화면을 그리지 않는다`,
    );
  }
});

test("폼을 든 파일을 빠뜨리지 않았다", () => {
  /*
    **양쪽에서 조인다.** 위 목록에 적은 것만 보면, 폼을 든 칸을 새로
    만들고 목록에 넣지 않았을 때 아무도 모른다.

    입력칸이 여럿인 파일을 전부 훑어, 위 두 목록 중 하나에 있어야 한다고
    본다. 둘 다 없으면 **정하지 않은 것이다.**
  */
  const files = readdirSync(sourcesDir).filter((name) => name.endsWith(".tsx"));

  const unaccounted = [];

  for (const name of files) {
    const source = read(name);

    const inputs = (source.match(/<input|<textarea|<select/gu) ?? []).length;

    // 숨은 칸 둘쯤은 어느 폼에나 있다. 사람이 적는 칸이 여럿인 것만 본다.
    if (inputs < 4) {
      continue;
    }

    if (PANELS_WITH_FORMS.includes(name) || name in WITHOUT_READ_VIEW) {
      continue;
    }

    unaccounted.push(name);
  }

  assert.deepEqual(
    unaccounted,
    [],
    `입력칸이 여럿인데 읽기 화면을 갖췄는지 정하지 않았다. PANELS_WITH_FORMS에 더하거나 WITHOUT_READ_VIEW에 까닭과 함께 적는다: ${unaccounted.join(", ")}`,
  );
});

test("읽기 화면을 두지 않는 칸에는 까닭이 적혀 있다", () => {
  for (const [name, reason] of Object.entries(WITHOUT_READ_VIEW)) {
    assert.ok(
      reason.trim().length > 10,
      `${name}에 적힌 까닭이 너무 짧다. 까닭 없이 빼면 빠뜨린 것이지 정한 것이 아니다`,
    );
  }
});

/**
 * 바꾸는 길이 연필 안에 있어야 하는 자리. (2026-10-04, 사용자 요청)
 *
 * > 이미지의 부분들도 연필로 수정모드가 될때만 연결할 수 있게 해주고
 *
 * **감싼 것까지 함께 본다.** 처음에는 파일에 `WhenEditing`이라는 글자가
 * 있는지만 보았는데, 그 파일에 그것이 여러 개라서 **하나를 떼어도
 * 통과했다.** 일부러 틀리게 고쳐 보고 알았다. 벌써 세 번째 같은 함정이다.
 *
 * 그래서 **여는 태그와 그것이 감싼 것을 붙여서** 본다.
 *
 * **공백을 지우고 견준다.** 줄바꿈과 들여쓰기까지 맞추게 하면, 줄을 한 칸
 * 옮기기만 해도 실패해서 검사가 성가신 것이 된다. 묻고 싶은 것은 "이것이
 * 저것을 감싸고 있는가"이지 "몇 칸 들여썼는가"가 아니다.
 */
const EDIT_ONLY_PLACES = [
  ['[id]/page.tsx', '<WhenEditing><Reveal label="프로젝트에 잇기">', "프로젝트에 잇기"],
  ['[id]/page.tsx', '<WhenEditing><Reveal label="다른 자료와 잇기">', "다른 자료와 잇기"],
  [
    "[id]/page.tsx",
    '<WhenEditing><Reveal label="목록에 없는 논문 담아두기">',
    "목록에 없는 논문 담아두기",
  ],
  ["[id]/page.tsx", "<WhenEditing><NodePicker", "자리에 놓기"],
  ["file-list.tsx", "<WhenEditing><formaction={detachSourceFile}>", "파일 해제"],
  ["watch-panel.tsx", "<WhenEditing><button", "볼 수 있는 곳 받아오기"],
  [
    "watch-panel.tsx",
    "<WhenEditing><formaction={addWatchProvider}",
    "볼 수 있는 곳 직접 적기",
  ],
  ["../tag-editor.tsx", "if(readOnly){", "태그 적는 칸"],
];

/** 공백을 전부 지운다. 감싼 모양만 남는다. */
function squeeze(text) {
  return text.replace(/\s+/gu, "");
}

test("바꾸는 길이 연필 안에 있다", () => {
  for (const [name, marker, what] of EDIT_ONLY_PLACES) {
    assert.ok(
      squeeze(read(name)).includes(squeeze(marker)),
      `${name}의 \`${what}\`이 읽는 화면에서도 보인다`,
    );
  }
});

test("읽을 때 태그는 읽기 전용으로 그린다", () => {
  /*
    `tag-editor.tsx`가 읽기 전용 길을 갖추고 있어도, **화면이 그것을 쓰지
    않으면 아무것도 달라지지 않는다.** 두 자리를 함께 본다.
  */
  assert.match(
    detailPage,
    /<TagEditor\s+readOnly/u,
    "읽는 화면이 태그를 읽기 전용으로 그리지 않는다. 적는 칸이 그대로 보인다",
  );
});

/**
 * 담긴 것이 있을 때만 보이는 칸과, 무엇을 세어 그렇게 정하는가.
 *
 * **세는 것이 아니라 하나하나 본다.** 처음에 `<WhenRecorded`의 개수만
 * 세었더니 하나를 떼어도 나머지가 남아 통과했다. 일부러 틀리게 고쳐 보고
 * 알았다. **개수로 세는 검사는 어느 하나가 빠진 것을 말해주지 않는다.**
 */
const HIDDEN_WHEN_EMPTY = [
  ["쓸 자리", "has={placements.length > 0}"],
  ["프로젝트", "has={linkedProjects.length > 0}"],
  [
    "관련 자료",
    "relations.outgoing.length > 0 || relations.incoming.length > 0",
  ],
  ["파일", "has={files.length > 0}"],
  ["볼 수 있는 곳", "has={watchProviders.length > 0}"],
  ["프로젝트별 활용 계획", "has={paperUses.length > 0}"],
];

test("담긴 것이 없는 칸은 읽을 때 보이지 않는다", () => {
  /*
    > 등록된 것이 없을 때는 그냥 빈칸으로 나오게하면 돼고.

    `WhenRecorded`가 그 일을 한다. **고치는 중에는 비어 있어도 보인다.**
    비었다고 숨기면 처음 잇는 길이 아예 사라진다.
  */
  for (const [what, marker] of HIDDEN_WHEN_EMPTY) {
    assert.ok(
      detailPage.includes(marker),
      `\`${what}\` 칸이 담긴 것이 없어도 읽는 화면에 남는다`,
    );
  }
});

test("연필 그림을 두 벌 만들지 않는다", () => {
  /*
    기록 카드와 자료 화면이 같은 단추를 쓴다. 한때 `capture-editing.tsx`
    안에 그려 두었고 거기 "한 곳에서만 쓰는 작은 그림"이라고 적혀 있었다.
    쓰는 곳이 둘이 되면서 `pencil-icon.tsx`로 떼어냈다.

    **같은 일을 가리키는 그림이 화면마다 다르면 읽는 사람이 둘을 다른
    것으로 여긴다.**
  */
  const users = [
    readFileSync(
      path.join(repoRoot, "src/app/(app)/captures/capture-editing.tsx"),
      "utf8",
    ),
    read("source-editing.tsx"),
  ];

  for (const source of users) {
    assert.match(source, /PencilIcon/u, "공용 연필을 쓰지 않는다");
    assert.ok(
      !/<path d="M11\.5 2\.5/u.test(source),
      "연필을 이 파일 안에 또 그렸다. pencil-icon.tsx를 쓴다",
    );
  }
});
