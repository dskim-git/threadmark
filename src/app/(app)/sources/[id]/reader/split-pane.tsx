"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * 좌우로 나눈 칸. 가운데를 끌어 너비를 바꾼다. (설계 문서 9.1절)
 *
 * 너비를 우리가 정하지 않는 이유가 있다. 알맞은 너비는 화면 크기와 논문
 * 편집 형태에 따라 다르다. 2단 편집 논문은 넓어야 읽히고, 한글 학위논문은
 * 좁아도 된다. 읽는 사람이 그때그때 정하는 것이 맞다.
 *
 * 정한 너비는 이 브라우저에 기억해 둔다. 논문마다 다시 맞추게 하면
 * 끌어 쓰는 기능이 있으나 마나다.
 *
 * 좁은 화면에서는 나누지 않는다. 설계 문서 21절이 "데스크톱 split view를
 * 모바일에 억지로 축소하지 않는다"고 한다. 부르는 쪽이 탭으로 바꾼다.
 */

/** 이 브라우저에 기억해 두는 자리. */
const STORAGE_KEY = "threadmark.reader.split";

/**
 * 양쪽이 가질 수 있는 가장 좁은 너비.
 *
 * 끝까지 끌어도 한쪽이 사라지지 않게 한다. 사라지면 되돌릴 손잡이도
 * 함께 사라져서, 새로고침 말고는 방법이 없어진다.
 */
const MIN_LEFT = 360;
const MIN_RIGHT = 300;

/** 처음 열 때의 왼쪽 비율. PDF가 조금 더 넓다. */
const DEFAULT_RATIO = 0.62;

/**
 * 기억해 둔 너비를 읽는다.
 *
 * `useSyncExternalStore`로 읽는 이유가 있다. effect 안에서 읽어 상태를 바꾸면
 * 한 번 그린 뒤에 다시 그리게 되고, React 19의 규칙도 그 방식을 막는다.
 * localStorage는 React 밖에 있는 저장소이고, 이 훅이 그런 것을 읽으라고 있다.
 *
 * 서버에는 저장소가 없어 기본값을 준다. 화면이 붙은 뒤에 기억해 둔 값으로
 * 바뀌는데, 이 훅이 그 전환을 어긋남 없이 처리해 준다.
 */
function readSavedRatio(): number {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved === null ? Number.NaN : Number.parseFloat(saved);

    return Number.isFinite(parsed) && parsed > 0.1 && parsed < 0.9
      ? parsed
      : DEFAULT_RATIO;
  } catch {
    // 저장소를 못 쓰는 브라우저가 있다. 기본 너비로 간다.
    return DEFAULT_RATIO;
  }
}

function serverRatio(): number {
  return DEFAULT_RATIO;
}

/** 우리가 값을 바꿨을 때 알리는 신호. 같은 화면에 여럿 있어도 함께 따라온다. */
const CHANGED_EVENT = "threadmark:split-changed";

function subscribeToSaved(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  // 다른 탭에서 바꾼 것도 따라온다.
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function saveRatio(ratio: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ratio));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    // 기억해 두지 못해도 이번 동안은 그대로 쓴다.
  }
}

function clampRatio(ratio: number, width: number): number {
  if (width <= MIN_LEFT + MIN_RIGHT) {
    return ratio;
  }

  return Math.min(
    Math.max(ratio, MIN_LEFT / width),
    (width - MIN_RIGHT) / width,
  );
}

export function SplitPane({
  left,
  right,
  /** 좁은 화면에서 무엇을 보여줄지. 나누지 않고 하나만 보여준다. */
  narrowView,
  className,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  narrowView: "left" | "right";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const savedRatio = useSyncExternalStore(
    subscribeToSaved,
    readSavedRatio,
    serverRatio,
  );

  /*
    끄는 동안의 너비. 손을 떼면 기억해 두고, 그 뒤로는 기억해 둔 값을 쓴다.
    끌 때마다 저장소에 쓰면 손을 움직이는 내내 쓰게 된다.
  */
  const [liveRatio, setLiveRatio] = useState<number | null>(null);
  const ratio = liveRatio ?? savedRatio;

  const apply = useCallback((clientX: number) => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const box = container.getBoundingClientRect();

    if (box.width <= 0) {
      return;
    }

    setLiveRatio(clampRatio((clientX - box.left) / box.width, box.width));
  }, []);

  /*
    끄는 동안은 창 전체에서 움직임을 듣는다. 손잡이 위에서만 들으면
    빨리 끌었을 때 손잡이를 벗어나면서 끌기가 끊긴다.
  */
  useEffect(() => {
    if (!dragging) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      apply(event.clientX);
    };

    const onUp = () => {
      setDragging(false);
      saveRatio(ratio);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, apply, ratio]);

  /** 키보드로도 옮긴다. 마우스를 쓰지 않는 사람이 있다. */
  function onKeyDown(event: React.KeyboardEvent) {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const step = event.shiftKey ? 0.1 : 0.02;

    const width = container.getBoundingClientRect().width;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();

      const next = clampRatio(
        ratio + (event.key === "ArrowLeft" ? -step : step),
        width,
      );

      setLiveRatio(next);
      saveRatio(next);
    }
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-col lg:flex-row ${className ?? ""}`}
    >
      <div
        className={`min-w-0 ${narrowView === "left" ? "" : "hidden lg:block"}`}
        style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 1 }}
      >
        {left}
      </div>

      {/*
        손잡이. 좁은 화면에는 나오지 않는다. 나눌 것이 없기 때문이다.

        role과 값이 붙어 있어 화면 낭독기가 "이것을 좌우로 옮길 수 있다"를
        읽어준다. 끌기만 되면 마우스를 쓰지 않는 사람은 쓸 수 없다.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="PDF와 패널의 너비"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={10}
        aria-valuemax={90}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onKeyDown={onKeyDown}
        className={`hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center lg:flex ${
          dragging ? "bg-zinc-200 dark:bg-white/[.12]" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="h-10 w-1 rounded-full bg-zinc-300 dark:bg-white/[.2]"
        />
      </div>

      <div
        className={`flex min-w-0 flex-1 flex-col ${
          narrowView === "right" ? "" : "hidden lg:flex"
        }`}
      >
        {right}
      </div>

      {/*
        끄는 동안 글자가 선택되지 않게 한다. 없으면 PDF의 글자가 주욱
        끌려 선택되면서, 손을 떼는 순간 고른 문장 창이 뜬다.
      */}
      {dragging ? (
        <style>{`body { user-select: none; cursor: col-resize; }`}</style>
      ) : null}
    </div>
  );
}
