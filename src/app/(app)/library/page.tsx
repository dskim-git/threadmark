import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";
import { countSourcesByType, listSources } from "@/lib/sources/queries";
import { SOURCE_TYPES, getSourceTypeLabel, isSourceType } from "@/lib/sources/types";

export const metadata: Metadata = {
  title: "내 자료 · ThreadMark",
  description: "저장한 자료를 모아 봅니다.",
};

export default async function LibraryPage({
  searchParams,
}: PageProps<"/library">) {
  await requireActiveAccount("/library");

  const params = await searchParams;
  const requestedType = firstValue(params.type);
  const activeType = isSourceType(requestedType) ? requestedType : undefined;

  const [sources, counts] = await Promise.all([
    listSources(activeType),
    countSourcesByType(),
  ]);

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            내 자료
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            저장한 자료 {total}건
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/*
            논문만 모아 보는 화면으로 가는 길. (설계 문서 21절)
            여기는 제목으로 찾는 목록이고, 그쪽은 참고문헌으로 찾는 목록이다.
          */}
          <Link
            href="/library/papers"
            className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            논문 모아 보기
          </Link>

          <Link
            href="/sources/new"
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium leading-[2.75rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            자료 등록
          </Link>
        </div>
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

      {/* 자료가 있는 유형만 필터로 보여준다. 빈 유형까지 늘어놓으면 고르기 어렵다. */}
      <nav className="flex flex-wrap gap-2">
        <FilterLink href="/library" active={!activeType}>
          전체 {total}
        </FilterLink>
        {SOURCE_TYPES.filter((type) => (counts[type] ?? 0) > 0).map((type) => (
          <FilterLink
            key={type}
            href={`/library?type=${type}`}
            active={activeType === type}
          >
            {getSourceTypeLabel(type)} {counts[type]}
          </FilterLink>
        ))}
      </nav>

      {sources.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {sources.map((source) => (
            <li key={source.id}>
              <Link
                href={`/sources/${source.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-white p-5 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                    {getSourceTypeLabel(source.type)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(source.createdAt)}
                  </span>
                </div>

                <span className="text-base font-medium text-black dark:text-zinc-50">
                  {source.title}
                </span>

                {source.subtitle ? (
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {source.subtitle}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
          {activeType
            ? "이 유형으로 저장한 자료가 없습니다."
            : "아직 저장한 자료가 없습니다. 자료 등록으로 시작해 보세요."}
        </p>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
          : "rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
      }
    >
      {children}
    </Link>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
