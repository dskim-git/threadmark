import type { Metadata } from "next";

import { requireActiveAccount } from "@/lib/auth/account";

export const metadata: Metadata = {
  title: "홈 · ThreadMark",
  description: "ThreadMark 홈 화면입니다.",
};

/**
 * 보호된 앱 영역의 첫 화면.
 *
 * 레이아웃이 이미 확인했더라도 페이지에서 다시 확인한다.
 * 레이아웃의 실행 시점에 의존하지 않기 위해서다.
 *
 * Source, Capture, Project 기능은 9~11단계에서 이 영역 안에 추가한다.
 */
export default async function HomePage() {
  const account = await requireActiveAccount("/home");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {account.displayName
            ? `${account.displayName}님, 환영합니다`
            : "환영합니다"}
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          승인된 계정입니다. 자료와 생각을 Source, Capture, Project로 연결해
          기록할 수 있습니다.
        </p>
      </header>

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          준비 중입니다
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Source와 Capture 기능은 아직 구현 중입니다. 지금은 계정 승인과 접근
          제어가 올바르게 동작하는지 확인하는 단계입니다.
        </p>
      </section>
    </div>
  );
}
