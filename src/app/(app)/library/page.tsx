import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";
import { countSourcesByType, listSources } from "@/lib/sources/queries";
import {
  DEFAULT_LIST_VIEW,
  SOURCE_SORTS,
  readListView,
  readSourceSort,
  type ListView,
  type SourceSort,
} from "@/lib/sources/sorting";
import {
  SOURCE_TYPES,
  getSourceTypeLabel,
  isReadingCandidate,
  isSourceType,
} from "@/lib/sources/types";

export const metadata: Metadata = {
  title: "내 자료 · ThreadMark",
  description: "저장한 자료를 모아 봅니다.",
};

/**
 * 자료 목록. (설계 문서 21절의 `/library`)
 *
 * 고르는 값 셋이 모두 주소에 남는다. 유형, 정렬, 보기다.
 *
 * 주소에 두는 이유는 셋이다. 새로고침해도 그대로 있고, 즐겨찾기에 담을 수
 * 있고, 브라우저에서 아무것도 돌리지 않아도 된다. 화면 상태를 기억하는
 * 코드를 따로 두지 않는다.
 *
 * 모르는 값이 들어와도 멈추지 않는다. 주소는 사용자가 고쳐 쓸 수 있고,
 * 오래된 즐겨찾기에는 없어진 값이 남아 있을 수 있다. 전부 기본값으로 본다.
 */
export default async function LibraryPage({
  searchParams,
}: PageProps<"/library">) {
  await requireActiveAccount("/library");

  const params = await searchParams;
  const requestedType = firstValue(params.type);
  const activeType = isSourceType(requestedType) ? requestedType : undefined;
  const sort = readSourceSort(firstValue(params.sort));
  const view = readListView(firstValue(params.view));

  const [sources, counts] = await Promise.all([
    listSources(activeType, sort),
    countSourcesByType(),
  ]);

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  /** 지금 고른 값을 지키면서 하나만 바꾼 주소. */
  const linkTo = (next: {
    type?: string | null;
    sort?: SourceSort;
    view?: ListView;
  }) => {
    const query = new URLSearchParams();
    const type = next.type === undefined ? activeType : next.type;

    if (type) {
      query.set("type", type);
    }

    // 기본값은 주소에 적지 않는다. 짧은 주소가 읽기 쉽다.
    const nextSort = next.sort ?? sort;
    if (nextSort !== "recent") {
      query.set("sort", nextSort);
    }

    const nextView = next.view ?? view;
    if (nextView !== DEFAULT_LIST_VIEW) {
      query.set("view", nextView);
    }

    const text = query.toString();

    return text.length > 0 ? `/library?${text}` : "/library";
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl text-black dark:text-zinc-50">내 자료</h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            담아둔 자료 {total}건
          </p>
        </div>

        <Link
          href="/sources/new"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium leading-[2.75rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          자료 담기
        </Link>
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

      {/* 자료가 있는 유형만 보여준다. 빈 유형까지 늘어놓으면 고르기 어렵다. */}
      {total > 0 ? (
        <nav className="no-scrollbar flex gap-2 overflow-x-auto">
          <Chip href={linkTo({ type: null })} active={!activeType}>
            전체 {total}
          </Chip>
          {SOURCE_TYPES.filter((type) => (counts[type] ?? 0) > 0).map((type) => (
            <Chip
              key={type}
              href={linkTo({ type })}
              active={activeType === type}
            >
              {getSourceTypeLabel(type)} {counts[type]}
            </Chip>
          ))}
        </nav>
      ) : null}

      {sources.length > 0 ? (
        <>
          {/*
            정렬과 보기. 글자 링크로 둔다. 선택 상자로 하면 고르고 나서
            한 번 더 눌러야 하거나 브라우저에서 코드를 돌려야 한다.
          */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-black/[.06] py-2 dark:border-white/[.08]">
            <div className="no-scrollbar flex gap-4 overflow-x-auto">
              {SOURCE_SORTS.map((item) => (
                <Link
                  key={item.value}
                  href={linkTo({ sort: item.value })}
                  aria-current={item.value === sort ? "true" : undefined}
                  className={
                    item.value === sort
                      ? "shrink-0 text-xs font-medium text-accent dark:text-accent-dark"
                      : "shrink-0 text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex shrink-0 gap-3">
              <ViewLink href={linkTo({ view: "grid" })} active={view === "grid"}>
                격자
              </ViewLink>
              <ViewLink href={linkTo({ view: "list" })} active={view === "list"}>
                목록
              </ViewLink>
            </div>
          </div>

          {view === "grid" ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {sources.map((source) => (
                <li key={source.id}>
                  <Link
                    href={`/sources/${source.id}`}
                    className="flex h-full flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                        {getSourceTypeLabel(source.type)}
                      </span>
                      {isReadingCandidate(source.status) ? (
                        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                          읽을 후보
                        </span>
                      ) : null}
                    </div>

                    {/* 제목은 두 줄까지. 논문 제목은 길어서 자르지 않으면 칸이 들쭉날쭉해진다. */}
                    <span className="line-clamp-2 text-base leading-7 text-black dark:text-zinc-50">
                      {source.title}
                    </span>

                    {source.subtitle ? (
                      <span className="line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {source.subtitle}
                      </span>
                    ) : null}

                    <span className="mt-auto text-xs text-zinc-500">
                      {formatDate(source.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
                >
                  <Link
                    href={`/sources/${source.id}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 transition-colors hover:text-accent dark:hover:text-accent-dark"
                  >
                    <span className="w-16 shrink-0 text-xs text-zinc-500">
                      {getSourceTypeLabel(source.type)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-black dark:text-zinc-50">
                      {source.title}
                    </span>
                    {isReadingCandidate(source.status) ? (
                      <span className="shrink-0 text-xs text-accent dark:text-accent-dark">
                        읽을 후보
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatDate(source.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-white px-6 py-12 text-center text-sm leading-6 text-zinc-500 dark:bg-zinc-950">
          {activeType
            ? "이 유형으로 담아둔 자료가 없습니다."
            : "아직 담아둔 자료가 없습니다. 오른쪽 위 자료 담기로 시작해 보세요."}
        </p>
      )}
    </div>
  );
}

function Chip({
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
          ? "shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-black"
          : "shrink-0 rounded-full border border-black/[.08] px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
      }
    >
      {children}
    </Link>
  );
}

function ViewLink({
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
      aria-current={active ? "true" : undefined}
      className={
        active
          ? "text-xs font-medium text-black dark:text-zinc-50"
          : "text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
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
