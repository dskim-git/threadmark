import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { requireActiveAccount } from "@/lib/auth/account";

/**
 * 보호된 앱 영역의 레이아웃.
 *
 * 여기서 requireActiveAccount를 호출하지만, 이것만으로 접근이 막힌다고 보지 않는다.
 * Next.js의 레이아웃은 같은 레이아웃을 공유하는 경로 사이를 이동할 때
 * 다시 실행되지 않을 수 있다. 그래서 이 영역의 각 페이지와 Server Action도
 * 직접 requireActiveAccount를 호출하고, 데이터 접근은 RLS가 한 번 더 막는다.
 *
 * 이 호출의 역할은 승인되지 않은 사용자를 이른 시점에 안내 화면으로 보내는 것이다.
 */
// (app)은 라우트 그룹이라 URL 세그먼트를 만들지 않는다. 경로상 위치는 루트다.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const account = await requireActiveAccount();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/home"
            className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
          >
            ThreadMark
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/inbox"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              빠른 기록
            </Link>

            <Link
              href="/library"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              내 자료
            </Link>

            <Link
              href="/projects"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              프로젝트
            </Link>

            {/*
              링크를 감추는 것은 통제가 아니다. 관리자 화면은 각 페이지와
              Server Action이 직접 권한을 확인하고 RLS가 한 번 더 막는다.
              여기서는 관리자에게만 진입 경로를 보여줄 뿐이다.
            */}
            {account.isAdmin ? (
              <Link
                href="/admin/users"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                사용자 승인
              </Link>
            ) : null}

            <span className="hidden text-sm text-zinc-500 sm:inline">
              {account.displayName ?? account.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-solid border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
