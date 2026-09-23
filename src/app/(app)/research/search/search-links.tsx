"use client";

import { useState } from "react";

import {
  SEARCH_SITES,
  buildSearchUrl,
  isUsableQuery,
  needsClipboard,
  type SearchSite,
} from "@/lib/papers/search-sites";

/**
 * 검색어를 적으면 여덟 사이트로 가는 길이 한꺼번에 열린다. (설계 문서 8.5절)
 *
 * 브라우저에서 도는 이유는, 글자를 칠 때마다 주소가 따라 바뀌어야 하기
 * 때문이다. 서버를 한 번 다녀오게 하면 검색어를 고칠 때마다 화면이 깜빡인다.
 *
 * 여기서 밖으로 나가는 요청은 없다. 주소를 만들어 새 탭을 여는 것이 전부다.
 * 무엇을 찾는지는 그 사이트만 알고 우리는 모른다.
 *
 * 사이트마다 다루는 방법이 다르다. 검색어를 주소로 받는 곳은 그대로 열고,
 * 받지 않는 곳(KCI)은 검색어를 복사해 두고 검색 화면만 연다.
 * 되는 척하면 사용자는 우리 기능이 고장 난 줄 안다.
 */
export function SearchLinks({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  /** 방금 검색어를 복사해 둔 사이트. 안내를 잠깐 보여주는 데 쓴다. */
  const [copied, setCopied] = useState<string | null>(null);

  const usable = isUsableQuery(query);
  const korean = SEARCH_SITES.filter((site) => site.korean);
  const foreign = SEARCH_SITES.filter((site) => !site.korean);

  async function openWithClipboard(site: SearchSite) {
    /*
      복사가 먼저다. 새 탭을 먼저 열면 이 창이 뒤로 가면서 클립보드 권한을
      잃는 브라우저가 있다.

      복사가 안 되더라도 사이트는 연다. 검색어를 손으로 옮겨 적으면 되고,
      여기서 멈추면 아무것도 못 하게 된다.
    */
    try {
      await navigator.clipboard.writeText(query.trim());
      setCopied(site.id);
    } catch {
      setCopied(null);
    }

    window.open(site.template, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="research-query"
          className="text-sm font-medium text-black dark:text-zinc-50"
        >
          검색어
        </label>
        <input
          id="research-query"
          type="search"
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
            setCopied(null);
          }}
          placeholder="논문 제목이나 주제어"
          className="h-12 rounded-lg border border-black/[.08] bg-white px-4 text-base text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        <p className="text-xs leading-5 text-zinc-500">
          고른 사이트가 새 탭에서 열립니다. 찾은 뒤 DOI나 RIS를 가져와 논문
          정보 화면에 붙여넣으면 서지 정보가 채워집니다.
        </p>
      </div>

      <Group
        title="국내"
        hint="한글 제목으로 찾을 수 있는 곳입니다."
        sites={korean}
        query={query}
        usable={usable}
        copied={copied}
        onCopyOpen={openWithClipboard}
      />

      <Group
        title="국제"
        hint="영문 제목이나 DOI로 찾습니다."
        sites={foreign}
        query={query}
        usable={usable}
        copied={copied}
        onCopyOpen={openWithClipboard}
      />
    </div>
  );
}

function Group({
  title,
  hint,
  sites,
  query,
  usable,
  copied,
  onCopyOpen,
}: {
  title: string;
  hint: string;
  sites: readonly SearchSite[];
  query: string;
  usable: boolean;
  copied: string | null;
  onCopyOpen: (site: SearchSite) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          {title}
        </h2>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {sites.map((site) => (
          <li key={site.id}>
            <SiteCard
              site={site}
              query={query}
              usable={usable}
              copied={copied === site.id}
              onCopyOpen={onCopyOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const CARD_CLASS =
  "flex w-full flex-col gap-1 rounded-2xl border border-black/[.08] bg-white p-4 text-left transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:bg-zinc-950 dark:hover:bg-white/[.06]";

function SiteCard({
  site,
  query,
  usable,
  copied,
  onCopyOpen,
}: {
  site: SearchSite;
  query: string;
  usable: boolean;
  copied: boolean;
  onCopyOpen: (site: SearchSite) => void;
}) {
  const body = (
    <>
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          {site.name}
        </span>
        {needsClipboard(site) ? (
          <span className="text-[0.65rem] text-amber-700 dark:text-amber-400">
            검색어 복사 후 열림
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-5 text-zinc-500">{site.note}</span>
      {copied ? (
        <span className="text-xs leading-5 text-emerald-700 dark:text-emerald-400">
          검색어를 복사했습니다. 그 사이트의 검색칸에 붙여넣어 주세요.
        </span>
      ) : null}
    </>
  );

  if (!usable) {
    return (
      <div className={`${CARD_CLASS} cursor-not-allowed opacity-50`}>{body}</div>
    );
  }

  /*
    검색어를 주소로 받지 않는 곳이다. 복사해 두고 검색 화면만 연다.
    링크가 아니라 버튼인 이유는, 누를 때 복사를 먼저 해야 하기 때문이다.
  */
  if (needsClipboard(site)) {
    return (
      <button type="button" onClick={() => onCopyOpen(site)} className={CARD_CLASS}>
        {body}
      </button>
    );
  }

  return (
    /*
      밖으로 나가는 링크라 referrer와 opener를 넘기지 않는다.
      지금까지 만든 다른 외부 링크와 같은 처리다.
    */
    <a
      href={buildSearchUrl(site, query)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={CARD_CLASS}
    >
      {body}
    </a>
  );
}
