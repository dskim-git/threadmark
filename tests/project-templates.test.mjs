/**
 * 프로젝트 시작 서식 단위 테스트. (19-A)
 *
 * 서식은 그냥 목록이지만, 펼치는 셈(`flattenOutline`)이 틀리면 **뼈대가
 * 엉뚱한 모양으로 담긴다.** 부모보다 자식이 먼저 담기면 자식의 위 자리가
 * 비어 맨 윗칸으로 올라가고, 사용자는 서식을 골랐는데 평평한 목록을 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  FREEFORM_TEMPLATE_ID,
  PROJECT_TEMPLATES,
  findProjectTemplate,
  flattenOutline,
} from "../src/lib/projects/templates.ts";

// -----------------------------------------------------------------------------
// 목록의 모양
// -----------------------------------------------------------------------------

test("서식마다 열쇠·이름·한 줄 설명이 있다", () => {
  assert.ok(PROJECT_TEMPLATES.length > 0);

  for (const template of PROJECT_TEMPLATES) {
    assert.ok(template.id.length > 0, "열쇠가 없는 서식이 있다");
    assert.ok(template.name.length > 0, `${template.id}: 이름이 없다`);
    assert.ok(template.summary.length > 0, `${template.id}: 설명이 없다`);
  }
});

test("서식 열쇠가 겹치지 않는다", () => {
  const ids = PROJECT_TEMPLATES.map((template) => template.id);

  assert.equal(new Set(ids).size, ids.length, "서식 열쇠가 겹친다");
});

test("자유 형식은 자리를 만들지 않는다", () => {
  const freeform = findProjectTemplate(FREEFORM_TEMPLATE_ID);

  assert.notEqual(freeform, null);
  assert.deepEqual([...freeform.outline], []);
});

test("자유 형식 말고는 모두 자리를 만들어 준다", () => {
  // 빈 서식이 여럿이면 고르는 쪽에서 무엇이 다른지 알 수 없다.
  for (const template of PROJECT_TEMPLATES) {
    if (template.id === FREEFORM_TEMPLATE_ID) {
      continue;
    }

    assert.ok(
      template.outline.length > 0,
      `${template.id}: 자리를 하나도 만들지 않는다`,
    );
  }
});

test("자리 이름에 번호를 담지 않는다", () => {
  /*
    번호는 화면이 순서를 보고 센다. 이름에 `Ⅰ.`이나 `1.`을 적어두면 자리를
    옮겼을 때 화면의 번호와 이름의 번호가 어긋난다. (설계 문서 7.3절)

    `1차시`와 `1장`은 번호가 아니라 이름이다. 점이 붙은 것만 본다.
  */
  const walk = (nodes, templateId) => {
    for (const node of nodes) {
      assert.ok(
        !/^[0-9IVXⅠⅡⅢⅣⅤ]+\s*[.)]/u.test(node.title),
        `${templateId}: 자리 이름에 번호가 들어 있다 — ${node.title}`,
      );

      if (node.children) {
        walk(node.children, templateId);
      }
    }
  };

  for (const template of PROJECT_TEMPLATES) {
    walk(template.outline, template.id);
  }
});

test("자리 이름이 비어 있지 않고 너무 길지 않다", () => {
  // 데이터베이스가 1~300자로 막는다. 여기서 걸리면 서식이 통째로 담기지 않는다.
  const walk = (nodes, templateId) => {
    for (const node of nodes) {
      assert.ok(node.title.trim().length > 0, `${templateId}: 빈 이름이 있다`);
      assert.ok(node.title.length <= 300, `${templateId}: 이름이 너무 길다`);

      if (node.children) {
        walk(node.children, templateId);
      }
    }
  };

  for (const template of PROJECT_TEMPLATES) {
    walk(template.outline, template.id);
  }
});

test("모르는 열쇠로는 서식을 찾지 못한다", () => {
  for (const value of ["", "없는서식", null, undefined, 1, {}]) {
    assert.equal(findProjectTemplate(value), null);
  }
});

// -----------------------------------------------------------------------------
// 펼치기
// -----------------------------------------------------------------------------

const SAMPLE = [
  { title: "가", children: [{ title: "가-1" }, { title: "가-2" }] },
  { title: "나" },
];

test("부모가 언제나 자식보다 앞에 온다", () => {
  /*
    담을 때 부모의 id를 먼저 받아야 자식의 위 자리를 채울 수 있다.
    순서가 어긋나면 자식이 맨 윗칸으로 올라가 뼈대가 평평해진다.
  */
  for (const template of PROJECT_TEMPLATES) {
    const flat = flattenOutline(template.outline);
    const seen = new Set();

    for (const seed of flat) {
      if (seed.parentKey !== null) {
        assert.ok(
          seen.has(seed.parentKey),
          `${template.id}: 부모보다 자식이 먼저 나온다 — ${seed.title}`,
        );
      }

      seen.add(seed.key);
    }
  }
});

test("형제마다 순서를 0부터 센다", () => {
  const flat = flattenOutline(SAMPLE);

  assert.deepEqual(
    flat.map((seed) => [seed.title, seed.parentKey, seed.position, seed.depth]),
    [
      ["가", null, 0, 0],
      ["가-1", "0", 0, 1],
      ["가-2", "0", 1, 1],
      ["나", null, 1, 0],
    ],
  );
});

test("열쇠가 겹치지 않는다", () => {
  // 겹치면 자식이 엉뚱한 부모 밑으로 들어간다.
  for (const template of PROJECT_TEMPLATES) {
    const keys = flattenOutline(template.outline).map((seed) => seed.key);

    assert.equal(new Set(keys).size, keys.length, template.id);
  }
});

test("깊이를 몇 단이든 펼친다", () => {
  // 서식은 두세 단이지만 셈 자체에 한계를 두지 않는다. (설계 문서 7.3절)
  const deep = [
    {
      title: "1단",
      children: [
        { title: "2단", children: [{ title: "3단", children: [{ title: "4단" }] }] },
      ],
    },
  ];

  const flat = flattenOutline(deep);

  assert.deepEqual(
    flat.map((seed) => seed.depth),
    [0, 1, 2, 3],
  );
  assert.equal(flat.at(-1).parentKey, "0.0.0");
});

test("빈 서식을 펼치면 빈 목록이다", () => {
  assert.deepEqual([...flattenOutline([])], []);
});
