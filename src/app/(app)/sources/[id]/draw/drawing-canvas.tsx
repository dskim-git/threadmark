"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DRAWING_TOOLS,
  type DrawingPoint,
  type DrawingScene,
  type DrawingStroke,
  type DrawingTool,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_SCENE,
  clampToCanvas,
  shouldRecordPoint,
} from "@/lib/drawing/scene";

/**
 * 그림판. (설계 문서 16절 `그림판`, 16-3)
 *
 * **그리는 일만 한다.** 담는 일은 부르는 쪽이 한다. 그래서 이 칸은
 * `scene`을 받아 그리고, 바뀔 때마다 `onSceneChange`로 넘긴다.
 *
 * 왜 캔버스 둘인가
 *   **다 그린 것**과 **지금 긋는 중인 것**을 따로 그린다.
 *
 *   하나로 하면 손가락이 움직일 때마다 **획 전부를 다시 그린다.** 획이
 *   수백 개가 되면 그때부터 선이 손가락을 못 따라온다. 그리는 사람은
 *   "앱이 느리다"가 아니라 **"내가 그린 선이 끊긴다"**로 느낀다.
 *
 *   둘로 나누면 긋는 동안에는 위쪽 캔버스만 지우고 다시 그린다. 획 하나다.
 *   놓으면 아래쪽에 한 번 얹고 위쪽을 비운다.
 *
 * 왜 `pointer` 사건인가
 *   마우스·손가락·스타일러스를 한 가지로 받는다. 블루프린트가 "스타일러스
 *   입력을 고려한다"고 적은 자리이고, `pointer`를 쓰면 그것이 따로 할 일이
 *   아니다. 펜의 **굵기 압력**은 아직 쓰지 않는다. (아래 `아직 안 한 것`)
 *
 * 왜 되돌리기가 획 단위인가
 *   점 단위로 되돌리면 한 번 그은 선이 수십 번 물러난다. 사람이 "한 번
 *   그었다"고 여기는 단위가 획이다.
 *
 * 아직 안 한 것 (블루프린트 16절이 적어둔 것 가운데)
 *   - **도형과 텍스트.** 획과 담기는 모양이 달라 `scene`에 갈래를 더해야
 *     한다. 펜으로 쓸 수 있는 동안은 미룬다.
 *   - **멀티터치 확대·축소.** 지금은 캔버스가 칸에 맞춰 한 번에 보인다.
 *     확대를 넣으면 **좌표를 옮기는 자리가 늘고**, 그 자리가 틀리면 선이
 *     손가락과 어긋난다. 16-2의 영역 고르기에서 같은 함정을 보았다.
 *   - **자료 위 필기.** PDF나 그림 위에 겹쳐 그리는 길이다. 그리는 일은
 *     같고 **무엇에 붙는지가 다르다.** 획을 어느 쪽 좌표로 담을지부터
 *     정해야 한다.
 *   - **IndexedDB 자동 저장.** 지금은 저장을 눌러야 담긴다. 창을 닫으면
 *     경고를 띄워 **잃는 것을 알린다.** 자동 저장은 "어디까지가 저장된
 *     것인가"를 또 다루게 되는 일이라 따로 한다.
 *
 *   적어두는 까닭은, 없는 것을 없다고 말해야 다음에 읽는 사람이 **빠뜨린
 *   것인지 미룬 것인지** 알 수 있기 때문이다.
 */

/** 붓 이름. 화면에 보일 말이다. */
const TOOL_LABELS: Record<DrawingTool, string> = {
  pen: "펜",
  highlighter: "형광펜",
  eraser: "지우개",
};

/** 붓마다의 기본 굵기. 캔버스 좌표 기준이다. */
const TOOL_SIZES: Record<DrawingTool, readonly number[]> = {
  pen: [2, 4, 8, 16],
  highlighter: [16, 28, 44],
  eraser: [12, 28, 60],
};

/**
 * 고를 수 있는 색.
 *
 * **색을 고르는 칸을 두지 않는다.** 무단계로 고르게 하면 `#rrggbb`를
 * 그대로 받아야 하고, 이 색은 담겨서 다시 그려지는 값이다. 정해진 몇 개가
 * 쓰기도 빠르고 담기는 값도 분명하다.
 *
 * 소문자로 적는다. 담기는 모양이 소문자만 받는다.
 */
const COLORS = [
  "#1f2937",
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
] as const;

/**
 * 형광펜의 진하기.
 *
 * 1이면 아래 글씨가 덮인다. 형광펜은 **덮는 것이 아니라 비추는 것**이다.
 */
const HIGHLIGHTER_ALPHA = 0.3;

/** 점을 솎아낼 때의 최소 거리. 캔버스 좌표 기준이다. */
const MIN_POINT_DISTANCE = 2.5;

/** 획 하나를 캔버스에 그린다. 두 캔버스가 같은 함수를 쓴다. */
function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawingStroke,
): void {
  if (stroke.points.length === 0) {
    return;
  }

  context.save();

  /*
    지우개는 **덮인 자리를 비운다.** 흰색으로 덮지 않는 까닭은, 흰색으로
    덮으면 배경이 흰색일 때만 맞고 내려받은 PNG가 투명하지 않게 된다.
  */
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";

  context.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.size;

  // 둥근 끝과 이음. 각지면 획이 끊겨 보인다.
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();

  const [first, ...rest] = stroke.points;

  context.moveTo(first.x, first.y);

  if (rest.length === 0) {
    /*
      **점 하나만 찍은 획이다.** `lineTo` 없이 `stroke()`하면 아무것도
      그려지지 않는다. 같은 자리로 선을 그어 점을 만든다.
    */
    context.lineTo(first.x, first.y);
  } else {
    for (const point of rest) {
      context.lineTo(point.x, point.y);
    }
  }

  context.stroke();
  context.restore();
}

export function DrawingCanvas({
  scene,
  onSceneChange,
  disabled = false,
}: {
  scene: DrawingScene;
  onSceneChange: (next: DrawingScene) => void;
  /** 저장하는 동안 잠근다. 그리는 중에 담기면 담긴 것과 보이는 것이 어긋난다. */
  disabled?: boolean;
}) {
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [size, setSize] = useState<number>(TOOL_SIZES.pen[1]);

  /** 긋는 중인 획. 놓으면 `scene`으로 넘어간다. */
  const drawing = useRef<DrawingStroke | null>(null);

  /**
   * 되돌린 획을 쌓아 둔다. **다시 하기**가 이것을 쓴다.
   *
   * 새로 그으면 비운다. 되돌린 뒤에 다른 것을 그렸으면 그 뒤로 다시 할
   * 것이 없다. 남겨 두면 **엉뚱한 획이 되살아난다.**
   */
  const [undone, setUndone] = useState<DrawingStroke[]>([]);

  const [notice, setNotice] = useState<string | null>(null);

  /** 다 그린 것을 아래 캔버스에 통째로 다시 그린다. */
  const repaintBase = useCallback(() => {
    const canvas = baseRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of scene.strokes) {
      paintStroke(context, stroke);
    }
  }, [scene]);

  useEffect(() => {
    repaintBase();
  }, [repaintBase]);

  /** 화면 좌표를 캔버스 좌표로. */
  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const box = event.currentTarget.getBoundingClientRect();

    /*
      **보이는 크기와 캔버스 크기가 다르다.** 캔버스는 1600×1200이고
      화면에서는 칸 너비에 맞춰 줄어 있다. 그 비율로 옮기지 않으면 선이
      손가락과 어긋난다.
    */
    return clampToCanvas(
      {
        x: ((event.clientX - box.left) / box.width) * scene.width,
        y: ((event.clientY - box.top) / box.height) * scene.height,
      },
      scene,
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }

    if (scene.strokes.length >= MAX_STROKES_PER_SCENE) {
      /*
        **조용히 버리지 않는다.** 그린 것이 저장되지 않는 상태를 모르고
        계속 그리는 것이 가장 나쁘다.
      */
      setNotice("한 그림에 담을 수 있는 획을 다 썼습니다. 저장하고 새로 시작해 주세요.");

      return;
    }

    setNotice(null);
    event.currentTarget.setPointerCapture(event.pointerId);

    drawing.current = {
      tool,
      // 지우개의 색은 쓰이지 않는다. 담기는 모양이 요구하므로 채워 둔다.
      color: tool === "eraser" ? COLORS[0] : color,
      size,
      points: [pointAt(event)],
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawing.current;

    if (!stroke) {
      return;
    }

    const next = pointAt(event);
    const last = stroke.points[stroke.points.length - 1] ?? null;

    if (!shouldRecordPoint(last, next, MIN_POINT_DISTANCE)) {
      return;
    }

    /*
      **아주 긴 획 하나는 끊는다.** 점을 솎아내도 한계에 닿을 수 있다.
      더 담지 않고 그 자리에서 획을 마무리한 뒤 이어 그린다. 끊긴 자리가
      보이지 않게 **마지막 점에서 다시 시작한다.**
    */
    if (stroke.points.length >= MAX_POINTS_PER_STROKE) {
      drawing.current = { ...stroke, points: [last ?? next, next] };
      onSceneChange({ ...scene, strokes: [...scene.strokes, stroke] });

      return;
    }

    stroke.points.push(next);

    const canvas = liveRef.current;
    const context = canvas?.getContext("2d");

    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      paintStroke(context, stroke);
    }
  };

  const handlePointerUp = () => {
    const stroke = drawing.current;

    drawing.current = null;

    const canvas = liveRef.current;
    const context = canvas?.getContext("2d");

    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!stroke) {
      return;
    }

    /*
      **새로 그으면 다시 할 것을 비운다.** 되돌린 뒤에 다른 것을 그렸으면
      그 뒤로 다시 할 것이 없다. 남겨 두면 엉뚱한 획이 되살아난다.
    */
    setUndone([]);
    onSceneChange({ ...scene, strokes: [...scene.strokes, stroke] });
  };

  const undo = () => {
    const last = scene.strokes[scene.strokes.length - 1];

    if (!last) {
      return;
    }

    setUndone((stack) => [...stack, last]);
    onSceneChange({ ...scene, strokes: scene.strokes.slice(0, -1) });
  };

  const redo = () => {
    const last = undone[undone.length - 1];

    if (!last) {
      return;
    }

    setUndone((stack) => stack.slice(0, -1));
    onSceneChange({ ...scene, strokes: [...scene.strokes, last] });
  };

  /*
    키로 되돌린다. 그림판에서 가장 많이 누르는 자리다.

    **글을 적는 중에는 받지 않는다.** 그림 이름을 적다가 되돌리기가 걸리면
    적던 글자가 아니라 획이 사라진다. 16-1에서 방향키로 장이 넘어가던 것과
    같은 자리다.
  */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      if (event.key === "z" || event.key === "Z") {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const sizes = TOOL_SIZES[tool];

  return (
    <div className="flex flex-col gap-3">
      {/* 붓 고르는 줄. */}
      <div className="flex flex-wrap items-center gap-2">
        {DRAWING_TOOLS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTool(value);
              // 붓이 바뀌면 굵기도 그 붓의 가운데 값으로. 펜 굵기로 지우지 않는다.
              setSize(TOOL_SIZES[value][Math.floor(TOOL_SIZES[value].length / 2)]);
            }}
            aria-pressed={tool === value}
            className={`h-9 rounded-full border px-4 text-xs font-medium transition-colors ${
              tool === value
                ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            }`}
          >
            {TOOL_LABELS[value]}
          </button>
        ))}

        <span className="mx-1 h-6 w-px bg-black/[.08] dark:bg-white/[.145]" />

        {/* 굵기. 붓마다 고를 수 있는 값이 다르다. */}
        {sizes.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSize(value)}
            aria-pressed={size === value}
            aria-label={`굵기 ${value}`}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
              size === value
                ? "border-accent dark:border-accent-dark"
                : "border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
            }`}
          >
            <span
              aria-hidden
              className="rounded-full bg-current text-black dark:text-zinc-50"
              style={{
                /* 보이는 크기는 캔버스 굵기를 줄여 그린다. 1600px 기준이다. */
                width: `${Math.max(3, Math.min(20, value / 2))}px`,
                height: `${Math.max(3, Math.min(20, value / 2))}px`,
              }}
            />
          </button>
        ))}

        <span className="mx-1 h-6 w-px bg-black/[.08] dark:bg-white/[.145]" />

        {/*
          색. **지우개일 때는 그리지 않는다.** 지우개에 색을 고르게 하면
          무엇이 달라지는지 알 수 없다. 아무 일도 하지 않는 단추다.
        */}
        {tool === "eraser" ? (
          <span className="text-xs text-zinc-500">지우개는 색이 없습니다.</span>
        ) : (
          COLORS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setColor(value)}
              aria-pressed={color === value}
              aria-label={`색 ${value}`}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${
                color === value
                  ? "scale-110 border-black dark:border-zinc-50"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: value }}
            />
          ))
        )}

        <span className="mx-1 h-6 w-px bg-black/[.08] dark:bg-white/[.145]" />

        <button
          type="button"
          onClick={undo}
          disabled={scene.strokes.length === 0}
          className="h-9 rounded-full border border-black/[.08] px-4 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-30 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          되돌리기
        </button>

        <button
          type="button"
          onClick={redo}
          disabled={undone.length === 0}
          className="h-9 rounded-full border border-black/[.08] px-4 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-30 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          다시 하기
        </button>
      </div>

      {notice ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {notice}
        </p>
      ) : null}

      {/*
        캔버스 둘을 겹친다. 아래가 다 그린 것, 위가 긋는 중인 것이다.

        **흰 바탕을 깔아 둔다.** 캔버스 자체는 투명하고, 투명한 데 검은
        선을 그으면 어두운 화면에서 보이지 않는다. 내려받는 PNG도 같다.
      */}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-black/[.08] bg-white dark:border-white/[.145]"
        style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
      >
        <canvas
          ref={baseRef}
          width={scene.width}
          height={scene.height}
          className="absolute inset-0 h-full w-full"
        />

        <canvas
          ref={liveRef}
          width={scene.width}
          height={scene.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          /*
            **손가락으로 그릴 때 화면이 스크롤되지 않게 한다.** 막지 않으면
            세로로 그으려는 손짓이 화면 스크롤로 먹히고, 선이 그려지지 않는다.
          */
          className={`absolute inset-0 h-full w-full touch-none ${
            disabled ? "cursor-progress" : "cursor-crosshair"
          }`}
        />
      </div>
    </div>
  );
}

/**
 * 지금 그려진 것을 PNG로.
 *
 * **흰 바탕을 함께 그린다.** 캔버스는 투명한데, 투명한 PNG를 목록에
 * 띄우면 어두운 화면에서 검은 선이 보이지 않는다.
 *
 * 부르는 쪽이 캔버스를 들고 있지 않아서 `scene`으로 다시 그린다. 보이는
 * 캔버스를 그대로 쓰면 **화면에 보이는 크기로 저장된다.**
 */
export async function renderSceneToPng(
  scene: DrawingScene,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");

  canvas.width = scene.width;
  canvas.height = scene.height;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, scene.width, scene.height);

  for (const stroke of scene.strokes) {
    paintStroke(context, stroke);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
