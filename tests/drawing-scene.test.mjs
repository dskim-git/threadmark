/**
 * 그림판에 그린 것의 모양 단위 검사. (설계 문서 16절 `그림판`, 16-3)
 *
 * **이 파일이 이용자의 Drive에 있고 손으로 고칠 수 있다.** 그래서 읽는
 * 쪽에서 모양을 다시 본다. 어긋난 값으로 캔버스를 그리면 무엇이 틀렸는지
 * 알 길이 없다.
 *
 * 특히 **빈 그림으로 둘러대지 않는 것**을 여기서 지킨다. 둘러대면 그리던
 * 것을 잃은 채 새로 시작하게 되고, 저장하면 옛 그림을 덮어쓴다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DRAWING_CANVAS_HEIGHT,
  DRAWING_CANVAS_WIDTH,
  DRAWING_SCENE_VERSION,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_SCENE,
  STROKE_FILE_SUFFIX,
  clampToCanvas,
  createEmptyScene,
  drawingFileNames,
  isSceneEmpty,
  isStrokeFileName,
  parseDrawingScene,
  readSceneJson,
  shouldRecordPoint,
  strokeFileNameFor,
  writeSceneJson,
} from "../src/lib/drawing/scene.ts";

/** 쓸 만한 획 하나. */
function stroke(extra = {}) {
  return {
    tool: "pen",
    color: "#1f2937",
    size: 4,
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 24 },
    ],
    ...extra,
  };
}

/** 쓸 만한 그림 하나. */
function scene(extra = {}) {
  return { ...createEmptyScene(), strokes: [stroke()], ...extra };
}

// -----------------------------------------------------------------------------
// 빈 그림
// -----------------------------------------------------------------------------

test("빈 그림에는 판과 크기가 들어 있다", () => {
  /*
    **크기를 함께 담아야 한다.** 나중에 캔버스 크기를 바꾸면, 이 값이 없는
    옛 그림은 어느 크기로 그린 것인지 알 수 없어 비율이 틀어진다.
  */
  const empty = createEmptyScene();

  assert.equal(empty.version, DRAWING_SCENE_VERSION);
  assert.equal(empty.width, DRAWING_CANVAS_WIDTH);
  assert.equal(empty.height, DRAWING_CANVAS_HEIGHT);
  assert.deepEqual(empty.strokes, []);
  assert.equal(isSceneEmpty(empty), true);
});

test("획이 하나라도 있으면 빈 그림이 아니다", () => {
  // 빈 그림을 저장하지 않으려고 본다. 빈 파일 둘을 Drive에 올리지 않는다.
  assert.equal(isSceneEmpty(scene()), false);
});

// -----------------------------------------------------------------------------
// 담긴 값 읽기
// -----------------------------------------------------------------------------

test("그림을 읽고 그대로 되돌린다", () => {
  const text = writeSceneJson(scene());
  const read = readSceneJson(text);

  assert.ok(read);
  assert.equal(read.strokes.length, 1);
  assert.equal(read.strokes[0].points.length, 2);
  assert.equal(read.strokes[0].color, "#1f2937");
});

test("보기 좋게 들여쓰지 않는다", () => {
  /*
    점이 수만 개라 들여쓰기만으로 파일이 두 배가 된다. 사람이 읽을 파일이
    아니다.
  */
  const text = writeSceneJson(scene());

  assert.ok(!text.includes("\n"), "줄바꿈이 들어 있다");
});

test("JSON이 아니면 null이다", () => {
  /*
    **빈 그림으로 둘러대지 않는다.** 둘러대면 그리던 것을 잃은 채 새로
    시작하게 되고, 저장하면 옛 그림을 덮어쓴다.
  */
  assert.equal(readSceneJson("그림 아님"), null);
  assert.equal(readSceneJson(""), null);
  assert.equal(readSceneJson("{"), null);
});

test("판이 다르면 읽지 않는다", () => {
  // 모양을 바꾼 뒤 옛 파일을 열었을 때 무엇이 틀렸는지 알려면 판이 필요하다.
  assert.equal(parseDrawingScene(scene({ version: 2 })), null);
  assert.equal(parseDrawingScene(scene({ version: undefined })), null);
});

test("모르는 붓은 읽지 않는다", () => {
  // 화면이 그릴 방법을 모르는 붓이 들어오면 그 획이 조용히 사라진다.
  assert.equal(parseDrawingScene(scene({ strokes: [stroke({ tool: "spray" })] })), null);
});

test("색 모양이 아니면 읽지 않는다", () => {
  /*
    **밖에서 온 글이 그대로 캔버스에 들어가는 자리다.** 색 이름이나
    `rgb()`까지 받으면 무엇이 들어올지 알 수 없다.
  */
  for (const color of ["red", "rgb(1,2,3)", "#fff", "#GGGGGG", ""]) {
    assert.equal(
      parseDrawingScene(scene({ strokes: [stroke({ color })] })),
      null,
      `${color}를 받았다`,
    );
  }

  assert.ok(parseDrawingScene(scene({ strokes: [stroke({ color: "#00ff88" })] })));
});

test("대문자 색은 받지 않는다", () => {
  /*
    소문자로만 받는다. 둘을 다 받으면 같은 색이 두 글자로 담기고, 나중에
    색을 견주는 자리에서 어긋난다.
  */
  assert.equal(
    parseDrawingScene(scene({ strokes: [stroke({ color: "#1F2937" })] })),
    null,
  );
});

test("캔버스 밖의 점은 읽지 않는다", () => {
  const outside = [{ x: DRAWING_CANVAS_WIDTH + 1, y: 10 }];

  assert.equal(
    parseDrawingScene(scene({ strokes: [stroke({ points: outside })] })),
    null,
  );
  assert.equal(
    parseDrawingScene(scene({ strokes: [stroke({ points: [{ x: -1, y: 0 }] })] })),
    null,
  );
});

test("점이 없는 획은 담지 않는다", () => {
  // 그릴 것이 없는 획이다. 되돌리기 한 걸음만 잡아먹는다.
  assert.equal(
    parseDrawingScene(scene({ strokes: [stroke({ points: [] })] })),
    null,
  );
});

test("점과 획에 한계가 있다", () => {
  /*
    **한계를 두지 않으면 길게 한 번 그은 것만으로 파일이 수 메가가 된다.**
    점을 솎아내는 일이 먼저 걸러내므로 여기 닿는 것은 아주 긴 획뿐이다.
  */
  const many = Array.from({ length: MAX_POINTS_PER_STROKE + 1 }, (_, i) => ({
    x: i % DRAWING_CANVAS_WIDTH,
    y: 1,
  }));

  assert.equal(
    parseDrawingScene(scene({ strokes: [stroke({ points: many })] })),
    null,
  );

  const tooManyStrokes = Array.from(
    { length: MAX_STROKES_PER_SCENE + 1 },
    () => stroke(),
  );

  assert.equal(parseDrawingScene(scene({ strokes: tooManyStrokes })), null);
});

test("지우개도 획으로 담긴다", () => {
  /*
    지우개를 "닿은 획을 지우는 것"으로 만들면 무엇에 닿았는지 재는 일이
    필요하고, 그 계산이 틀리면 엉뚱한 획이 사라진다. 획으로 담으면 모양이
    펜과 같아서 되돌리기도 그냥 된다.
  */
  const read = parseDrawingScene(scene({ strokes: [stroke({ tool: "eraser" })] }));

  assert.ok(read);
  assert.equal(read.strokes[0].tool, "eraser");
});

// -----------------------------------------------------------------------------
// 점 솎아내기
// -----------------------------------------------------------------------------

test("처음 점은 늘 담는다", () => {
  // 앞 점이 없으면 견줄 것이 없고, 그 점이 획의 시작이다.
  assert.equal(shouldRecordPoint(null, { x: 0, y: 0 }, 3), true);
});

test("거의 움직이지 않은 점은 버린다", () => {
  /*
    **손가락이 움직이는 동안 점이 1초에 수백 개 들어온다.** 그 점들은
    대부분 같은 자리다. 전부 담으면 파일이 커지고 다시 그릴 때도 느려진다.
  */
  const previous = { x: 100, y: 100 };

  assert.equal(shouldRecordPoint(previous, { x: 101, y: 100 }, 3), false);
  assert.equal(shouldRecordPoint(previous, { x: 100, y: 102 }, 3), false);
});

test("충분히 움직였으면 담는다", () => {
  const previous = { x: 100, y: 100 };

  assert.equal(shouldRecordPoint(previous, { x: 104, y: 100 }, 3), true);
  assert.equal(shouldRecordPoint(previous, { x: 100, y: 97 }, 3), true);
});

test("가로세로로 움직인 거리를 함께 본다", () => {
  /*
    한 축으로만 재면 **비스듬히 움직인 점을 버린다.** 가로로 2, 세로로
    2만큼 움직인 것은 실제로 2.8만큼 움직인 것이다.
  */
  const previous = { x: 0, y: 0 };

  assert.equal(shouldRecordPoint(previous, { x: 2, y: 2 }, 2.5), true);
});

test("캔버스 밖으로 끌면 안으로 가둔다", () => {
  /*
    밖으로 끌어도 그림 안에 남는다. 가두지 않으면 담길 때 모양 검사에
    걸려 **그 획이 통째로 사라진다.**
  */
  const bounds = { width: 100, height: 50 };

  assert.deepEqual(clampToCanvas({ x: -5, y: 70 }, bounds), { x: 0, y: 50 });
  assert.deepEqual(clampToCanvas({ x: 150, y: -1 }, bounds), { x: 100, y: 0 });
  assert.deepEqual(clampToCanvas({ x: 40, y: 20 }, bounds), { x: 40, y: 20 });
});

// -----------------------------------------------------------------------------
// 파일 이름
// -----------------------------------------------------------------------------

test("한 그림이 파일 둘이 되고 뿌리를 같이 쓴다", () => {
  /*
    **짝을 찾는 일이 이름으로 되어야 한다.** 번호로 묶으려면 표가 하나 더
    필요하고, 이름으로 묶으면 Drive에서 들여다볼 때도 짝이 보인다.
  */
  const names = drawingFileNames("수업 흐름도");

  assert.equal(names.image, "수업 흐름도.png");
  assert.equal(names.strokes, `수업 흐름도${STROKE_FILE_SUFFIX}`);
});

test("획 파일인지 이름으로 가린다", () => {
  assert.equal(isStrokeFileName("수업 흐름도.strokes.json"), true);
  assert.equal(isStrokeFileName("수업 흐름도.png"), false);
  // `.json`만으로 두지 않은 까닭이 이것이다. 무슨 json인지 알려야 한다.
  assert.equal(isStrokeFileName("내려받기.json"), false);
});

test("보이는 그림에서 짝이 되는 획 파일 이름을 만든다", () => {
  assert.equal(
    strokeFileNameFor("수업 흐름도.png"),
    `수업 흐름도${STROKE_FILE_SUFFIX}`,
  );
});

test("png가 아니면 짝 이름을 지어내지 않는다", () => {
  /*
    **짐작하지 않는다.** 엉뚱한 이름을 만들어 찾으면 "고칠 수 있는 그림이
    없다"와 "이름을 잘못 만들었다"를 가릴 수 없게 된다.
  */
  assert.equal(strokeFileNameFor("스캔본.pdf"), null);
  assert.equal(strokeFileNameFor("사진.jpeg"), null);
  assert.equal(strokeFileNameFor("이름없음"), null);
});
