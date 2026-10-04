import { z } from "zod";

/**
 * 그림판에 그린 것의 모양. (설계 문서 16절 `그림판`, 16-3)
 *
 * > 편집 가능한 vector/stroke JSON과 미리보기 WebP 또는 PNG를 함께 저장한다.
 *
 * **이 파일은 `zod`만 쓴다.** 캔버스도 데이터베이스도 모른다. 그리는 일은
 * 화면이 하고, 담는 일은 Drive가 한다. 여기 있는 것은 **담기는 값의
 * 모양**뿐이다. (`image-locator.ts`와 같은 자리)
 *
 * 왜 두 파일로 담는가
 *   그림 하나가 Drive에 **파일 둘**로 간다.
 *
 *     `<이름>.png`           보이는 것. 목록·작업대·내려받기가 이것을 쓴다
 *     `<이름>.strokes.json`  고칠 수 있는 것. 다시 열어 이어 그릴 때 쓴다
 *
 *   PNG만 담으면 **다시 고칠 수 없다.** 점을 다 잃고 픽셀만 남는다.
 *   획만 담으면 **보여줄 것이 없다.** 그림을 목록에 띄우려면 그릴 수 있는
 *   무언가가 있어야 하고, 그러려면 열 때마다 캔버스를 돌려야 한다.
 *
 *   블루프린트가 "함께 저장한다"고 적은 까닭이 그것이다.
 *
 * 왜 Drive에 담는가
 *   2.3절이 "파일은 이용자의 Drive에 둔다"고 정했고, 그린 것은 **이용자의
 *   것**이다. 데이터베이스에 담으면 우리가 그 사람의 그림을 보관하게 된다.
 *
 *   그리고 `source_files`가 이미 파일마다 checksum과 상태를 따라간다.
 *   거기에 얹으면 "그림이 바뀌었다"를 **공짜로** 알 수 있다. 표를 새로
 *   만들면 그것을 또 만들어야 하고, 여섯 곳을 고쳐야 한다. (AGENTS.md 7절)
 *
 * 왜 상대값이 아니라 캔버스 좌표인가
 *   16-2의 영역 메모는 **남의 그림 위**를 가리키므로 상대값이어야 했다.
 *   그림이 여러 크기로 보이기 때문이다.
 *
 *   그림판은 다르다. **캔버스가 그림 자체다.** 크기를 우리가 정하고 그
 *   크기를 함께 담으므로, 어느 화면에서 열어도 `width`·`height`로 견주어
 *   같은 비율로 그릴 수 있다. 좌표를 0~1로 눌러 담으면 점마다 나눗셈이
 *   남고 소수점이 길어진다.
 */

/**
 * 담긴 값의 판. **고칠 때 올린다.**
 *
 * 판을 적어두지 않으면, 모양을 바꾼 뒤에 옛 파일을 열었을 때 **무엇이
 * 틀렸는지 알 수 없다.** 지금은 1이고 옛 판은 없다.
 */
export const DRAWING_SCENE_VERSION = 1;

/** 그림판의 논리 크기. 실제 화면 크기와 무관하다. */
export const DRAWING_CANVAS_WIDTH = 1600;
export const DRAWING_CANVAS_HEIGHT = 1200;

/**
 * 붓 갈래.
 *
 * `eraser`를 획으로 담는 까닭
 *   지우개를 "닿은 획을 지우는 것"으로 만들 수도 있다. 그러면 담기는 값이
 *   깔끔하지만 **무엇에 닿았는지 재는 일**이 필요하고, 그 계산이 틀리면
 *   엉뚱한 획이 사라진다.
 *
 *   여기서는 지우개도 **획 하나**다. 그릴 때 `destination-out`으로 그리면
 *   덮인 자리가 비워진다. 담기는 모양이 펜과 같아서 되돌리기도 그냥 된다.
 *
 *   잃는 것이 있다. 지운 뒤에 **그 아래 획만 되살릴 수는 없다.** 되돌리기로
 *   한 걸음 물리는 길뿐이다. 적어두고 넘어간다.
 */
export const DRAWING_TOOLS = ["pen", "highlighter", "eraser"] as const;

export type DrawingTool = (typeof DRAWING_TOOLS)[number];

/**
 * 획 하나에 담을 수 있는 점의 수.
 *
 * **손가락 하나로 한 번 긋는 동안에도 점이 수백 개 들어온다.** 한계를
 * 두지 않으면 길게 한 번 그은 것만으로 파일이 수 메가가 된다.
 *
 * 점을 솎아내는 일(`shouldRecordPoint`)이 먼저 걸러내므로, 이 한계에
 * 닿는 것은 **아주 긴 획 하나**뿐이다. 그때는 획을 끊는다.
 */
export const MAX_POINTS_PER_STROKE = 2000;

/**
 * 한 그림에 담을 수 있는 획의 수.
 *
 * 넘으면 더 그을 수 없다고 알린다. **조용히 버리지 않는다.** 그린 것이
 * 저장되지 않는 상태를 모르고 계속 그리는 것이 가장 나쁘다.
 */
export const MAX_STROKES_PER_SCENE = 5000;

/** 점 하나. 캔버스 좌표다. */
export const drawingPointSchema = z.object({
  x: z.number().min(0).max(DRAWING_CANVAS_WIDTH),
  y: z.number().min(0).max(DRAWING_CANVAS_HEIGHT),
});

export type DrawingPoint = z.infer<typeof drawingPointSchema>;

/** 획 하나. */
export const drawingStrokeSchema = z.object({
  tool: z.enum(DRAWING_TOOLS),

  /**
   * 색. `#rrggbb`만 받는다.
   *
   * **밖에서 온 글이 그대로 캔버스에 들어가는 자리다.** 그림 파일은
   * 이용자의 Drive에 있고 손으로 고칠 수 있다. 색 이름이나 `rgb()`까지
   * 받으면 무엇이 들어올지 알 수 없다.
   */
  color: z.string().regex(/^#[0-9a-f]{6}$/, "색 모양이 아닙니다."),

  /** 굵기. 캔버스 좌표 기준이다. */
  size: z.number().min(1).max(200),

  points: z
    .array(drawingPointSchema)
    .min(1, "점이 없는 획은 담지 않습니다.")
    .max(MAX_POINTS_PER_STROKE),
});

export type DrawingStroke = z.infer<typeof drawingStrokeSchema>;

/** 그림 하나. 이 모양 그대로 `.strokes.json`에 담긴다. */
export const drawingSceneSchema = z.object({
  version: z.literal(DRAWING_SCENE_VERSION),

  /**
   * 그릴 때의 캔버스 크기.
   *
   * **함께 담아야 한다.** 나중에 캔버스 크기를 바꾸면, 이 값이 없는 옛
   * 그림은 어느 크기로 그린 것인지 알 수 없어 **비율이 틀어진다.**
   */
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),

  strokes: z.array(drawingStrokeSchema).max(MAX_STROKES_PER_SCENE),
});

export type DrawingScene = z.infer<typeof drawingSceneSchema>;

/** 빈 그림. */
export function createEmptyScene(): DrawingScene {
  return {
    version: DRAWING_SCENE_VERSION,
    width: DRAWING_CANVAS_WIDTH,
    height: DRAWING_CANVAS_HEIGHT,
    strokes: [],
  };
}

/**
 * 담긴 값에서 그림을 읽는다. **모르는 모양은 `null`이다.**
 *
 * 이 파일은 이용자의 Drive에 있고 **손으로 고칠 수 있다.** 그래서 읽는
 * 쪽에서 모양을 다시 본다. 모양이 어긋나면 빈 그림으로 **둘러대지
 * 않는다.** 둘러대면 그리던 것을 잃은 채 새로 그리기 시작하게 되고,
 * 저장하면 옛 그림을 덮어쓴다.
 */
export function parseDrawingScene(value: unknown): DrawingScene | null {
  const parsed = drawingSceneSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/** 글자로 담긴 그림을 읽는다. JSON이 아니면 `null`이다. */
export function readSceneJson(text: string): DrawingScene | null {
  try {
    return parseDrawingScene(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * 그림을 글자로. Drive에 올릴 내용이다.
 *
 * **보기 좋게 들여쓰지 않는다.** 점이 수만 개라 들여쓰기만으로 파일이
 * 두 배가 된다. 사람이 읽을 파일이 아니다.
 */
export function writeSceneJson(scene: DrawingScene): string {
  return JSON.stringify(scene);
}

/**
 * 점을 하나 더 담을 만한가.
 *
 * **손가락이 움직이는 동안 점이 1초에 수백 개 들어온다.** 전부 담으면
 * 파일이 커지고, 다시 그릴 때도 느려진다. 그런데 그 점들은 대부분 **같은
 * 자리**다.
 *
 * 그래서 앞 점에서 얼마 이상 움직였을 때만 담는다. 선의 모양은 거의
 * 그대로이고 점은 열에 하나로 줄어든다.
 *
 * **처음 점은 늘 담는다.** 앞 점이 없으면 견줄 것이 없고, 그 점이 획의
 * 시작이다.
 */
export function shouldRecordPoint(
  previous: DrawingPoint | null,
  next: DrawingPoint,
  minDistance: number,
): boolean {
  if (previous === null) {
    return true;
  }

  const dx = next.x - previous.x;
  const dy = next.y - previous.y;

  return dx * dx + dy * dy >= minDistance * minDistance;
}

/** 캔버스 좌표 안으로 가둔다. 밖으로 끌어도 그림 안에 남는다. */
export function clampToCanvas(
  point: DrawingPoint,
  scene: { width: number; height: number },
): DrawingPoint {
  return {
    x: Math.min(scene.width, Math.max(0, point.x)),
    y: Math.min(scene.height, Math.max(0, point.y)),
  };
}

/**
 * 그림이 비었는가.
 *
 * **빈 그림을 저장하지 않으려고 본다.** 아무것도 안 그리고 저장을 누르면
 * 빈 파일 둘이 Drive에 올라간다. 지우는 길은 있지만, 만들지 않는 편이
 * 낫다.
 */
export function isSceneEmpty(scene: DrawingScene): boolean {
  return scene.strokes.length === 0;
}

// -----------------------------------------------------------------------------
// 파일 이름
// -----------------------------------------------------------------------------

/**
 * 획을 담는 파일의 꼬리.
 *
 * `.json`만으로 두지 않는 까닭은, 파일 목록에서 **무슨 json인지** 알려야
 * 하기 때문이다. 이용자의 Drive에 있는 파일이고 그쪽에서도 보인다.
 */
export const STROKE_FILE_SUFFIX = ".strokes.json";

/** 획을 담는 파일의 종류. Drive 업로드가 받는 목록에 있어야 한다. */
export const STROKE_FILE_MIME = "application/json";

/** 보이는 그림의 종류. */
export const DRAWING_IMAGE_MIME = "image/png";

/**
 * 그림 이름에서 파일 이름 둘을 만든다.
 *
 * **둘이 같은 뿌리를 쓴다.** 짝을 찾는 일이 이름으로 되어야 해서다.
 * 번호로 묶으려면 표가 하나 더 필요하고, 이름으로 묶으면 Drive에서
 * 들여다볼 때도 짝이 보인다.
 */
export function drawingFileNames(baseName: string): {
  image: string;
  strokes: string;
} {
  return {
    image: `${baseName}.png`,
    strokes: `${baseName}${STROKE_FILE_SUFFIX}`,
  };
}

/** 획을 담는 파일인가. 이름으로 가린다. */
export function isStrokeFileName(fileName: string): boolean {
  return fileName.endsWith(STROKE_FILE_SUFFIX);
}

/**
 * 보이는 그림 파일 이름에서 짝이 되는 획 파일 이름을.
 *
 * `.png`가 아니면 `null`이다. **짐작하지 않는다.** 엉뚱한 이름을 만들어
 * 찾으면 "고칠 수 있는 그림이 없다"와 "이름을 잘못 만들었다"를 가릴 수
 * 없게 된다.
 */
export function strokeFileNameFor(imageFileName: string): string | null {
  if (!imageFileName.endsWith(".png")) {
    return null;
  }

  return `${imageFileName.slice(0, -".png".length)}${STROKE_FILE_SUFFIX}`;
}
