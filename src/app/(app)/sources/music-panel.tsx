import { HelpButton } from "@/app/(app)/help-button";
import { MAX_MUSIC_LABEL_LENGTH } from "@/lib/captures/music-locator";
import type { MusicProfile, ProviderLink } from "@/lib/music/queries";

import {
  addProviderLink,
  createMusicTimeCapture,
  removeProviderLink,
} from "./music-actions";
import { MusicWorkspace } from "./music-workspace";

/**
 * 음악 자료의 칸. (설계 문서 13장)
 *
 * 셋을 한자리에 둔다. 곡 정보(13.2절), 들을 수 있는 곳(13.6절), 그리고
 * 재생 시점 메모(13.4절)다.
 *
 * 곡 정보는 **찾아와 채울 수도 있고 손으로 적을 수도 있다.** (13.3절)
 * 찾아오기는 손을 덜어주는 일이지 조건이 아니다. 아주 최근에 나온 곡이나
 * 국내 인디 음악은 아직 등록되지 않은 경우가 있어서, 손으로 적는 길을
 * 그대로 둔다. 웹사이트 담기에서 읽어 오기가 실패해도 담을 수 있게 한 것과
 * 같은 생각이다.
 *
 * 13.6절을 지킨다. 음원 파일을 올리는 자리가 없고, 가사를 받아오는 길도
 * 없다. 짧은 구절은 사용자가 기록에 직접 적는다.
 */
export function MusicPanel({
  sourceId,
  sourceTitle,
  thumbnailUrl,
  profile,
  links,
  returnTo,
}: {
  sourceId: string;
  /** 자료 제목. 찾을 때 곡 이름으로 미리 채워 둔다. */
  sourceTitle: string;
  /** 자료가 들고 있는 표지 주소. 곡 정보 칸에서 함께 고친다. */
  thumbnailUrl: string | null;
  profile: MusicProfile | null;
  links: readonly ProviderLink[];
  returnTo: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/*
        곡 정보와 들을 수 있는 곳. 두 칸이 같은 검색어를 써야 해서 한 칸이
        묶어 들고 있다. (music-workspace.tsx)

        목록과 손으로 담는 칸은 여기서 그려 넘긴다. Server Action을 품고
        있어 브라우저 쪽에서 만들 수 없다.
      */}
      <MusicWorkspace
        sourceId={sourceId}
        sourceTitle={sourceTitle}
        thumbnailUrl={thumbnailUrl}
        profile={profile}
        returnTo={returnTo}
        linksSlot={
          <>
            {links.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-accent underline underline-offset-4 dark:text-accent-dark"
                    >
                      {link.label}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                      {link.url}
                    </span>

                    <form action={removeProviderLink} className="shrink-0">
                      <input type="hidden" name="id" value={link.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-red-700 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        빼기
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}

            <form action={addProviderLink} className="flex flex-wrap gap-2">
              <input type="hidden" name="sourceId" value={sourceId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label htmlFor={`music-link-${sourceId}`} className="sr-only">
                음악 서비스 주소
              </label>
              <input
                id={`music-link-${sourceId}`}
                name="url"
                type="url"
                required
                placeholder="https://open.spotify.com/track/..."
                className="h-10 min-w-60 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
              <button
                type="submit"
                className="h-10 shrink-0 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                링크 담기
              </button>
            </form>

            <p className="text-xs leading-5 text-zinc-500">
              음원 파일은 담지 않습니다. 공식 서비스의 링크만 담습니다. 서비스
              이름은 주소를 보고 알아냅니다.
            </p>
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            그 대목에 기록
          </h2>
          <HelpButton topic="music-time" />
        </div>

        <form action={createMusicTimeCapture} className="flex flex-col gap-3">
          <input type="hidden" name="sourceId" value={sourceId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`music-start-${sourceId}`}
                className="text-xs font-medium text-zinc-500"
              >
                시작
              </label>
              <input
                id={`music-start-${sourceId}`}
                name="start"
                type="text"
                required
                placeholder="1:08"
                className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`music-end-${sourceId}`}
                className="text-xs font-medium text-zinc-500"
              >
                끝 (비워도 됩니다)
              </label>
              <input
                id={`music-end-${sourceId}`}
                name="end"
                type="text"
                placeholder="1:34"
                className="h-10 w-24 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </div>

            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label
                htmlFor={`music-label-${sourceId}`}
                className="text-xs font-medium text-zinc-500"
              >
                그 대목의 이름
              </label>
              <input
                id={`music-label-${sourceId}`}
                name="label"
                type="text"
                maxLength={MAX_MUSIC_LABEL_LENGTH}
                placeholder="2절 후렴"
                className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </div>
          </div>

          <label htmlFor={`music-memo-${sourceId}`} className="sr-only">
            메모
          </label>
          <textarea
            id={`music-memo-${sourceId}`}
            name="content"
            required
            rows={3}
            placeholder="현악기가 들어오면서 분위기가 확장되는 부분. 연구 발표 영상의 도입부와 잘 어울릴 것 같다."
            className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />

          <button
            type="submit"
            className="h-10 w-fit rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            기록하기
          </button>
        </form>

        <p className="text-xs leading-5 text-zinc-500">
          `1:08`, `01:08`, `68` 모두 같은 시점으로 읽습니다. 한 시간이 넘으면
          `1:05:30`처럼 적습니다.
        </p>
      </section>
    </div>
  );
}
