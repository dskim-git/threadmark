import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { requireAccount } from "@/lib/auth/account";
import { canAccessProtectedArea, getStatusNotice } from "@/lib/auth/status";

export const metadata: Metadata = {
  title: "승인 상태 · ThreadMark",
  description: "ThreadMark 가입 승인 상태를 안내합니다.",
};

/**
 * 가입 승인 상태 안내 화면.
 *
 * pending, rejected, suspended 사용자가 도착하는 곳이다.
 * 이 화면은 접근을 막는 장치가 아니라 상황을 알려주는 화면이다.
 * 실제 차단은 각 서버 진입점의 requireActiveAccount와 RLS가 담당한다.
 */
export default async function PendingPage() {
  const account = await requireAccount("/pending");

  // 승인이 끝난 사용자가 이 화면에 머무를 이유가 없다.
  if (canAccessProtectedArea(account.status)) {
    redirect("/home");
  }

  const notice = getStatusNotice(account.status);
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md">
        <div className="flex flex-col gap-6 rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              ThreadMark
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              {notice.title}
            </h1>
          </header>

          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {notice.description}
          </p>

          <dl className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-white/[.04]">
            <div className="flex gap-2">
              <dt className="text-zinc-500">로그인 계정</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {account.email ?? "확인할 수 없음"}
              </dd>
            </div>
          </dl>

          {notice.needsContact && supportEmail ? (
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              문의:{" "}
              <a
                className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                href={`mailto:${supportEmail}`}
              >
                {supportEmail}
              </a>
            </p>
          ) : null}

          {/*
            기다리는 동안 볼 것을 준다. 승인 전에는 앱 화면에 들어갈 수 없어서
            이 앱이 무엇을 하는 것인지 알 방법이 없었다. 사용법은 우리가 쓴
            글이라 승인 없이 보여도 새는 것이 없다.
          */}
          <a
            href="/guide"
            className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            그동안 사용법 보기
          </a>

          <form action={signOut}>
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              로그아웃
            </button>
          </form>

          {/*
            나가는 길. (17-A)

            **여기에도 있어야 한다.** 승인을 기다리거나 거절·정지된 사람은
            앱 화면에 들어갈 수 없어서 설정에 있는 길에 닿지 못한다. 쓰지도
            못하고 지우지도 못하는 상태에 갇히는 셈이다. 개인정보 초안 7절이
            승인 대기·거절 상태에서도 계정을 지울 수 있어야 한다고 적었다.

            작게 둔다. 지금 이 사람이 기다리러 온 것이지 나가러 온 것은
            아니기 때문이다.
          */}
          <p className="text-center text-xs leading-5 text-zinc-500">
            기다리지 않고 나가시려면{" "}
            <a
              href="/account/delete"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              계정을 지울 수 있습니다
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
