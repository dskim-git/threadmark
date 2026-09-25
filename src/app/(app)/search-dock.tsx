"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { searchFromDock } from "./dock-actions";
import { DOCK_LIMIT, EMPTY_DOCK_STATE, type DockState } from "./dock-state";

/**
 * 어디서든 띄워두고 쓰는 찾기 창. (사용자 요청, 2026-09-25)
 *
 * 왜 필요한가
 *   사용자가 말한 자리는 **프로젝트 뼈대에 재료를 놓는 곳**이었다. 무엇을
 *   놓을지 정하려면 담아둔 것을 뒤져야 하는데, 찾기 화면으로 가면 놓던
 *   자리를 잃는다. 돌아오면 어디까지 했는지 다시 찾아야 한다.
 *
 *   **찾는 일이 하던 일을 멈추게 하면 안 된다.** 계산기를 띄워놓고 일하는
 *   것과 같다. 뒤쪽 화면은 그대로 있고 이 창만 따로 움직인다.
 *
 * 두 모습
 *   평소에는 동그란 단추다. 누르면 창이 되고, 창 위쪽 `−`를 누르면 다시
 *   동그래진다. 둘 다 끌어서 옮길 수 있다.
 *
 * 자리를 재서 놓는다
 *   **이 저장소가 두 번 걸린 자리다.** (AGENTS.md 6절) 13-C에서 위아래로
 *   넘쳤고 15-F에서 좌우로 넘쳤다. 규칙 하나로 자리를 정하지 않고 잰다.
 *
 *   여기는 끌어서 옮기는 창이라 위험이 하나 더 있다. **창을 열면 커진다.**
 *   동그란 단추가 오른쪽 끝에 있을 때 그대로 창이 되면 화면 밖으로 나간다.
 *   창 크기가 바뀔 때마다, 그리고 브라우저 창 크기가 바뀔 때마다 다시
 *   화면 안으로 밀어 넣는다.
 *
 * 화면을 옮기고 나면 어떻게 되나
 *   이 창은 앱 레이아웃에 붙어 있다. 앱 안에서 화면을 옮겨도 다시 그려지지
 *   않으므로 **자리와 찾은 결과가 그대로 남는다.** 새로고침하면 처음
 *   자리로 돌아간다. 그것까지 기억하게 하려면 담을 자리가 필요한데,
 *   지금 그만한 값은 아니다.
 *
 * 결과를 누르면 새 탭에서 연다
 *   이 창을 만든 까닭이 "하던 일을 멈추지 않는 것"이다. 같은 탭에서 열면
 *   그 까닭이 무너진다.
 */

/** 동그란 단추의 지름. 자리를 잴 때 쓴다. */
const BUBBLE_SIZE = 56;

/** 화면 가장자리에서 띄울 거리. */
const EDGE_GAP = 12;

/** 창의 너비. 화면이 좁으면 그만큼 줄어든다. */
const PANEL_WIDTH = 360;

/** 끌었다고 볼 최소 거리. 이보다 적게 움직이면 누른 것으로 본다. */
const DRAG_THRESHOLD = 4;

type Point = { x: number; y: number };

export function SearchDock() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [state, formAction, pending] = useActionState<DockState, FormData>(
    searchFromDock,
    EMPTY_DOCK_STATE,
  );

  /*
    **자리를 상태로 두지 않고 DOM을 직접 고친다.**

    상태로 하면 끌 때마다 다시 그리게 되고, "재고 → 그리고 → 또 재고"가
    되어 한 번 깜빡인다. `popover.tsx`가 같은 까닭으로 같은 방식을 쓴다.

    아직 놓이지 않았다는 것을 null로 둔다. 처음 그릴 때는 `window`를 볼 수
    없어 자리를 정할 수 없다.
  */
  const spotRef = useRef<Point | null>(null);

  /**
   * 화면 안으로 밀어 넣어 자리를 정한다.
   *
   * **지금 그려진 크기를 재서 쓴다.** 상수로 두면 창을 열고 닫을 때마다
   * 틀린 값으로 재게 된다. 열면 커지기 때문이다.
   */
  const place = useCallback((next?: Point) => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const width = element.offsetWidth || BUBBLE_SIZE;
    const height = element.offsetHeight || BUBBLE_SIZE;

    const wanted = next ??
      spotRef.current ?? {
        // 처음 자리는 오른쪽 아래다.
        x: window.innerWidth - width - EDGE_GAP * 2,
        y: window.innerHeight - height - EDGE_GAP * 4,
      };

    const maxX = Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP);
    const maxY = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);

    const spot = {
      x: Math.min(Math.max(wanted.x, EDGE_GAP), maxX),
      y: Math.min(Math.max(wanted.y, EDGE_GAP), maxY),
    };

    spotRef.current = spot;
    element.style.left = `${spot.x}px`;
    element.style.top = `${spot.y}px`;
  }, []);

  /*
    처음 놓을 때와, **창을 열고 닫아 크기가 바뀔 때** 다시 잰다.
    오른쪽 끝에 있던 동그란 단추가 그대로 창이 되면 화면 밖으로 나간다.

    그리기 전에 도는 효과라 깜빡이지 않는다.
  */
  useLayoutEffect(() => {
    place();
  }, [open, place]);

  /*
    브라우저 창 크기가 바뀔 때도 다시 민다. 큰 화면에서 오른쪽에 두었다가
    창을 줄이면 밖으로 밀려난다.
  */
  useEffect(() => {
    const onResize = () => place();

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  /** 끄는 동안 붙잡아 두는 값. 다시 그릴 필요가 없어 상태로 두지 않는다. */
  const dragRef = useRef<{
    pointerId: number;
    fromPointer: Point;
    fromSpot: Point;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    // 왼쪽 단추나 손가락만. 오른쪽 단추로 끌지 않는다.
    if (event.button !== 0 || spotRef.current === null) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      fromPointer: { x: event.clientX, y: event.clientY },
      fromSpot: spotRef.current,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.fromPointer.x;
    const dy = event.clientY - drag.fromPointer.y;

    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      drag.moved = true;
    }

    place({ x: drag.fromSpot.x + dx, y: drag.fromSpot.y + dy });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    /*
      **끈 것과 누른 것을 가른다.** 가르지 않으면 옮길 때마다 창이 열린다.
      조금 흔들린 것은 누른 것으로 본다.
    */
    if (!drag.moved && !open) {
      setOpen(true);
    }
  };

  // 창이 떠 있을 때 Esc로 접는다. 뒤쪽 화면을 가리고 있으므로 빠지는 길을 둔다.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const found = (state.sources?.length ?? 0) + (state.captures?.length ?? 0);

  return (
    <div
      ref={rootRef}
      /*
        `fixed`로 둔다. 감싸는 칸에 `overflow: hidden`이 걸려 있어도 잘리지
        않는다. `z-40`인 까닭은 따로 있다. 겹쳐 뜨는 창(`z-50`)이 있을 때는
        그쪽이 위여야 한다. 재료 고르는 창을 이 단추가 가리면 곤란하다.

        왼쪽 위에서 시작해 곧바로 `place()`가 자리를 잡는다. 그리기 전에
        도는 효과라 깜빡이지 않는다.
      */
      className="fixed left-0 top-0 z-40"
    >
      {open ? (
        <section
          aria-label="찾기 창"
          className="flex flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-900"
          style={{ width: `min(${PANEL_WIDTH}px, calc(100vw - ${EDGE_GAP * 2}px))` }}
        >
          {/*
            머리말을 잡고 끈다. 창 아무 데나 잡아 끌게 하면 글을 고를 수
            없고, 적으려고 누른 것이 창을 옮기는 일이 된다.
          */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="flex cursor-grab touch-none items-center gap-2 border-b border-black/[.08] bg-zinc-50 px-3 py-2 active:cursor-grabbing dark:border-white/[.145] dark:bg-zinc-950"
          >
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              찾기
            </span>

            <Link
              href="/search"
              className="text-xs text-zinc-500 underline underline-offset-2 hover:text-black dark:hover:text-zinc-50"
              // 링크를 누르는 것이 창을 끄는 것으로 읽히지 않게 한다.
              onPointerDown={(event) => event.stopPropagation()}
            >
              찾기 화면
            </Link>

            {/*
              물음표를 창 안에 둔다. 끌 수 있다는 것과 새 탭에서 열린다는
              것을 눌러보기 전에는 알 수 없다.
            */}
            <HelpButton topic="search-dock" label="띄워놓고 찾기" />

            <button
              type="button"
              onClick={() => setOpen(false)}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label="찾기 창 접기"
              title="접기"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none text-zinc-500 transition-colors hover:bg-black/[.06] hover:text-black dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
            >
              −
            </button>
          </div>

          <form action={formAction} className="flex gap-2 p-3">
            <label htmlFor="dock-term" className="sr-only">
              찾을 낱말
            </label>
            <input
              id="dock-term"
              name="term"
              type="search"
              defaultValue={state.term}
              placeholder="모델링, Blum, 표본"
              className="h-9 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={pending}
              className="h-9 shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
            >
              {pending ? "…" : "찾기"}
            </button>
          </form>

          <div className="max-h-[50vh] overflow-y-auto px-3 pb-3">
            {state.error ? (
              <p role="alert" className="py-2 text-xs leading-5 text-red-700 dark:text-red-300">
                {state.error}
              </p>
            ) : state.sources === null ? (
              <p className="py-2 text-xs leading-5 text-zinc-500">
                담아둔 자료와 기록에서 찾습니다. 누르면 새 탭에서 열리니
                하던 일은 그대로 있습니다.
              </p>
            ) : found === 0 ? (
              <p className="py-2 text-xs leading-5 text-zinc-500">
                찾은 것이 없습니다. 더 짧게 적어보세요.
              </p>
            ) : (
              <ul className="flex flex-col">
                {state.sources?.map((source) => (
                  <li
                    key={`s-${source.id}`}
                    className="border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
                  >
                    <a
                      href={`/sources/${source.id}`}
                      target="_blank"
                      rel="noopener"
                      className="flex flex-col gap-0.5 py-2 transition-colors hover:text-accent dark:hover:text-accent-dark"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[11px] text-zinc-500">
                          {getSourceTypeLabel(source.type)}
                        </span>
                        <span className="text-xs text-black dark:text-zinc-50">
                          {source.title}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}

                {state.captures?.map((capture) => (
                  <li
                    key={`c-${capture.id}`}
                    className="border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
                  >
                    {/*
                      자료에 붙지 않은 기록은 갈 데가 없다. 그럴 때는 누를 수
                      없게 두고 글만 보여준다. 누를 수 없다는 것이 보이는
                      편이, 눌렀는데 아무 일도 없는 것보다 낫다.
                    */}
                    {capture.sourceId ? (
                      <a
                        href={`/sources/${capture.sourceId}`}
                        target="_blank"
                        rel="noopener"
                        className="flex flex-col gap-0.5 py-2 transition-colors hover:text-accent dark:hover:text-accent-dark"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[11px] text-zinc-500">
                            {getCaptureTypeLabel(capture.captureType)}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {capture.sourceTitle}
                          </span>
                        </span>
                        <span className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-zinc-800 dark:text-zinc-200">
                          {capture.content ?? capture.originalText}
                        </span>
                      </a>
                    ) : (
                      <div className="flex flex-col gap-0.5 py-2">
                        <span className="text-[11px] text-zinc-500">
                          {getCaptureTypeLabel(capture.captureType)} · 자료에
                          붙지 않은 기록
                        </span>
                        <span className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-zinc-800 dark:text-zinc-200">
                          {capture.content ?? capture.originalText}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/*
              몇 개까지만 보여준다는 것을 밝힌다. 밝히지 않으면 이것이
              전부인 줄 알고 없는 것으로 판단하게 된다.
            */}
            {found > 0 &&
            ((state.sources?.length ?? 0) === DOCK_LIMIT ||
              (state.captures?.length ?? 0) === DOCK_LIMIT) ? (
              <p className="pt-2 text-[11px] leading-4 text-zinc-500">
                각 {DOCK_LIMIT}건까지만 보여줍니다. 더 보려면 위의{" "}
                <Link href="/search" className="underline underline-offset-2">
                  찾기 화면
                </Link>
                으로 가세요.
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="찾기 창 열기"
          title="찾기 (끌어서 옮길 수 있습니다)"
          className="flex cursor-grab touch-none items-center justify-center rounded-full border border-black/[.08] bg-white text-zinc-600 shadow-lg transition-colors hover:text-black active:cursor-grabbing dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
          style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.2 13.2 17 17" />
          </svg>
        </button>
      )}
    </div>
  );
}
