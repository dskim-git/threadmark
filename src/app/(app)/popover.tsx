"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * 그 자리에 뜨는 작은 창. (19-B에서 물음표 단추에서 떼어냄)
 *
 * **화면을 옮기지 않는다.** 보던 것을 잃지 않고, 읽고 나서 돌아올 필요가
 * 없고, 서버에 다녀오지 않는다. 물음표 단추가 이 방식을 쓰고 있었고,
 * 놓아둔 재료를 들여다보는 일에도 같은 것이 필요해져서 떼어냈다.
 *
 * **두 벌로 만들지 않는다.** 자리를 재서 놓는 코드는 짧지 않고, 두 곳에
 * 두면 한쪽만 고쳐진다. 읽기 화면의 선택 창에서 이미 배운 것이라
 * (AGENTS.md 6절 "떠 있는 창은 재서 놓는다") 처음부터 한 곳에 둔다.
 */
export function Popover({
  trigger,
  triggerClassName,
  ariaLabel,
  hoverTitle,
  width = 352,
  className,
  children,
}: {
  /** 단추 안에 그릴 것. 글자든 기호든. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** 읽어주는 기계에게 알릴 이름. */
  ariaLabel: string;
  /** 마우스를 올렸을 때 뜨는 한 줄. */
  hoverTitle?: string;
  /** 창의 너비. 화면이 좁으면 그만큼 줄어든다. */
  width?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /*
    **창을 재서 놓는다.**

    `오른쪽 끝을 단추에 맞춘다` 같은 규칙 하나로는 모자란다. 화면 왼쪽에
    있는 단추에서는 창이 왼쪽으로 밀려 화면 밖으로 나간다. 자리를 정하는
    규칙이 아니라 **재는 코드**가 필요하다.

    `position: fixed`로 둔다. 감싸는 칸에 `overflow: hidden`이 걸려 있어도
    잘리지 않는다. 대신 화면을 스크롤하면 단추가 움직이므로 그때 다시 잰다.

    상태를 두지 않고 DOM을 직접 고친다. 상태로 하면 "재고 → 다시 그리고 →
    또 재고"가 되어 한 번 깜빡인다.
  */
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const place = () => {
      const button = buttonRef.current;
      const panel = panelRef.current;

      if (!button || !panel) {
        return;
      }

      const anchor = button.getBoundingClientRect();
      const gap = 12;
      const actual = Math.min(width, window.innerWidth - gap * 2);

      panel.style.width = `${actual}px`;

      const wanted = anchor.right - actual;
      const left = Math.min(
        Math.max(wanted, gap),
        window.innerWidth - actual - gap,
      );

      panel.style.left = `${Math.round(left)}px`;

      /*
        아래위 중 넓은 쪽에 놓는다. 그려진 실제 높이를 다시 재서 정한다.
        짐작하는 값을 두지 않는다.
      */
      const below = window.innerHeight - anchor.bottom - gap * 2;
      const above = anchor.top - gap * 2;
      const height = panel.offsetHeight;

      if (height <= below || below >= above) {
        panel.style.top = `${Math.round(anchor.bottom + 8)}px`;
        panel.style.maxHeight = `${Math.round(below)}px`;
      } else {
        panel.style.maxHeight = `${Math.round(above)}px`;
        // 최대 높이를 걸고 나서 다시 재야 실제로 그려진 높이가 나온다.
        panel.style.top = `${Math.round(Math.max(anchor.top - panel.offsetHeight - 8, gap))}px`;
      }
    };

    place();

    window.addEventListener("resize", place);
    // 세 번째 인수가 true다. 안쪽 칸이 스크롤될 때도 받는다.
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width]);

  /*
    바깥을 누르거나 Esc를 누르면 닫는다.

    창 **안을** 누른 것은 넘긴다. 창 안에 링크와 단추가 있고, 누르는 순간
    닫히면 그것들을 쓸 수가 없다.
  */
  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    /*
      data-reader-selection-panel은 읽기 화면을 위한 표시다. 그 화면의 뷰어는
      문서의 어디를 누르든 "고른 문장이 없어졌다"로 읽는데, 이 표시가 붙어
      있으면 그 누름을 넘긴다.
    */
    <span
      ref={rootRef}
      data-reader-selection-panel=""
      className={`relative inline-flex ${className ?? ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        title={hoverTitle}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel}
          /*
            자리는 위의 effect가 재서 넣는다. 여기서는 겹치는 순서와 모양만
            정한다. `overflow-y-auto`는 재어 넣은 최대 높이 안에서만 움직인다.
          */
          className="fixed left-0 top-0 z-50 flex max-h-[80vh] flex-col overflow-y-auto rounded-2xl border border-black/[.08] bg-white p-4 text-left shadow-lg dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-black dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
            >
              닫기
            </button>
          </div>

          {children}
        </div>
      ) : null}
    </span>
  );
}
