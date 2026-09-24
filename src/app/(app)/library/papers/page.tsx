import type { Metadata } from "next";
import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";
import { toDoiUrl } from "@/lib/papers/apa";
import { listPapers } from "@/lib/papers/queries";
import { PAPER_SORTS, readPaperSort } from "@/lib/sources/sorting";

export const metadata: Metadata = {
  title: "논문 · ThreadMark",
  description: "저장한 논문을 참고문헌 형태로 모아 봅니다.",
};

/**
 * 논문 목록. (설계 문서 21절의 `/library/papers`)
 *
 * 내 자료 목록(`/library?type=paper`)과 무엇이 다른가.
 * 거기는 제목과 부제를 보여준다. 여기는 **참고문헌**을 보여준다.
 * 논문을 다시 찾을 때 필요한 것이 그것이고, 논문을 쓸 때 통째로 복사해
 * 가져가는 것도 그것이다.
 *
 * 기본은 발행 연도 내림차순이다. 최근 것부터 보는 것이 연구에서 더 잦다.
 * 연도를 모르는 논문은 **어느 방향으로 정렬하든** 뒤로 보낸다. 오래된 순에서
 * 앞으로 오면 연도를 모르는 것이 가장 오래된 것처럼 보인다.
 *
 * 정렬 항목이 자료 목록과 다르다. 그쪽은 제목으로 찾고 여기는 참고문헌을
 * 본다. `참고문헌 가나다순`은 원고의 참고문헌 목록을 그대로 옮겨 적을 때 쓴다.
 *
 * 서지 정보를 아직 적지 않은 논문도 함께 보여준다. 감추면 무엇을 적어야
 * 하는지 알 방법이 없다.
 */
export default async function PapersPage({
  searchParams,
}: PageProps<"/library/papers">) {
  await requireActiveAccount("/library/papers");

  const params = await searchParams;
  const raw = params.sort;
  const sort = readPaperSort(Array.isArray(raw) ? raw[0] : raw);

  const papers = await listPapers(sort);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl text-black dark:text-zinc-50">논문</h1>
            <HelpButton topic="paper" label="논문 정보" />
          </div>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {papers.length}편 · 참고문헌은 APA 7판으로 만듭니다
          </p>
        </div>

        <Link
          href="/sources/new?type=paper"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium leading-[2.75rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          논문 등록
        </Link>
      </header>

      {papers.length > 1 ? (
        <div className="no-scrollbar flex gap-4 overflow-x-auto border-y border-black/[.06] py-2 dark:border-white/[.08]">
          {PAPER_SORTS.map((item) => (
            <Link
              key={item.value}
              href={
                item.value === "year_desc"
                  ? "/library/papers"
                  : `/library/papers?sort=${item.value}`
              }
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
      ) : null}

      {papers.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-sm leading-6 text-zinc-500 dark:bg-white/[.04]">
          아직 등록한 논문이 없습니다. 논문을 등록하고 저자와 학술지를 적어두면
          참고문헌이 만들어집니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {papers.map((paper) => (
            <li
              key={paper.sourceId}
              className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/sources/${paper.sourceId}`}
                  className="text-sm font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  {paper.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {/*
                    읽을 후보는 참고문헌이 비어 있는 것이 정상이다.
                    표시가 없으면 "왜 이것만 비었지"를 묻게 된다. (8.4절)
                  */}
                  {paper.readingCandidate ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                      읽을 후보
                    </span>
                  ) : null}
                  {paper.publicationYear ?? "연도 모름"}
                  {paper.citationEdited ? " · 직접 고친 참고문헌" : ""}
                </span>
              </div>

              {/* 고를 수 있게 둔다. 논문에 붙여넣는 것이 이 자리의 쓰임이다. */}
              <p className="select-all text-sm leading-7 text-zinc-700 dark:text-zinc-300">
                {paper.citation}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={`/sources/${paper.sourceId}/paper`}
                  className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  논문 정보 고치기
                </Link>

                {paper.doi ? (
                  <a
                    href={toDoiUrl(paper.doi)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    DOI로 열기
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
