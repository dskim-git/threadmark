import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { requireActiveAccount } from "@/lib/auth/account";
import { listCapturesForSource } from "@/lib/captures/queries";
import { getSourceById } from "@/lib/sources/queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { deleteSource } from "../actions";

export const metadata: Metadata = {
  title: "자료 · ThreadMark",
};

export default async function SourceDetailPage({
  params,
  searchParams,
}: PageProps<"/sources/[id]">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다.
  // 구분하면 어떤 id가 존재하는지 알려주는 셈이 된다.
  if (!source) {
    notFound();
  }

  const [captures, query] = await Promise.all([
    listCapturesForSource(source.id),
    searchParams,
  ]);

  const error = firstValue(query.error);
  const notice = firstValue(query.notice);
  const returnTo = `/sources/${source.id}`;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href="/library"
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 내 자료
        </Link>
      </nav>

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

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
            {getSourceTypeLabel(source.type)}
          </span>
          <span className="text-xs text-zinc-500">
            등록 {formatDateTime(source.createdAt)}
          </span>
          {source.updatedAt !== source.createdAt ? (
            <span className="text-xs text-zinc-500">
              수정 {formatDateTime(source.updatedAt)}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl font-semibold leading-9 tracking-tight text-black dark:text-zinc-50">
          {source.title}
        </h1>

        {source.subtitle ? (
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            {source.subtitle}
          </p>
        ) : null}
      </header>

      {source.originalUrl ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            원본 주소
          </h2>
          {/*
            저장 시점에 http/https만 통과시키므로 링크로 만들어도 안전하다.
            외부로 나가는 링크이므로 referrer와 opener를 넘기지 않는다.
          */}
          <a
            href={source.originalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-sm text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
          >
            {source.originalUrl}
          </a>
        </section>
      ) : null}

      {source.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            설명
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {source.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-8 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          기록 {captures.length}건
        </h2>
        <CaptureList
          captures={captures}
          returnTo={returnTo}
          emptyText="아직 이 자료에 남긴 기록이 없습니다."
        />
      </section>

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-medium text-black dark:text-zinc-50">
          새 기록
        </h2>
        <CaptureForm
          action={createCapture}
          submitLabel="기록하기"
          returnTo={returnTo}
          compact
          values={{
            sourceId: source.id,
            captureType: "quote",
            content: "",
            originalText: "",
            translatedText: "",
            translationLanguage: "",
          }}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <Link
          href={`/sources/${source.id}/edit`}
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          수정
        </Link>

        {/* 삭제는 표시만 남긴다. 되살릴 수 있어야 하기 때문이다. */}
        <form action={deleteSource}>
          <input type="hidden" name="id" value={source.id} />
          <button
            type="submit"
            className="h-11 rounded-full border border-red-300 px-6 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            삭제
          </button>
        </form>
      </div>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
