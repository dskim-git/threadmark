import Link from "next/link";

import { GuideText } from "@/app/(app)/help-button";
import type { PolicyBlock, PolicySection } from "@/lib/legal/content";
import { POLICY_UPDATED_AT } from "@/lib/legal/content";

/**
 * 방침과 삭제 안내가 함께 쓰는 문서 틀. (17-B)
 *
 * 두 화면이 생김새를 따로 가지면 한쪽만 고쳐져 어긋난다. 글을 한 곳에 둔
 * 것과 같은 이유로 틀도 한 곳에 둔다.
 *
 * **로그인 여부를 묻지 않는다.** 이 문서들은 우리가 쓴 글이라 새는 것이
 * 없고, Google OAuth 동의 화면에 등록할 주소이기도 하다. 검수하는 사람은
 * 우리 계정이 없다. 로그인 뒤에 있으면 그 사람이 볼 수 없다.
 *
 * 위쪽 링크를 로그인 상태에 따라 바꾸지 않는다. `/guide`는 그렇게 하지만
 * 그러려면 계정을 읽어야 하고, 이 화면은 **데이터베이스를 아예 건드리지
 * 않는 편**이 맞다. 무엇을 읽지 않는지가 이 화면의 약속이다.
 */
export function PolicyDocument({
  title,
  intro,
  sections,
  footer,
}: {
  title: string;
  intro: string;
  sections: readonly PolicySection[];
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
          >
            ThreadMark
          </Link>

          <Link
            href="/login"
            className="h-9 rounded-full border border-black/[.08] px-4 text-xs font-medium leading-9 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            로그인
          </Link>
        </div>

        <h1 className="text-3xl leading-tight text-black dark:text-zinc-50">
          {title}
        </h1>
        <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
          {intro}
        </p>
        <p className="text-xs text-zinc-500">
          마지막으로 고친 날: {POLICY_UPDATED_AT}
        </p>
      </header>

      {/*
        차례를 접어둔다. 이 글은 처음부터 읽는 글이지만, 다시 올 때는 대개
        한 대목만 찾아온다. 펼쳐두면 본문이 그만큼 아래로 밀린다.
        `details`를 쓰므로 브라우저에서 돌릴 코드가 없다.
      */}
      <details className="mt-8 rounded-2xl bg-zinc-50 p-4 dark:bg-white/[.04]">
        <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
          차례
        </summary>
        <ul className="mt-3 flex flex-col gap-1">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block py-0.5 text-sm leading-6 text-zinc-600 transition-colors hover:text-accent dark:text-zinc-400 dark:hover:text-accent-dark"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-10 flex flex-col gap-10">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="flex scroll-mt-6 flex-col gap-4"
          >
            <h2 className="border-b border-black/[.08] pb-3 text-xl text-black dark:border-white/[.145] dark:text-zinc-50">
              {section.title}
            </h2>

            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-black/[.08] pt-6 text-xs leading-6 text-zinc-500 dark:border-white/[.145]">
        {footer}
      </footer>
    </div>
  );
}

function Block({ block }: { block: PolicyBlock }) {
  if (block.kind === "text") {
    return (
      <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-300">
        <GuideText text={block.text} />
      </p>
    );
  }

  if (block.kind === "list") {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
        {block.items.map((item, index) => (
          <li key={index}>
            <GuideText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  /*
    표는 자기 칸 안에서만 옆으로 밀린다.

    글자를 줄여 넣으면 "무엇이 닿나" 같은 칸이 한 글자씩 끊겨 읽을 수 없게
    된다. 본문 전체가 옆으로 밀리는 것은 막고, 표만 밀리게 둔다.
  */
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-black/[.08] dark:border-white/[.145]">
            {block.head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="py-2 pr-4 align-top font-medium text-black dark:text-zinc-50"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-black/[.04] last:border-0 dark:border-white/[.08]"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="py-2.5 pr-4 align-top leading-6 text-zinc-700 dark:text-zinc-300"
                >
                  <GuideText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
