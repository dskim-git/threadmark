"use client";

import { useState } from "react";

import {
  MUSIC_SEARCH_SITES,
  buildSearchTerm,
  buildSearchUrl,
} from "@/lib/music/search-links";

/**
 * 들을 수 있는 곳을 찾는 자리. (설계 문서 13.3절, 13.6절)
 *
 * 서비스의 **검색 화면을 열어준다.** 거기서 곡을 찾아 주소를 복사해 아래
 * 칸에 붙여넣는다.
 *
 * 찾아오기에서 얻은 Apple Music 링크는 여기가 아니라 **후보 목록에서 바로**
 * 담는다. 그 값이 거기에 있기 때문이다. (music-profile-form.tsx)
 *
 * **여기서 여는 것은 그 곡의 링크가 아니라 검색 화면이다.** 검색 주소를 담으면
 * 목록에 `YouTube`라고 뜨는데 눌러보면 검색 결과다. 그 곡이 아니다.
 * 그래서 여는 것만 하고 담지는 않는다. (search-links.ts)
 *
 * 검색어를 주소로 넘길 수 있는지 **아직 확인하지 않았다.** 확인은 사람이
 * 브라우저에서 눌러봐야 한다. (8.5절에서 두 번 틀렸다) 그래서 지금은 전부
 * 검색어를 **클립보드에 복사해 두고** 검색 화면만 연다. 어느 사이트에서도
 * 틀리지 않는 방식이다.
 */
export function MusicFindLinks({
  title,
  artist,
}: {
  title: string;
  artist: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const term = buildSearchTerm(title, artist);
  const canSearch = term.length > 0;

  async function handleOpen(url: string, copyTerm: boolean) {
    if (copyTerm) {
      try {
        await navigator.clipboard.writeText(term);
        setFailed(false);
        setMessage(`\`${term}\`을(를) 복사했습니다. 검색칸에 붙여넣어 주세요.`);
      } catch {
        // 복사가 막힌 브라우저가 있다. 창은 그래도 연다.
        setFailed(false);
        setMessage(`검색칸에 \`${term}\`을(를) 적어 주세요.`);
      }
    }

    window.open(url, "_blank", "noreferrer,noopener");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.06] p-4 dark:border-white/[.1]">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        들을 곳 찾기
      </p>

      {canSearch ? (
        <>
          <p className="text-xs leading-5 text-zinc-500">
            아래를 누르면 그 서비스의 검색 화면이 열리고 검색어가 복사됩니다.
            곡을 찾아 주소를 복사해 아래 `링크 담기` 칸에 붙여넣으세요.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {MUSIC_SEARCH_SITES.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() =>
                  void handleOpen(
                    buildSearchUrl(site, title, artist),
                    site.mode === "copy",
                  )
                }
                className="rounded-full border border-black/[.08] px-3 py-1 text-xs text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
              >
                {site.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs leading-5 text-zinc-500">
          곡 이름을 먼저 적으면 검색 바로가기가 나옵니다.
        </p>
      )}

      {message ? (
        <p
          className={
            failed
              ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
              : "text-xs leading-5 text-zinc-600 dark:text-zinc-400"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
