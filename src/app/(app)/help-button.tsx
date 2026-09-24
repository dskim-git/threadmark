"use client";

import { Popover } from "@/app/(app)/popover";
import { findGuideTopic } from "@/lib/guide/content";

/**
 * 기능 옆의 물음표 단추. 누르면 그 자리에 설명이 뜬다.
 *
 * **화면을 옮기지 않는다.** 사용법 화면으로 보내면 보던 것을 잃고, 읽고 나서
 * 돌아와야 하고, 서버에 두 번 다녀오게 된다. 막혀서 누른 것인데 더 느려진다.
 *
 * 마우스를 올리는 것만으로 열지 않는다. 아이패드에는 `올리는` 동작이 없어서
 * 그렇게 만들면 그 기기에서 아예 열 수 없다. 대신 단추에 마우스를 올리면
 * 한 줄 요약이 뜬다.
 *
 * 글은 `src/lib/guide/content.ts` 한 곳에 있다. 이 창과 `/guide` 화면이 같은
 * 글을 본다.
 *
 * **창을 재서 놓는 코드는 여기 없다.** `popover.tsx`가 한다. 19-B에서
 * 놓아둔 재료를 들여다보는 창이 필요해졌을 때 그 코드를 떼어냈다.
 * 두 곳에 두면 한쪽만 고쳐진다.
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

  if (!topic) {
    return null;
  }

  const name = label ?? topic.title;

  return (
    <Popover
      ariaLabel={`${name} 사용법`}
      hoverTitle={topic.summary}
      className={className}
      triggerClassName="flex h-6 w-6 items-center justify-center rounded-full border border-black/15 text-[11px] font-semibold leading-none text-zinc-500 transition-colors hover:border-black/30 hover:bg-black/[.04] hover:text-black dark:border-white/25 dark:text-zinc-400 dark:hover:border-white/40 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
      trigger="?"
    >
      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
        {topic.title}
      </h3>

      <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        {topic.summary}
      </p>

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
    </Popover>
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
