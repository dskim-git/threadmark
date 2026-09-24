"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/app/(app)/panel";
import type { MediaProfile } from "@/lib/media/queries";
import type { WorkCandidate } from "@/lib/media/tmdb";
import {
  formatRuntime,
  getMediaKindLabel,
  type MediaKind,
} from "@/lib/media/works";
import { MAX_TITLE_LENGTH } from "@/lib/sources/schema";

import { findWorks, loadWorkDetail, saveMediaWork } from "./media-actions";

/**
 * 영화·드라마 칸. 제목으로 찾아 고르고 채운다. (설계 문서 15절)
 *
 * **후보를 늘어놓고 사람이 고른다.** 같은 제목의 영화가 여럿이고
 * (리메이크, 같은 이름의 다른 작품), 영화와 드라마가 같은 이름을 쓰는 일도
 * 흔하다. 우리가 하나를 정하면 틀린 값이 조용히 들어간다.
 *
 * **고른 뒤에도 후보 목록을 감추지 않는다.** 잘못 골랐을 때 바로 다른 것을
 * 누를 수 있어야 한다. (AGENTS.md 2절)
 *
 * **찾는 칸과 적는 칸을 나누지 않는다.** 제목 칸 자체가 검색어다. 음악에서
 * 둘로 나눴다가 값이 두 벌이 되어 어긋났다.
 *
 * 저장을 누르기 전에는 아무것도 저장되지 않고 바뀐 값이 바로 칸에 보인다.
 * 그 둘이 있어서 덮어써도 위험하지 않다.
 */
export function MediaPanel({
  sourceId,
  sourceTitle,
  description,
  thumbnailUrl,
  profile,
  returnTo,
}: {
  sourceId: string;
  sourceTitle: string;
  description: string | null;
  thumbnailUrl: string | null;
  profile: MediaProfile | null;
  returnTo: string;
}) {
  const [title, setTitle] = useState(sourceTitle);
  const [overview, setOverview] = useState(description ?? "");
  const [poster, setPoster] = useState(thumbnailUrl ?? "");

  const [kind, setKind] = useState<MediaKind | "">(profile?.kind ?? "");
  const [tmdbId, setTmdbId] = useState(
    profile ? String(profile.tmdbId) : "",
  );
  const [originalTitle, setOriginalTitle] = useState(
    profile?.originalTitle ?? "",
  );
  const [releasedOn, setReleasedOn] = useState(profile?.releasedOn ?? "");
  const [genres, setGenres] = useState((profile?.genres ?? []).join(", "));
  const [castNames, setCastNames] = useState(
    (profile?.castNames ?? []).join(", "),
  );
  const [runtimeMinutes, setRuntimeMinutes] = useState(
    profile?.runtimeMinutes === null || profile?.runtimeMinutes === undefined
      ? ""
      : String(profile.runtimeMinutes),
  );
  const [seasonCount, setSeasonCount] = useState(
    profile?.seasonCount === null || profile?.seasonCount === undefined
      ? ""
      : String(profile.seasonCount),
  );
  const [episodeCount, setEpisodeCount] = useState(
    profile?.episodeCount === null || profile?.episodeCount === undefined
      ? ""
      : String(profile.episodeCount),
  );

  const [candidates, setCandidates] = useState<WorkCandidate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function search() {
    const query = title.trim();

    if (query === "") {
      setFailed("찾을 제목을 적어 주세요.");

      return;
    }

    startBusy(async () => {
      const result = await findWorks(query);

      if (!result.ok) {
        setFailed(result.message);
        setNotice(null);

        return;
      }

      setCandidates(result.candidates);
      setFailed(null);
      setNotice(
        result.candidates.length === 0
          ? "찾은 작품이 없습니다. 제목을 다르게 적어 보세요."
          : "맞는 것을 눌러 주세요. 누르면 칸이 채워지고, 저장을 눌러야 남습니다.",
      );
    });
  }

  function choose(candidate: WorkCandidate) {
    startBusy(async () => {
      const result = await loadWorkDetail(candidate.kind, candidate.tmdbId);

      if (!result.ok) {
        setFailed(result.message);

        return;
      }

      const work = result.work;

      /*
        **고른 것의 값으로 바꾼다.** 후보를 누른 것이 곧 "이 작품이 맞다"는
        뜻이다. 빈 칸만 채우게 두면 한 작품을 채운 뒤 다른 것으로 바꿀 수
        없다. 음악에서 겪은 고장이다. (AGENTS.md 2절)
      */
      setTitle(work.title.slice(0, MAX_TITLE_LENGTH));
      setOverview(work.overview ?? "");
      setPoster(work.posterUrl ?? "");
      setKind(work.kind);
      setTmdbId(String(work.tmdbId));
      setOriginalTitle(work.originalTitle ?? "");
      setReleasedOn(work.releasedOn ?? "");
      setGenres(work.genres.join(", "));
      setCastNames(work.castNames.join(", "));
      setRuntimeMinutes(
        work.runtimeMinutes === null ? "" : String(work.runtimeMinutes),
      );
      setSeasonCount(
        work.seasonCount === null ? "" : String(work.seasonCount),
      );
      setEpisodeCount(
        work.episodeCount === null ? "" : String(work.episodeCount),
      );

      setFailed(null);
      setNotice(
        `TMDB에서 가져온 ${getMediaKindLabel(work.kind)} 정보로 채웠습니다. 저장을 눌러야 남습니다.`,
      );
    });
  }

  const runtime = Number(runtimeMinutes);
  const hasRuntime = runtimeMinutes !== "" && Number.isFinite(runtime);

  return (
    <Panel
      title="작품 정보"
      help="media"
      helpLabel="영화·드라마"
      hint="제목으로 찾아 고르면 줄거리·장르·출연진이 채워집니다. 저장을 눌러야 남습니다."
    >
      <form action={saveMediaWork} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="tmdbId" value={tmdbId} />
        <input type="hidden" name="posterUrl" value={poster} />
        <input type="hidden" name="originalTitle" value={originalTitle} />
        <input type="hidden" name="releasedOn" value={releasedOn} />
        <input type="hidden" name="runtimeMinutes" value={runtimeMinutes} />
        <input type="hidden" name="seasonCount" value={seasonCount} />
        <input type="hidden" name="episodeCount" value={episodeCount} />

        {/* 제목 칸이 곧 검색어다. 값이 하나면 어긋날 자리가 없다. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            제목
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="title"
              type="text"
              required
              maxLength={MAX_TITLE_LENGTH}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={search}
              disabled={busy}
              className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              {busy ? "찾는 중…" : "찾기"}
            </button>
          </div>
        </label>

        {failed ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {failed}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
            {notice}
          </p>
        ) : null}

        {/*
          후보 목록. **고른 뒤에도 감추지 않는다.** 잘못 골랐을 때 바로
          다른 것을 누를 수 있어야 한다.
        */}
        {candidates && candidates.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {candidates.map((candidate) => {
              const chosen =
                kind === candidate.kind && tmdbId === String(candidate.tmdbId);

              return (
                <li key={`${candidate.kind}-${candidate.tmdbId}`}>
                  <button
                    type="button"
                    onClick={() => choose(candidate)}
                    disabled={busy}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                      chosen
                        ? "border-accent bg-accent-soft dark:border-accent-dark dark:bg-accent-dark-soft"
                        : "border-black/[.08] hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06]"
                    }`}
                  >
                    {candidate.posterUrl ? (
                      /*
                        **밖에서 온 그림 주소다.** `next/image`를 쓰지 않는
                        이유가 둘이다. 허용 목록을 미리 적어둘 수 없고,
                        무엇보다 그림을 불러올 때 브라우저가 `Referer`를
                        함께 보내 **남의 서버가 우리 앱의 주소를 알게 된다.**
                        포스터 하나 보여주자고 알릴 일이 아니다.
                        (source-thumb.tsx와 같은 판단이다)
                      */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={candidate.posterUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-[69px] w-[46px] shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-[69px] w-[46px] shrink-0 rounded bg-zinc-100 dark:bg-white/[.08]" />
                    )}

                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                          {getMediaKindLabel(candidate.kind)}
                        </span>
                        <span className="text-sm text-black dark:text-zinc-50">
                          {candidate.title}
                        </span>
                        {/*
                          **연도가 같은 제목을 가른다.** 리메이크와 같은
                          이름의 다른 작품이 흔해서, 연도 없이는 고를 수 없다.
                        */}
                        {candidate.year ? (
                          <span className="shrink-0 text-xs text-zinc-500">
                            {candidate.year}
                          </span>
                        ) : null}
                        {chosen ? (
                          <span className="shrink-0 text-[11px] text-accent dark:text-accent-dark">
                            고름
                          </span>
                        ) : null}
                      </span>

                      {candidate.originalTitle &&
                      candidate.originalTitle !== candidate.title ? (
                        <span className="truncate text-xs text-zinc-500">
                          {candidate.originalTitle}
                        </span>
                      ) : null}

                      {candidate.overview ? (
                        <span className="line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                          {candidate.overview}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            줄거리
          </span>
          <textarea
            name="description"
            rows={4}
            maxLength={5000}
            value={overview}
            onChange={(event) => setOverview(event.target.value)}
            placeholder="찾아 고르면 채워집니다. 직접 적어도 됩니다."
            className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        <div className="flex flex-col gap-4 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              장르
            </span>
            <input
              name="genres"
              type="text"
              value={genres}
              onChange={(event) => setGenres(event.target.value)}
              placeholder="쉼표로 나눠 적습니다"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>

          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              출연
            </span>
            <input
              name="castNames"
              type="text"
              value={castNames}
              onChange={(event) => setCastNames(event.target.value)}
              placeholder="쉼표로 나눠 적습니다"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
        </div>

        {/*
          찾아온 값 중 사람이 고칠 일이 없는 것은 읽기만 보여준다.
          칸으로 두면 고쳐도 되는 값처럼 보이고, 실제로 고치면 TMDB가 말한
          것과 우리가 적어둔 것이 어긋난다.
        */}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-xs dark:bg-white/[.04]">
          <div className="flex gap-2">
            <dt className="text-zinc-500">갈래</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {kind === "" ? "아직 고르지 않음" : getMediaKindLabel(kind)}
            </dd>
          </div>

          <div className="flex gap-2">
            <dt className="text-zinc-500">개봉</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {releasedOn === "" ? "모름" : releasedOn}
            </dd>
          </div>

          <div className="flex gap-2">
            <dt className="text-zinc-500">길이</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {hasRuntime ? formatRuntime(runtime) : "모름"}
            </dd>
          </div>

          {/* 시즌과 회차는 드라마에만 있다. 영화에서는 줄 자체를 만들지 않는다. */}
          {kind === "tv" ? (
            <div className="flex gap-2">
              <dt className="text-zinc-500">시즌·회차</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {seasonCount === "" ? "모름" : `시즌 ${seasonCount}`}
                {episodeCount === "" ? "" : ` · ${episodeCount}회`}
              </dd>
            </div>
          ) : null}

          {originalTitle ? (
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-zinc-500">원제</dt>
              <dd className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                {originalTitle}
              </dd>
            </div>
          ) : null}

          {profile?.fetchedAt ? (
            <div className="flex gap-2">
              <dt className="text-zinc-500">받아온 때</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {profile.fetchedAt.slice(0, 10)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          {/*
            고르지 않으면 저장할 수 없다.

            `tmdb_id`와 `media_kind`는 비울 수 없는 칸이다. 고르기 전에
            저장을 누르면 거절되는데, **왜 거절됐는지 단추만 보고는 알 수
            없다.** 아예 누를 수 없게 하고 그 까닭을 옆에 적는다.
          */}
          <button
            type="submit"
            disabled={kind === "" || tmdbId === ""}
            className="h-10 shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>

          {kind === "" || tmdbId === "" ? (
            <span className="text-xs text-zinc-500">
              먼저 `찾기`를 눌러 작품을 골라 주세요.
            </span>
          ) : (
            <a
              href={`https://www.themoviedb.org/${kind}/${tmdbId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-accent dark:text-zinc-400 dark:hover:text-accent-dark"
            >
              TMDB에서 보기 →
            </a>
          )}
        </div>

        {/*
          출처 표기. (설계 문서 15.1절)

          **가져온 값 옆에 밝힌다.** 표기 화면이 따로 있지만, 이 값들이
          어디서 왔는지는 값을 보는 자리에서 알 수 있어야 한다.
          "왜 제목이 이렇게 나오지"를 묻지 않게 하는 것이기도 하다.
        */}
        <p className="text-xs leading-5 text-zinc-500">
          줄거리·장르·출연·포스터는 TMDB에서 가져온 값입니다.{" "}
          <a
            href="/credits"
            className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
          >
            출처 표기
          </a>
        </p>
      </form>
    </Panel>
  );
}
