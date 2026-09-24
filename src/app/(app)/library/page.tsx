import type { Metadata } from "next";
import Link from "next/link";

import { AutoNotice } from "@/app/(app)/auto-notice";
import { HelpButton } from "@/app/(app)/help-button";
import { StarButton } from "@/app/(app)/star-button";
import { TagChips } from "@/app/(app)/tag-editor";
import { requireActiveAccount } from "@/lib/auth/account";
import { countSources, listSources } from "@/lib/sources/queries";
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
import { STARRED_ON, STARRED_PARAM, readStarredOnly } from "@/lib/stars";
import {
  getTagBySlug,
  listSourceIdsForTag,
  listTagsForSources,
  listTagsWithCounts,
} from "@/lib/tags/queries";

import { toggleSourceStar } from "../sources/actions";

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
  const starredOnly = readStarredOnly(firstValue(params[STARRED_PARAM]));

  /*
    태그로 거르기. (설계 문서 20-1절)

    주소에는 태그 이름(slug)이 들어간다. id를 넣으면 주소가 읽을 수 없는 글이
    되고, 태그를 지웠다 다시 만들면 담아둔 즐겨찾기가 끊긴다.

    모르는 태그 이름이 오면 거르지 않는다. 주소는 사용자가 고쳐 쓸 수 있고,
    지운 태그의 주소가 즐겨찾기에 남아 있을 수 있다. 빈 목록을 보여주면
    자료가 사라진 것처럼 보인다. 대신 화면이 "그런 태그가 없다"고 알린다.
  */
  const tagSlug = firstValue(params.tag);
  const activeTag = tagSlug ? await getTagBySlug(tagSlug) : null;
  const taggedIds = activeTag
    ? await listSourceIdsForTag(activeTag.id)
    : undefined;

  const [sources, counts, allTags] = await Promise.all([
    listSources(activeType, sort, starredOnly, taggedIds),
    countSources(),
    listTagsWithCounts(),
  ]);

  // 카드마다 보여줄 태그. 한 번에 묶어서 가져온다.
  const sourceTags = await listTagsForSources(
    sources.map((source) => source.id),
  );

  const total = counts.total;
  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  /** 지금 고른 값을 지키면서 하나만 바꾼 주소. */
  const linkTo = (next: {
    type?: string | null;
    sort?: SourceSort;
    view?: ListView;
    starred?: boolean;
    tag?: string | null;
  }) => {
    const query = new URLSearchParams();
    const type = next.type === undefined ? activeType : next.type;

    if (type) {
      query.set("type", type);
    }

    if (next.starred ?? starredOnly) {
      query.set(STARRED_PARAM, STARRED_ON);
    }

    // 태그는 고른 채로 유지한다. `tag: null`을 주면 벗긴다.
    const nextTag = next.tag === undefined ? (tagSlug ?? null) : next.tag;

    if (nextTag) {
      query.set("tag", nextTag);
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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl text-black dark:text-zinc-50">내 자료</h1>
            <HelpButton topic="library" />
          </div>
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
        <AutoNotice>{notice}</AutoNotice>
      ) : null}

      {/*
        주소에 태그 이름이 있는데 그런 태그가 없을 때.
        빈 목록만 보여주면 자료가 사라진 것처럼 보인다.
      */}
      {tagSlug && !activeTag ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          `{tagSlug}` 태그를 찾지 못했습니다. 지워졌거나 주소가 잘못된 것 같습니다.
          아래는 거르지 않은 전체 목록입니다.
        </p>
      ) : null}

      {/* 자료가 있는 유형만 보여준다. 빈 유형까지 늘어놓으면 고르기 어렵다. */}
      {total > 0 ? (
        <nav className="no-scrollbar flex gap-2 overflow-x-auto">
          <Chip href={linkTo({ type: null })} active={!activeType}>
            전체 {total}
          </Chip>
          {/*
            별은 유형이 아니라 유형과 겹쳐 쓰는 조건이다. 그래서 유형 칸처럼
            고르면 다른 것이 풀리는 것이 아니라, 지금 보고 있는 유형 위에
            얹히고 다시 누르면 벗겨진다. `논문 중에 별 단 것`이 되는 길이다.

            별을 하나도 달지 않았으면 이 칸을 그리지 않는다. 눌러도 빈
            목록만 나온다.
          */}
          {counts.starred > 0 || starredOnly ? (
            <Chip
              href={linkTo({ starred: !starredOnly })}
              active={starredOnly}
            >
              별 표시 {counts.starred}
            </Chip>
          ) : null}
          {SOURCE_TYPES.filter((type) => (counts.byType[type] ?? 0) > 0).map(
            (type) => (
              <Chip
                key={type}
                href={linkTo({ type })}
                active={activeType === type}
              >
                {getSourceTypeLabel(type)} {counts.byType[type]}
              </Chip>
            ),
          )}
        </nav>
      ) : null}

      {/*
        태그 고르는 줄. 유형·별과 겹쳐 걸린다.

        태그가 달린 자료가 있는 것만 보여준다. 기록에만 달린 태그를 여기
        늘어놓으면 눌러도 빈 목록이 나온다.
      */}
      {allTags.some((tag) => tag.sourceCount > 0) ? (
        <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs text-zinc-500">태그</span>
          <HelpButton topic="tags" className="shrink-0" />
          {allTags
            .filter((tag) => tag.sourceCount > 0)
            .map((tag) => {
              const active = activeTag?.id === tag.id;

              return (
                <Link
                  key={tag.id}
                  href={linkTo({ tag: active ? null : tag.slug })}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white dark:bg-accent-dark dark:text-black"
                      : "shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent transition-opacity hover:opacity-80 dark:bg-accent-dark-soft dark:text-accent-dark"
                  }
                >
                  {tag.name} {tag.sourceCount}
                </Link>
              );
            })}
          <Link
            href="/tags"
            className="shrink-0 text-xs text-zinc-500 underline underline-offset-4 transition-colors hover:text-black dark:hover:text-zinc-50"
          >
            태그 정리
          </Link>
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
                /*
                  별 단추는 카드를 덮는 링크 **밖에** 둔다. form을 a 안에
                  넣으면 올바른 HTML이 아니고, 별을 누르려던 손가락이 자료
                  상세로 가버린다. 겹쳐 놓되 형제로 둔다.
                */
                <li key={source.id} className="relative">
                  <Link
                    href={`/sources/${source.id}`}
                    className="flex h-full flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
                  >
                    {/* 오른쪽 위 별 자리를 비워둔다. 비우지 않으면 꼬리표가 별 밑으로 들어간다. */}
                    <div className="flex flex-wrap items-center gap-2 pr-10">
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

                  {/*
                    태그는 카드를 덮는 링크 밖에 둔다. 링크 안에 링크를 넣을
                    수 없고, 눌렀을 때 그 태그로 걸러지는 편이 쓸모 있다.
                  */}
                  {(sourceTags[source.id] ?? []).length > 0 ? (
                    <div className="px-5 pb-4">
                      <TagChips
                        tags={sourceTags[source.id] ?? []}
                        hrefFor={(tag) => linkTo({ tag: tag.slug })}
                      />
                    </div>
                  ) : null}

                  <StarButton
                    action={toggleSourceStar}
                    id={source.id}
                    starred={source.starred}
                    returnTo={linkTo({})}
                    title="이 자료"
                    className="absolute right-3 top-3"
                  />
                </li>
              ))}
            </ul>
          ) : (
            /*
              목록 보기에는 태그를 그리지 않는다. 이 보기는 제목을 빠르게
              훑으려고 고르는 것인데, 줄마다 꼬리표가 붙으면 그 일이 안 된다.
              태그를 보려면 격자 보기나 자료 화면으로 간다.
            */
            <ul className="flex flex-col">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-center gap-2 border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
                >
                  <Link
                    href={`/sources/${source.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 py-3 transition-colors hover:text-accent dark:hover:text-accent-dark"
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

                  <StarButton
                    action={toggleSourceStar}
                    id={source.id}
                    starred={source.starred}
                    returnTo={linkTo({})}
                    title="이 자료"
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-white px-6 py-12 text-center text-sm leading-6 text-zinc-500 dark:bg-zinc-950">
          {activeTag
            ? `\`${activeTag.name}\` 태그를 단 자료가 없습니다.`
            : starredOnly
            ? "별을 단 자료가 없습니다."
            : activeType
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
