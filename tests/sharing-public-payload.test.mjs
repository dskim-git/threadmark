/**
 * 문이 돌려준 값을 화면에 넘기기 전에 한 번 더 막는다. (16-B.8 4차례)
 *
 * **세 번째 겹이다.**
 *
 *   1. SQL이 나가는 칸만 글자로 적는다 (`public_project`)
 *   2. 검사가 그 글을 `public-fields.ts`의 목록과 견준다
 *   3. **돌아온 값**에 나가면 안 되는 열쇠가 있으면 거부한다 ← 이 파일
 *
 * 1과 2가 맞으면 3은 아무 일도 하지 않는다. 그래도 두는 까닭은 **틀렸을 때
 * 남의 글이 밖으로 나가는 자리**이고 되돌릴 수 없어서다.
 *
 * 그리고 3은 다른 것을 잡는다. 1과 2는 **우리가 쓴 SQL**을 보는데, 3은
 * **실제로 돌아온 값**을 본다. 함수를 손으로 고쳐 올렸거나 마이그레이션이
 * 덜 적용된 데이터베이스를 보고 있으면 1과 2는 통과하고 3만 안다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  WITHHELD_NOTICE,
  hasForbiddenKey,
  readPublicProject,
} from "../src/lib/sharing/public-payload.ts";
import { NEVER_PUBLIC } from "../src/lib/sharing/public-fields.ts";

/** 문이 제대로 돌려줬을 때의 모양. */
function goodPayload() {
  return {
    project: {
      name: "수업 준비",
      description: "오류 분석 수업",
      project_type: "teaching",
    },
    sources: [
      {
        type: "paper",
        title: "학생 오류 분석",
        subtitle: null,
        description: "왜 담았는지",
        captures: [{ content: "내가 쓴 메모" }],
        paper: { journal_name: "수학교육연구", publication_year: 2024 },
        book: null,
        place: null,
        website: null,
        youtube: null,
        music: null,
        media: null,
      },
    ],
    notes: [{ content: "자료 없는 빠른 메모" }],
    outline: [
      {
        depth: 0,
        title: "서론",
        body: "이 연구는",
        items: [
          {
            note: "근거로 쓴다",
            source_title: "학생 오류 분석",
            capture_content: null,
          },
        ],
      },
    ],
  };
}

// -----------------------------------------------------------------------------
// 제대로 된 것은 통과한다
// -----------------------------------------------------------------------------

test("문이 돌려준 것을 화면이 쓸 모양으로 바꾼다", () => {
  /*
    **막는 것만 검사하면 과잉 차단을 놓친다.** (보안 원칙 6) 전부 거부하는
    함수는 아래 검사를 모두 통과하는데, 그러면 공개 화면이 늘 404다.
  */
  const project = readPublicProject(goodPayload());

  assert.ok(project, "제대로 된 값을 거부했다. 공개 화면이 늘 404가 된다");
  assert.equal(project.name, "수업 준비");
  assert.equal(project.sources.length, 1);
  assert.equal(project.sources[0].captures[0].content, "내가 쓴 메모");
  assert.equal(project.notes[0].content, "자료 없는 빠른 메모");
  assert.equal(project.outline[0].title, "서론");
  assert.equal(project.outline[0].items[0].note, "근거로 쓴다");
});

test("딸린 정보는 책만 읽는다", () => {
  /*
    **2026-10-04에 책 하나만 남았다.** 나머지 여섯 표의 서지는 밖에서
    받아온 값이고, 공급자 이용 정책을 확인하는 동안 안 내보낸다.
    (VERIFICATION 4-60절)

    문이 아직 논문 서지를 돌려주더라도 **여기서 떨어진다.** 마이그레이션이
    덜 적용된 데이터베이스를 보고 있을 수 있다.
  */
  const payload = goodPayload();

  payload.sources[0].book = { why_chosen: "수업에 쓰려고" };

  const project = readPublicProject(payload);
  const profiles = project.sources[0].profiles;

  assert.ok(profiles.book, "책 정보가 안 읽혔다");
  assert.equal(profiles.book.why_chosen, "수업에 쓰려고");

  // 논문 서지는 문이 돌려줘도 읽지 않는다.
  assert.ok(!("paper" in profiles), "논문 서지를 아직 읽는다");
  assert.ok(!("place" in profiles), "장소를 아직 읽는다");
  assert.ok(!("media" in profiles), "작품 정보를 아직 읽는다");
});

// -----------------------------------------------------------------------------
// 섞여 들어오면 거부한다
// -----------------------------------------------------------------------------

test("원문이 섞여 있으면 화면을 그리지 않는다", () => {
  /*
    **이것이 이 파일에서 가장 중요한 검사다.**

    열쇠만 지우고 나머지를 보여주지 않는다. 섞여 들어온 경로를 모르는
    채로 일부만 고치면 **다른 자리에도 섞여 있을 수 있다.**
    덜 보여주는 쪽이 더 보여주는 쪽보다 안전하다.
  */
  const payload = goodPayload();

  payload.sources[0].captures[0].original_text = "남의 글";

  assert.equal(readPublicProject(payload), null);
});

test("초록이 섞여 있으면 화면을 그리지 않는다", () => {
  const payload = goodPayload();

  payload.sources[0].paper = { abstract: "밖에서 받아온 남의 글" };

  assert.equal(readPublicProject(payload), null);
});

test("깊이 숨어 있어도 찾는다", () => {
  /*
    섞여 들어오는 자리가 맨 위라고 가정하지 않는다. 뼈대 자리에 놓인
    재료 안쪽이 가장 깊고, 그쪽을 빠뜨리기 쉽다.
  */
  const payload = goodPayload();

  payload.outline[0].items[0].translated_text = "옮긴 글";

  assert.equal(readPublicProject(payload), null);
});

test("못 박은 칸을 전부 찾는다", () => {
  /*
    위의 검사들은 손으로 적은 몇 개를 본다. 이 검사는 `NEVER_PUBLIC`
    목록 전체를 훑는다. **못을 더 박았을 때 그 못이 여기서도 박히는지**
    보는 것이 이쪽이다.
  */
  const columns = NEVER_PUBLIC.filter(
    (field) => field.column !== "*",
  ).map((field) => field.column);

  assert.ok(columns.length >= 5, "못 박은 칸이 너무 적다. 이 검사가 헛돈다");

  for (const column of columns) {
    assert.equal(
      hasForbiddenKey({ a: { b: [{ [column]: "값" }] } }),
      true,
      `${column}을 찾지 못했다`,
    );
  }
});

test("나가도 되는 열쇠는 거부하지 않는다", () => {
  // 과하게 막으면 공개 화면이 비는데, 그 상태는 조용하다.
  assert.equal(
    hasForbiddenKey({ content: "내 메모", journal_name: "학술지" }),
    false,
  );
  assert.equal(hasForbiddenKey(null), false);
  assert.equal(hasForbiddenKey("원문"), false);
});

// -----------------------------------------------------------------------------
// 모양이 어긋나면 거부한다
// -----------------------------------------------------------------------------

test("모양이 어긋나면 null이다", () => {
  /*
    **모르면 거부한다.** (보안 원칙 7) 빈 것으로 넘기면 화면이 제목 없는
    빈 페이지를 그리고, 보는 사람은 고장이라고 여긴다.
  */
  assert.equal(readPublicProject(null), null);
  assert.equal(readPublicProject("글자"), null);
  assert.equal(readPublicProject([]), null);
  assert.equal(readPublicProject({}), null);
  // 이름이 없으면 보여줄 것이 없다.
  assert.equal(readPublicProject({ project: { description: "설명만" } }), null);
});

test("목록이 없어도 비어 있는 목록으로 다룬다", () => {
  // 담은 것이 없는 프로젝트도 열려야 한다. 이름만 있으면 성립한다.
  const project = readPublicProject({ project: { name: "빈 프로젝트" } });

  assert.ok(project);
  assert.deepEqual(project.sources, []);
  assert.deepEqual(project.notes, []);
  assert.deepEqual(project.outline, []);
});

test("아무것도 남지 않은 놓인 재료는 버린다", () => {
  /*
    놓아둔 재료가 **지운 것이거나 기계가 쓴 것**이면 문이 그 값을 비워
    돌려준다. 그때 빈 줄이 화면에 남으면 보는 사람은 고장이라고 여긴다.
  */
  const payload = goodPayload();

  payload.outline[0].items = [
    { note: null, source_title: null, capture_content: null },
    { note: "남아야 한다", source_title: null, capture_content: null },
  ];

  const project = readPublicProject(payload);

  assert.equal(project.outline[0].items.length, 1);
  assert.equal(project.outline[0].items[0].note, "남아야 한다");
});

test("빈 글자는 없는 것으로 다룬다", () => {
  // 공백만 든 메모가 화면에 빈 줄로 남지 않게 한다.
  const payload = goodPayload();

  payload.sources[0].captures = [{ content: "   " }, { content: "메모" }];

  const project = readPublicProject(payload);

  assert.equal(project.sources[0].captures.length, 1);
});

// -----------------------------------------------------------------------------
// 없는 것을 없다고 말한다
// -----------------------------------------------------------------------------

test("무엇이 안 나가는지 적을 말이 있다", () => {
  /*
    16-B.3절이 "파일 자리에는 올린 사람만 볼 수 있습니다라고 적는다"고
    정했다. **없는 것을 없다고 말하지 않으면** 올린 사람은 파일이 함께
    나간 줄 알고, 보는 사람은 그런 것이 있었다는 것조차 모른다.
  */
  assert.ok(WITHHELD_NOTICE.length >= 2);

  const joined = WITHHELD_NOTICE.join(" ");

  assert.ok(joined.includes("원문"), "원문이 안 나간다는 말이 없다");
  assert.ok(joined.includes("초록"), "초록이 안 나간다는 말이 없다");
  assert.ok(joined.includes("파일"), "파일이 안 나간다는 말이 없다");
});
