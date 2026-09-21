import type { Metadata } from "next";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { requireActiveAccount } from "@/lib/auth/account";
import { listInboxCaptures } from "@/lib/captures/queries";

export const metadata: Metadata = {
  title: "빠른 기록 · ThreadMark",
  description: "자료에 붙이지 않은 기록을 모아 봅니다.",
};

/**
 * Inbox.
 *
 * 자료 없이 남긴 기록이 모이는 곳이다.
 * 읽다가 떠오른 생각을 먼저 적어두고, 나중에 자료와 연결하거나 정리한다.
 */
export default async function InboxPage({
  searchParams,
}: PageProps<"/inbox">) {
  await requireActiveAccount("/inbox");

  const params = await searchParams;
  const captures = await listInboxCaptures();

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          빠른 기록
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          자료에 붙이지 않은 기록 {captures.length}건
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-medium text-black dark:text-zinc-50">
          새 기록
        </h2>
        <CaptureForm
          action={createCapture}
          submitLabel="기록하기"
          returnTo="/inbox"
          values={{
            sourceId: null,
            captureType: "note",
            content: "",
            originalText: "",
            translatedText: "",
            translationLanguage: "",
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          남긴 기록
        </h2>
        <CaptureList
          captures={captures}
          returnTo="/inbox"
          emptyText="아직 남긴 기록이 없습니다. 위에서 바로 적어보세요."
        />
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
