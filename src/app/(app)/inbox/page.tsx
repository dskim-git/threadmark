import type { Metadata } from "next";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { AutoNotice } from "@/app/(app)/auto-notice";
import { StarFilter } from "@/app/(app)/star-filter";
import { requireActiveAccount } from "@/lib/auth/account";
import { countCaptureStars, listInboxCaptures } from "@/lib/captures/queries";
import { listProjectChips } from "@/lib/projects/queries";
import { STARRED_ON, STARRED_PARAM, readStarredOnly } from "@/lib/stars";

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

  const [captures, projects, counts] = await Promise.all([
    listInboxCaptures(starredOnly),
    listProjectChips(),
    countCaptureStars(null),
  ]);

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  /*
    별을 달고 뗄 때 돌아올 자리. 지금 보고 있는 걸러진 상태를 그대로 지킨다.
    별만 보는 중에 별을 떼면 그 줄이 목록에서 빠지는데, 그때 걸러진 상태가
    풀려 전체가 나오면 어디를 보고 있었는지 잃는다.
  */
  const returnTo = starredOnly ? `/inbox?${STARRED_PARAM}=${STARRED_ON}` : "/inbox";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          빠른 기록
        </h1>
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            남긴 기록
          </h2>
          <StarFilter
            allHref="/inbox"
            starredHref={`/inbox?${STARRED_PARAM}=${STARRED_ON}`}
            total={counts.total}
            starred={counts.starred}
            starredOnly={starredOnly}
          />
        </div>
        <CaptureList
          captures={captures}
          returnTo={returnTo}
          projects={projects}
          emptyText={
            starredOnly
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
