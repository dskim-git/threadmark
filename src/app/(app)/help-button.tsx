"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { findGuideTopic } from "@/lib/guide/content";

/**
 * 기능 옆의 물음표 단추. 누르면 그 자리에 설명이 뜬다.
 *
 * **화면을 옮기지 않는다.** 사용법 화면으로 보내면 보던 것을 잃고, 읽고 나서
 * 돌아와야 하고, 서버에 두 번 다녀오게 된다. 막혀서 누른 것인데 더 느려진다.
 * 여기서 뜨는 창은 이미 브라우저에 있는 글을 보여줄 뿐이라 기다림이 없다.
 *
 * 마우스를 올리는 것만으로 열지 않는다. 아이패드에는 `올리는` 동작이 없어서
 * 그렇게 만들면 그 기기에서 아예 열 수 없다. 눌러서 여는 것은 어디서나 된다.
 * 대신 단추에 마우스를 올리면 한 줄 요약이 뜬다.
 *
 * 글은 `src/lib/guide/content.ts` 한 곳에 있다. 이 창과 `/guide` 화면이 같은
 * 글을 본다. 두 곳에 나눠 적으면 한쪽만 갱신되어 어긋난다.
 *
 * 없는 열쇠를 가리키면 아무것도 그리지 않는다. 검사가 그 일을 막지만,
 * 막지 못해도 깨진 단추가 화면에 남지는 않게 한다.
 */
export function HelpButton({
  topic: topicId,
  label,
  className,
}: {
  /** `content.ts`의 대목 열쇠. */
  topic: string;
  /** 무엇에 대한 설명인지. 읽어주는 이름에 들어간다. */
  label?: string;
  className?: string;
}) {
  const topic = findGuideTopic(topicId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /*
    **창을 재서 놓는다.**

    처음에는 `오른쪽 끝을 단추에 맞춘다`는 규칙 하나로 두었다. 오른쪽에 있는
    단추에서는 맞았지만, **화면 왼쪽에 있는 단추에서는 창이 왼쪽으로 밀려
    화면 밖으로 나갔다.** 자료 화면의 태그 칸 물음표가 그랬다.

    AGENTS.md 6절에 이미 적혀 있던 것이다. "떠 있는 창은 재서 놓는다.
    `고른 글이 화면 위쪽이면 아래에` 같은 규칙만으로는 창이 커지는 순간
    화면 밖으로 넘친다." 읽기 화면의 선택 창에서 겪은 것과 같은 종류다.
    자리를 정하는 규칙이 아니라 **재는 코드**가 필요하다.

    `position: fixed`로 둔다. 감싸는 칸에 `overflow: hidden`이 걸려 있어도
    잘리지 않는다. 대신 화면을 스크롤하면 단추가 움직이므로 그때 다시 잰다.

    상태를 두지 않고 DOM을 직접 고친다. 상태로 하면 "재고 → 다시 그리고 →
    또 재고"가 되어 한 번 깜빡이고, React 19는 effect 안에서 상태를 바꾸는
    것을 막는다. `fill-viewport.tsx`와 같은 방식이다.
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
      const width = Math.min(352, window.innerWidth - gap * 2);

      panel.style.width = `${width}px`;

      /*
        오른쪽 끝을 단추에 맞추되 화면 안으로 밀어 넣는다. 단추가 화면
        왼쪽에 있으면 왼쪽 여백에 붙는다.
      */
      const wanted = anchor.right - width;
      const left = Math.min(
        Math.max(wanted, gap),
        window.innerWidth - width - gap,
      );

      panel.style.left = `${Math.round(left)}px`;

      /*
        아래위 중 넓은 쪽에 놓는다. 아래에 자리가 모자라면 위로 올린다.
        그려진 실제 높이를 다시 재서 정한다. 짐작하는 값을 두지 않는다.
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
  }, [open]);

  /*
    바깥을 누르거나 Esc를 누르면 닫는다.

    창 **안을** 누른 것은 넘긴다. 창 안에 링크가 있고, 누르는 순간 닫히면
    그 링크를 누를 수가 없다. 읽기 화면의 선택 창이 같은 이유로 자기 안의
    누름을 가려낸다. (AGENTS.md 6절)
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

  if (!topic) {
    return null;
  }

  const name = label ?? topic.title;

  return (
    /*
      data-reader-selection-panel은 읽기 화면을 위한 표시다. 그 화면의 뷰어는
      문서의 어디를 누르든 "고른 문장이 없어졌다"로 읽는데, 이 표시가 붙어
      있으면 그 누름을 넘긴다. 읽다가 물음표를 눌렀다고 고른 문장이 사라지면
      안 된다.
    */
    <div
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
        aria-label={`${name} 사용법`}
        title={topic.summary}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-black/15 text-[11px] font-semibold leading-none text-zinc-500 transition-colors hover:border-black/30 hover:bg-black/[.04] hover:text-black dark:border-white/25 dark:text-zinc-400 dark:hover:border-white/40 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
      >
        ?
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`${name} 사용법`}
          /*
            자리는 위의 effect가 재서 넣는다. 여기서는 겹치는 순서와 모양만
            정한다. `overflow-y-auto`는 재어 넣은 최대 높이 안에서만 움직인다.
          */
          className="fixed left-0 top-0 z-50 flex max-h-[80vh] flex-col overflow-y-auto rounded-2xl border border-black/[.08] bg-white p-4 text-left shadow-lg dark:border-white/[.145] dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
              {topic.title}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/[.06] hover:text-black dark:hover:bg-white/[.08] dark:hover:text-zinc-50"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
            {topic.summary}
          </p>

          {/*
            길어지면 창 안에서만 스크롤한다. 창이 화면보다 길어지면 아래쪽
            내용에 닿을 방법이 없어진다.
          */}
          <div className="mt-3">
            <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
              {topic.steps.map((step, index) => (
                <li key={index}>
                  <GuideText text={step} />
                </li>
              ))}
            </ol>

            {topic.notes && topic.notes.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-black/[.06] pt-3 text-xs leading-5 text-zinc-500 dark:border-white/[.1]">
                {topic.notes.map((note, index) => (
                  <li key={index} className="flex gap-1.5">
                    <span aria-hidden="true">·</span>
                    <span>
                      <GuideText text={note} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <a
            href={`/guide#${topic.id}`}
            className="mt-3 inline-block text-xs text-accent underline underline-offset-4 dark:text-accent-dark"
          >
            사용법 전체 보기
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * `**굵게**`만 알아본다.
 *
 * 마크다운 라이브러리를 들이지 않는다. 사용법 글에 필요한 강조는 이것
 * 하나뿐이고, 라이브러리는 이 창 하나 때문에 브라우저가 받아야 할 짐이 된다.
 * 다른 표시는 글자 그대로 나온다.
 */
export function GuideText({ text }: { text: string }) {
  const pieces = text.split(/\*\*(.+?)\*\*/gu);

  return (
    <>
      {pieces.map((piece, index) =>
        // split의 결과에서 홀수 자리가 별표 안에 있던 글이다.
        index % 2 === 1 ? (
          <strong key={index} className="font-semibold">
            {piece}
          </strong>
        ) : (
          piece
        ),
      )}
    </>
  );
}
