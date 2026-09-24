import type { Metadata } from "next";
import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";

import { WebsiteForm } from "../../website-form";

export const metadata: Metadata = {
  title: "웹사이트 담기 · ThreadMark",
  description: "읽은 웹페이지를 주소로 담습니다.",
};

/**
 * 웹사이트 담기. (설계 문서 11.2절, 경로는 21절)
 *
 * 자료 등록(`/sources/new`)과 따로 둔 이유는 **걸음이 다르기 때문이다.**
 * 보통의 자료는 적어서 담지만, 웹사이트는 주소를 넣고 읽어 온 뒤 확인해서
 * 담는다. 중간에 서버에 다녀오는 걸음이 하나 있다.
 *
 * 그 걸음을 하나의 폼에 욱여넣으면, 파일 올리기와 읽어 오기가 한 화면에서
 * 섞여 무엇을 눌러야 하는지 알 수 없어진다.
 */
export default async function NewWebsitePage({
  searchParams,
}: PageProps<"/sources/new/website">) {
  await requireActiveAccount("/sources/new/website");

  const params = await searchParams;
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href="/library"
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 내 자료로
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            웹사이트 담기
          </h1>
          <HelpButton topic="website" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          주소를 붙여넣으면 그 페이지가 공개해 둔 제목과 설명을 읽어 옵니다.
          읽어 온 값은 모두 고칠 수 있습니다.
        </p>
      </header>

      {/*
        저장하다 실패했을 때 돌아오는 자리. 읽어 온 내용은 남아 있지 않다.
        그 값은 브라우저가 들고 있던 것이고, 화면을 옮기면서 사라진다.
        주소를 다시 넣어야 한다는 것을 분명히 말한다.
      */}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error} 주소를 다시 넣고 읽어 와 주세요.
        </p>
      ) : null}

      <WebsiteForm />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
