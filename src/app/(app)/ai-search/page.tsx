import type { Metadata } from "next";
import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { isAiSearchConfigured } from "@/lib/ai/anthropic";
import { requireActiveAccount } from "@/lib/auth/account";

import { AskForm } from "./ask-form";

export const metadata: Metadata = {
  title: "AI에게 물어보기 · ThreadMark",
  description: "담아둔 자료와 기록에서 물음에 답합니다.",
};

/**
 * AI에게 물어보기. (설계 문서 19절, 21절의 `/ai-search`)
 *
 * 왜 `/search`와 따로 두는가
 *   21절의 경로 목록에 이 경로가 처음부터 있었다. 그리고 따로 두는 것이
 *   맞기도 하다. **돈이 드는 것과 안 드는 것을 한 단추에 섞지 않는다.**
 *
 *   `/search`는 누르면 곧 결과가 나오고 몇 번을 눌러도 상관없다. 여기는
 *   몇 초 걸리고 한 번에 얼마씩 나간다. 같은 칸에 두면 어느 쪽이 일어날지
 *   사용자가 예측할 수 없다.
 *
 * 설정이 없으면 칸을 잠근다
 *   키가 없을 때 단추만 보여주면 눌러야만 안 된다는 것을 알게 된다.
 *   **눌러야 안 된다는 걸 아는 단추는 없느니만 못하다.** 번역이 같은
 *   처리를 한다. 여기서는 감추지 않고 잠근 뒤 왜인지 적는다. 이 화면은
 *   메뉴에 있어서, 감추면 빈 화면만 남기 때문이다.
 */
export default async function AiSearchPage() {
  await requireActiveAccount("/ai-search");

  const configured = isAiSearchConfigured();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl text-black dark:text-zinc-50">
            AI에게 물어보기
          </h1>
          <HelpButton topic="ai-search" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          담아둔 자료와 기록에서만 찾아 답합니다. 담아둔 것에 없으면 없다고
          말합니다. 낱말이 정확히 기억나지 않아도 됩니다.
        </p>
      </header>

      {configured ? null : (
        <p className="rounded-xl border border-black/[.08] bg-white px-4 py-3 text-sm leading-6 text-zinc-600 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-400">
          이 기능은 아직 설정되지 않았습니다. 운영자에게 알려 주세요. 그동안은{" "}
          <Link
            href="/search"
            className="underline underline-offset-2 hover:text-accent dark:hover:text-accent-dark"
          >
            글자로 찾기
          </Link>
          를 쓰실 수 있습니다.
        </p>
      )}

      <AskForm configured={configured} />

      {/*
        밖으로 나간다는 것을 화면에서 밝힌다. 처리방침에도 적지만, 누르기
        전에 보이는 자리에 한 줄 있는 것과 없는 것이 다르다.
      */}
      <p className="text-xs leading-5 text-zinc-500">
        물음과 찾아낸 기록이 Anthropic(Claude)으로 전송됩니다. 자세한 것은{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-accent dark:hover:text-accent-dark"
        >
          개인정보 처리방침
        </Link>
        에 적어 두었습니다. AI의 답은 틀릴 수 있으니 가리킨 기록을 직접 열어
        확인해 주세요.
      </p>
    </div>
  );
}
