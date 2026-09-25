import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";

import { AppNav, AppSubNav, SettingsLink } from "./app-nav";
import { SearchDock } from "./search-dock";

/**
 * 보호된 앱 영역의 레이아웃.
 *
 * 여기서 requireActiveAccount를 호출하지만, 이것만으로 접근이 막힌다고 보지 않는다.
 * Next.js의 레이아웃은 같은 레이아웃을 공유하는 경로 사이를 이동할 때
 * 다시 실행되지 않을 수 있다. 그래서 이 영역의 각 페이지와 Server Action도
 * 직접 requireActiveAccount를 호출하고, 데이터 접근은 RLS가 한 번 더 막는다.
 *
 * 이 호출의 역할은 승인되지 않은 사용자를 이른 시점에 안내 화면으로 보내는 것이다.
 *
 * 메뉴는 브라우저에서 그린다. 지금 어디에 있는지 표시하려면 경로가 필요한데
 * 서버 레이아웃은 그것을 알 수 없다. 관리자인지는 여기서 정해 넘긴다.
 * 그 판단을 브라우저에 맡기지 않는다.
 */
// (app)은 라우트 그룹이라 URL 세그먼트를 만들지 않는다. 경로상 위치는 루트다.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const account = await requireActiveAccount();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-4xl flex-col px-6">
          <div className="flex items-center justify-between gap-6">
            <Link
              href="/home"
              className="shrink-0 py-3 font-serif text-lg tracking-tight text-black dark:text-zinc-50"
            >
              ThreadMark
            </Link>

            <AppNav />

            {/*
              찾기는 메뉴 항목이 아니라 창으로 둔다. 매일 여러 번 쓰는 일이라,
              화면을 한 번 거쳐 가게 하면 그만큼 덜 쓰게 된다.

              좁은 화면에서는 창을 접고 글자 하나로 바꾼다. 로고와 메뉴 넷과
              설정이 이미 한 줄을 채우고 있어서, 창까지 넣으면 어느 것도
              제대로 눌리지 않는다. 자바스크립트 없이 폼 하나로 움직인다.
            */}
            <form
              action="/search"
              className="ml-auto hidden shrink-0 items-center gap-1 sm:flex"
            >
              <label htmlFor="header-search" className="sr-only">
                찾기
              </label>
              <input
                id="header-search"
                name="q"
                type="search"
                placeholder="찾기"
                className="h-9 w-32 rounded-full border border-black/[.08] bg-zinc-50 px-4 text-sm text-black transition-colors focus:w-48 focus:bg-white focus:outline-none md:w-40 dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:bg-zinc-950"
              />

              {/*
                찾기 화면으로 가는 단추. (사용자 요청, 2026-09-25)

                **링크가 아니라 이 폼의 보내기 단추다.** 링크로 두면 적다가
                누른 사람이 검색어를 잃는다. 적은 것이 있으면 그것으로 찾고,
                없으면 빈 찾기 화면으로 간다. 두 경우 모두 맞게 움직인다.

                창에서 Enter를 눌러야만 갈 수 있다는 것을 사용자가 지적했다.
                Enter는 누를 곳이 보이지 않는 길이다.
              */}
              <button
                type="submit"
                aria-label="찾기 화면으로"
                title="찾기 화면으로"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-black dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-4 w-4"
                >
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="M13.2 13.2 17 17" />
                </svg>
              </button>
            </form>

            {/* 창을 접은 좁은 화면에서 찾기로 가는 길. */}
            <Link
              href="/search"
              className="ml-auto shrink-0 py-3 text-sm text-zinc-500 transition-colors hover:text-black sm:hidden dark:hover:text-zinc-50"
            >
              찾기
            </Link>

            {/*
              사용법으로 가는 길. 설정 옆에 둔다.

              앱 묶음 밖의 화면이라 같은 창에서 열리되 이 머리말이 없다.
              돌아오는 링크가 그 화면 위쪽에 있다. 곳곳의 물음표 단추로
              대부분 해결되므로 이 길은 작게 둔다.
            */}
            <Link
              href="/guide"
              className="shrink-0 border-b-2 border-transparent px-3 py-3 text-sm text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
            >
              사용법
            </Link>

            <div className="shrink-0">
              <SettingsLink />
            </div>
          </div>

          <AppSubNav isAdmin={account.isAdmin} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>

      {/*
        어디서든 띄워두고 쓰는 찾기 창. (사용자 요청, 2026-09-25)

        **레이아웃에 둔다.** 앱 안에서 화면을 옮겨도 다시 그려지지 않으므로
        자리와 찾은 결과가 그대로 남는다. 화면마다 따로 두면 옮길 때마다
        처음으로 돌아가고, 그러면 띄워두는 뜻이 없다.
      */}
      <SearchDock />
    </div>
  );
}
