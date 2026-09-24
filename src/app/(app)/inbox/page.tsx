import type { Metadata } from "next";
import Link from "next/link";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { AutoNotice } from "@/app/(app)/auto-notice";
import { HelpButton } from "@/app/(app)/help-button";
import { StarFilter } from "@/app/(app)/star-filter";
import { requireActiveAccount } from "@/lib/auth/account";
import { countCaptureStars, listInboxCaptures } from "@/lib/captures/queries";
import { listProjectChips } from "@/lib/projects/queries";
import { STARRED_ON, STARRED_PARAM, readStarredOnly } from "@/lib/stars";
import {
  getTagBySlug,
  listCaptureIdsForTag,
  listTags,
  listTagsForCaptures,
  listTagsWithCounts,
} from "@/lib/tags/queries";

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
  const starredOnly = readStarredOnly(firstValue(params[STARRED_PARAM]));

  /*
    태그로 거르기. (설계 문서 20-1절)

    주소에는 태그 이름(slug)이 들어간다. 모르는 이름이 오면 거르지 않고
    화면이 "그런 태그가 없다"고 알린다. 빈 목록만 보여주면 기록이 사라진
    것처럼 보인다.
  */
  const tagSlug = firstValue(params.tag);
  const activeTag = tagSlug ? await getTagBySlug(tagSlug) : null;
  const taggedIds = activeTag
    ? await listCaptureIdsForTag(activeTag.id)
    : undefined;

  const [captures, projects, counts, allTags, tagCounts] = await Promise.all([
    listInboxCaptures(starredOnly, taggedIds),
    listProjectChips(),
    countCaptureStars(null),
    listTags(),
    listTagsWithCounts(),
  ]);

  // 기록 id를 다 안 뒤에야 태그를 물어볼 수 있다. 한 번에 묶어서 가져온다.
  const captureTags = await listTagsForCaptures(
    captures.map((capture) => capture.id),
  );

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  /*
    별을 달고 뗄 때 돌아올 자리. 지금 보고 있는 걸러진 상태를 그대로 지킨다.
    별만 보는 중에 별을 떼면 그 줄이 목록에서 빠지는데, 그때 걸러진 상태가
    풀려 전체가 나오면 어디를 보고 있었는지 잃는다.
  */
  /** 지금 고른 것을 지키면서 하나만 바꾼 주소. */
  const linkTo = (next: { starred?: boolean; tag?: string | null }) => {
    const query = new URLSearchParams();

    if (next.starred ?? starredOnly) {
      query.set(STARRED_PARAM, STARRED_ON);
    }

    const nextTag = next.tag === undefined ? (tagSlug ?? null) : next.tag;

    if (nextTag) {
      query.set("tag", nextTag);
    }

    const text = query.toString();

    return text.length > 0 ? `/inbox?${text}` : "/inbox";
  };

  const returnTo = linkTo({});

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            빠른 기록
          </h1>
          <HelpButton topic="inbox" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          자료에 붙이지 않은 기록 {counts.total}건
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
        <AutoNotice>{notice}</AutoNotice>
      ) : null}

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-medium text-black dark:text-zinc-50">
          새 기록
        </h2>
        <CaptureForm
          action={createCapture}
          submitLabel="기록하기"
          /*
            새로 적은 기록에는 아직 별이 없다. 별만 보는 중에 적었다고 해서
            걸러진 자리로 돌려보내면, 방금 적은 것이 보이지 않는다.
            그래서 여기만 전체 목록으로 돌아간다.
          */
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

      {tagSlug && !activeTag ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          `{tagSlug}` 태그를 찾지 못했습니다. 지워졌거나 주소가 잘못된 것
          같습니다. 아래는 거르지 않은 전체 목록입니다.
        </p>
      ) : null}

      {/*
        태그 고르는 줄. 기록에 달린 태그만 보여준다.
        자료에만 달린 태그를 여기 늘어놓으면 눌러도 빈 목록이 나온다.
      */}
      {tagCounts.some((tag) => tag.captureCount > 0) ? (
        <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs text-zinc-500">태그</span>
          {tagCounts
            .filter((tag) => tag.captureCount > 0)
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
                  {tag.name} {tag.captureCount}
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              남긴 기록
            </h2>
            <HelpButton topic="capture-types" label="기록의 종류" />
          </div>
          <StarFilter
            allHref={linkTo({ starred: false })}
            starredHref={linkTo({ starred: true })}
            total={counts.total}
            starred={counts.starred}
            starredOnly={starredOnly}
          />
        </div>
        <CaptureList
          captures={captures}
          returnTo={returnTo}
          projects={projects}
          captureTags={captureTags}
          allTags={allTags}
          emptyText={
            activeTag
              ? `\`${activeTag.name}\` 태그를 단 기록이 없습니다.`
              : starredOnly
                ? "별을 단 기록이 없습니다."
                : "아직 남긴 기록이 없습니다. 위에서 바로 적어보세요."
          }
        />
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
