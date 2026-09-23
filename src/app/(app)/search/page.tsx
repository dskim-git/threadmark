import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import { normalizeSearchTerm } from "@/lib/search/query";
import { SEARCH_LIMIT, search } from "@/lib/search/queries";
import { getSourceTypeLabel, isReadingCandidate } from "@/lib/sources/types";

export const metadata: Metadata = {
  title: "찾기 · ThreadMark",
  description: "담아둔 자료와 기록에서 글자로 찾습니다.",
};

/**
 * 앱 안에서 글자로 찾기. (설계 문서 22절 "기본 키워드 검색")
 *
 * 설계 문서 21절의 경로 목록에 `/ai-search`는 있고 이 경로는 없었다.
 * 22절이 MVP에 "기본 키워드 검색"을 넣어두었으므로 만들면서 경로를 정했다.
 * 19절의 AI 검색은 "키워드 검색 + 벡터 검색"으로 시작하므로, 여기서 만든
 * 것이 나중에 그 절반이 된다.
 *
 * 검색어는 주소에 남는다. 새로고침해도 결과가 그대로 있고, 자주 쓰는
 * 검색은 즐겨찾기에 담을 수 있다. 브라우저에서 도는 코드가 없다.
 */
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  await requireActiveAccount("/search");

  const params = await searchParams;
  const raw = params.q;
  const typed = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const term = normalizeSearchTerm(typed);

  const results = term ? await search(term) : null;
  const found = results
    ? results.sources.length + results.captures.length
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-black dark:text-zinc-50">찾기</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          자료의 제목과 설명, 기록의 글에서 찾습니다. 붙여 쓴 말 안에서도
          찾으니 일부만 적어도 됩니다.
        </p>
      </header>

      <form action="/search" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          검색어
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={typed}
          autoFocus
          placeholder="모델링, Blum, 표본"
          className="h-11 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          찾기
        </button>
      </form>

      {results === null ? null : found === 0 ? (
        <p className="rounded-2xl bg-white px-6 py-12 text-center text-sm leading-6 text-zinc-500 dark:bg-zinc-950">
          <strong className="text-black dark:text-zinc-50">{term}</strong>
          (으)로 찾은 것이 없습니다. 더 짧게 적어보세요.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            자료 {results.sources.length}건 · 기록 {results.captures.length}건
            {results.sources.length === SEARCH_LIMIT ||
            results.captures.length === SEARCH_LIMIT
              ? ` (${SEARCH_LIMIT}건까지만 보여줍니다. 검색어를 좁혀 주세요)`
              : ""}
          </p>

          {results.sources.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                자료
              </h2>

              <ul className="flex flex-col">
                {results.sources.map((source) => (
                  <li
                    key={source.id}
                    className="border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
                  >
                    <Link
                      href={`/sources/${source.id}`}
                      className="flex flex-col gap-1 py-3 transition-colors hover:text-accent dark:hover:text-accent-dark"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-xs text-zinc-500">
                          {getSourceTypeLabel(source.type)}
                        </span>
                        <span className="text-sm text-black dark:text-zinc-50">
                          {source.title}
                        </span>
                        {isReadingCandidate(source.status) ? (
                          <span className="text-xs text-accent dark:text-accent-dark">
                            읽을 후보
                          </span>
                        ) : null}
                      </span>

                      {source.subtitle || source.description ? (
                        <span className="line-clamp-1 text-xs leading-5 text-zinc-500">
                          {source.subtitle ?? source.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {results.captures.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                기록
              </h2>

              <ul className="flex flex-col gap-2">
                {results.captures.map((capture) => (
                  <li
                    key={capture.id}
                    className="flex flex-col gap-2 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-xs text-zinc-500">
                        {getCaptureTypeLabel(capture.captureType)}
                      </span>
                      {/*
                        어느 자료에서 나온 기록인지 보여준다. 기록만 늘어놓으면
                        인용 한 줄이 어디서 왔는지 알 수 없어 쓸모가 없다.
                      */}
                      {capture.sourceId && capture.sourceTitle ? (
                        <Link
                          href={`/sources/${capture.sourceId}`}
                          className="text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                        >
                          {capture.sourceTitle}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          자료에 붙지 않은 기록
                        </span>
                      )}
                    </div>

                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                      {capture.content ?? capture.originalText}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
