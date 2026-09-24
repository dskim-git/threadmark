import type { Metadata } from "next";

import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";

import { SearchLinks } from "./search-links";

export const metadata: Metadata = {
  title: "연구 검색 · ThreadMark",
  description: "논문 검색 사이트로 한 번에 갑니다.",
};

/**
 * 논문 검색 허브. (설계 문서 8.5절, 경로는 21절)
 *
 * 설계 문서가 정한 범위를 그대로 지킨다.
 *
 *   MVP는 사이트 검색 바로가기를 제공한다.
 *   Google Scholar 비공식 스크래핑에 의존하지 않는다.
 *
 * 그래서 여기에는 검색 결과가 없다. 검색은 그 사이트에서 이루어진다.
 * 우리가 하는 일은 검색어를 받아 여덟 곳으로 가는 길을 한꺼번에 여는 것뿐이다.
 *
 * 그것만으로도 쓸모가 있는 이유가 있다. 한글 제목으로 논문을 찾을 길이 지금
 * 우리에게 없다. Crossref에는 한글 제목 데이터가 아예 없다. (8.5-1절)
 * 찾는 일은 국내 사이트에서 하고, 찾은 뒤 DOI나 RIS를 가져와 붙여넣는 것이
 * 지금 가능한 가장 빠른 길이다.
 */
export default async function ResearchSearchPage({
  searchParams,
}: PageProps<"/research/search">) {
  await requireActiveAccount("/research/search");

  const params = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
  <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            연구 검색
          </h1>
          <HelpButton topic="research-search" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          논문을 찾는 사이트로 한 번에 갑니다. 무엇을 찾는지는 그 사이트만
          알고 ThreadMark는 기록하지 않습니다.
        </p>
      </header>

      {/*
        다른 화면에서 제목을 들고 올 수 있게 열어둔다.
        `/research/search?q=제목` 으로 들어오면 그 검색어로 시작한다.
      */}
      <SearchLinks initialQuery={firstValue(params.q) ?? ""} />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
