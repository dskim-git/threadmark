import type { Metadata } from "next";
import Link from "next/link";

import { GuideText } from "@/app/(app)/help-button";
import { getAccount } from "@/lib/auth/account";
import { GUIDE_SECTIONS } from "@/lib/guide/content";

export const metadata: Metadata = {
  title: "사용법 · ThreadMark",
  description: "ThreadMark를 처음 쓰는 분을 위한 안내입니다.",
};

/**
 * 사용법 전체. (AGENTS.md 4절의 15-F)
 *
 * **로그인하지 않아도 볼 수 있다.** 앱 화면(`(app)` 묶음) 밖에 두었으므로
 * 승인 확인을 거치지 않는다.
 *
 * 그렇게 한 이유가 둘이다. 하나는 새로 가입한 사람이 승인을 기다리는 동안
 * `/pending`에서 아무것도 볼 수 없다는 것이고, 다른 하나는 이 앱을 남에게
 * 알릴 때 링크 하나면 되게 하기 위해서다.
 *
 * 새는 것이 없다. 이 화면은 **우리가 쓴 글**만 보여주고 데이터베이스에서
 * 아무것도 읽지 않는다. 다만 위쪽 링크를 알맞게 보여주려고 로그인 여부만
 * 확인하는데, 그 값으로 무엇을 막거나 열지 않는다.
 *
 * 글은 `src/lib/guide/content.ts` 한 곳에 있다. 화면 곳곳의 물음표 단추가
 * 같은 글을 본다.
 */
export default async function GuidePage() {
  const account = await getAccount();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
          >
            ThreadMark
          </Link>

          <Link
            href={account ? "/home" : "/login"}
            className="h-9 rounded-full border border-black/[.08] px-4 text-xs font-medium leading-9 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {account ? "앱으로 돌아가기" : "로그인"}
          </Link>
        </div>

        <h1 className="text-3xl leading-tight text-black dark:text-zinc-50">
          사용법
        </h1>
        <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
          읽은 것과 그때 떠오른 생각을 출처와 함께 남기고, 나중에 다시 찾아
          쓰는 곳입니다. 처음이라면 맨 위부터 읽으시면 됩니다. 앱 안에서는
          기능 옆의 <HelpMark /> 단추를 눌러 그 자리에서 같은 설명을 볼 수
          있습니다.
        </p>
      </header>

      {/*
        좁은 화면의 차례. 접어둔다.

        넓은 화면에서는 왼쪽에 늘 떠 있지만(아래), 좁은 화면에서 스무 줄짜리
        목록을 펼쳐두면 본문이 그만큼 아래로 밀린다. `details`를 쓰므로
        브라우저에서 돌릴 코드가 없다.
      */}
      <details className="mt-8 rounded-2xl bg-zinc-50 p-4 lg:hidden dark:bg-white/[.04]">
        <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
          차례
        </summary>
        <div className="mt-3">
          <TableOfContents />
        </div>
      </details>

      <div className="mt-8 flex gap-10">
        {/*
          넓은 화면의 차례. 왼쪽에 붙어 따라온다.

          `sticky`라 본문을 내려도 늘 보인다. 사용법은 필요한 대목만 찾아
          읽는 글이라, 어디에 무엇이 있는지가 늘 보여야 찾아갈 수 있다.
          차례가 화면보다 길어지면 그 안에서만 스크롤한다.
        */}
        <nav className="sticky top-6 hidden h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto lg:block">
          <h2 className="mb-3 text-xs font-medium text-zinc-500">차례</h2>
          <TableOfContents />
        </nav>

        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-10">
      {GUIDE_SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="flex scroll-mt-6 flex-col gap-6"
        >
          <div className="flex flex-col gap-2 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
            <h2 className="text-xl text-black dark:text-zinc-50">
              {section.title}
            </h2>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {section.intro}
            </p>
          </div>

          {section.topics.map((topic) => (
            <article
              key={topic.id}
              id={topic.id}
              className="flex scroll-mt-6 flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-medium text-black dark:text-zinc-50">
                  {topic.title}
                </h3>
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {topic.summary}
                </p>
              </div>

              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-7 text-zinc-800 dark:text-zinc-200">
                {topic.steps.map((step, index) => (
                  <li key={index}>
                    <GuideText text={step} />
                  </li>
                ))}
              </ol>

              {topic.notes && topic.notes.length > 0 ? (
                <ul className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
                  {topic.notes.map((note, index) => (
                    <li key={index} className="flex gap-2">
                      <span aria-hidden="true">·</span>
                      <span>
                        <GuideText text={note} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      ))}

          <footer className="border-t border-black/[.08] pt-6 text-xs leading-6 text-zinc-500 dark:border-white/[.145]">
            아직 만드는 중인 앱입니다. 기능이 늘어날 때마다 이 사용법도 함께
            갱신됩니다. 여기 없는 화면이 보인다면 알려주세요.
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * 차례. 묶음 아래에 대목까지 펼쳐 보여준다.
 *
 * 묶음 이름만 있으면 "태그 설명이 어디 있지"에 답하지 못한다. 찾는 사람은
 * 묶음이 아니라 기능 이름을 떠올린다. 스무 줄이 되지만 그래서 쓸모가 있다.
 *
 * 좁은 화면(접힌 차례)과 넓은 화면(왼쪽 고정)이 같은 것을 쓴다.
 */
function TableOfContents() {
  return (
    <ul className="flex flex-col gap-4">
      {GUIDE_SECTIONS.map((section) => (
        <li key={section.id} className="flex flex-col gap-1">
          <a
            href={`#${section.id}`}
            className="text-xs font-semibold text-black dark:text-zinc-50"
          >
            {section.title}
          </a>
          <ul className="flex flex-col gap-0.5 border-l border-black/[.08] pl-3 dark:border-white/[.145]">
            {section.topics.map((topic) => (
              <li key={topic.id}>
                <a
                  href={`#${topic.id}`}
                  className="block py-0.5 text-xs leading-5 text-zinc-500 transition-colors hover:text-accent dark:hover:text-accent-dark"
                >
                  {topic.title}
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** 본문 안에 물음표 단추의 생김새를 그대로 보여준다. */
function HelpMark() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/15 align-text-bottom text-[10px] font-semibold text-zinc-500 dark:border-white/25 dark:text-zinc-400"
    >
      ?
    </span>
  );
}
