import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccount } from "@/lib/auth/account";
import { canAccessProtectedArea } from "@/lib/auth/status";

export const metadata: Metadata = {
  title: "ThreadMark",
  description:
    "자료와 그때 떠오른 생각을 출처와 함께 남기고, 프로젝트로 이어 쓰는 개인 지식 작업 공간입니다.",
};

/**
 * 첫 화면. (설계 문서 21절의 `/`)
 *
 * 로그인하지 않은 사람에게만 보인다. 이미 로그인했다면 볼 이유가 없는 화면이라
 * 바로 안으로 보낸다. 승인 전이면 대기 화면으로 보낸다. 그 판단을 여기서 다시
 * 하는 이유는, 레이아웃의 확인만 믿지 않는다는 원칙과 같다. (보안 원칙 5)
 *
 * 여기서는 아무 자료도 읽지 않는다. 로그인 여부만 본다.
 *
 * 없는 것을 적지 않는다. 기능 목록을 늘어놓고 싶어지는 자리지만, 설계 문서
 * 1절이 말하는 세 가지(자료·기록·프로젝트)와 승인제라는 사실만 적는다.
 * 개인정보 처리방침과 약관은 화면이 생기면 그때 링크한다. 없는 링크를 먼저
 * 만들어두면, 눌러본 사람은 고장 난 서비스로 읽는다.
 */
export default async function Home() {
  const account = await getAccount();

  if (account) {
    redirect(canAccessProtectedArea(account.status) ? "/home" : "/pending");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            ThreadMark
          </h1>
          <p className="text-lg leading-8 text-zinc-700 dark:text-zinc-300">
            논문과 책, 웹사이트와 영상에서 만난 것을 <strong>어디서 보았는지와
            함께</strong> 남깁니다. 그때 떠오른 생각을 붙여 두고, 나중에
            프로젝트로 묶어 씁니다.
          </p>
        </header>

        {/* 설계 문서 1절의 핵심 도메인 셋. 여기 없는 것은 적지 않는다. */}
        <dl className="flex flex-col gap-5 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-black dark:text-zinc-50">
              자료
            </dt>
            <dd className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              읽고 보고 들은 것. 논문이라면 PDF를 옆에 띄우고 문장을 끌어
              인용으로 남길 수 있습니다.
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-black dark:text-zinc-50">
              기록
            </dt>
            <dd className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              인용과 메모와 생각. 몇 쪽 어디에서 왔는지가 함께 남아, 나중에
              그 자리로 돌아갈 수 있습니다.
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-black dark:text-zinc-50">
              프로젝트
            </dt>
            <dd className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              그것을 쓸 자리. 논문 한 편, 수업 하나, 연수 하나입니다. 같은
              자료도 프로젝트마다 다르게 쓰입니다.
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="h-12 w-fit rounded-full bg-zinc-900 px-8 text-sm font-medium leading-[3rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            로그인
          </Link>
          {/*
            승인제라는 것을 여기서 미리 알린다. (설계 문서 4.2절)
            로그인한 뒤에야 알게 되면, 기다리는 화면을 고장으로 읽는다.
          */}
          <p className="text-sm leading-6 text-zinc-500">
            Google 계정으로 들어옵니다. 처음 오신 분은 운영자 승인을 받은 뒤에
            쓸 수 있습니다.
          </p>
        </div>
      </main>
    </div>
  );
}
