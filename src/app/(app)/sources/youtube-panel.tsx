"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/app/(app)/panel";
import { MAX_TITLE_LENGTH } from "@/lib/sources/schema";
import type { VideoInfo } from "@/lib/youtube/lookup";
import type { YoutubeProfile } from "@/lib/youtube/queries";
import { formatDuration, watchUrl } from "@/lib/youtube/video-id";

import { findVideo, saveVideoProfile } from "./youtube-actions";

/**
 * YouTube 영상 칸. 주소를 넣으면 찾아와 채운다. (설계 문서 14절)
 *
 * **찾는 칸과 적는 칸을 나누지 않는다.** 주소 칸 자체가 검색어이고 `찾기`가
 * 그 옆에 있다. 음악에서 둘로 나눴다가 값이 두 벌이 되어 어긋났다. 값이
 * 하나면 어긋날 자리가 없다. (AGENTS.md 2절)
 *
 * **찾아온 값으로 바꾼다.** 주소를 넣고 `찾기`를 누른 것이 곧 "이 영상이
 * 맞다"는 뜻이다. 빈 칸만 채우게 두면 한 영상을 담은 뒤 다른 것으로 바꿀 수
 * 없다. 음악에서 겪은 고장이다.
 *
 * 저장을 누르기 전에는 아무것도 저장되지 않고 바뀐 값이 바로 칸에 보인다.
 * 그 둘이 있어서 덮어써도 위험하지 않다.
 *
 * **후보를 늘어놓지 않는다.** 책·음악과 다른 점이다. 주소를 넣으면 그 영상
 * 하나가 특정되므로 고를 것이 없다. 대신 어디서 온 값인지 밝힌다.
 */
export function YoutubePanel({
  sourceId,
  sourceTitle,
  profile,
  returnTo,
}: {
  sourceId: string;
  sourceTitle: string;
  profile: YoutubeProfile | null;
  returnTo: string;
}) {
  /*
    사용자가 고친 것만 붙잡는다.

    처음 값은 서버가 보낸 것에서 만든다. 서버가 새 값을 보내면 그것이
    그대로 보인다. (AGENTS.md 6절 `서버가 보낸 목록을 브라우저가 붙잡아
    두지 않는다`)
  */
  const [title, setTitle] = useState(sourceTitle);
  const [videoInput, setVideoInput] = useState(
    profile ? watchUrl(profile.videoId) : "",
  );
  const [channelName, setChannelName] = useState(profile?.channelName ?? "");
  const [publishedAt, setPublishedAt] = useState(profile?.publishedAt ?? "");
  const [durationSeconds, setDurationSeconds] = useState(
    profile?.durationSeconds === null || profile?.durationSeconds === undefined
      ? ""
      : String(profile.durationSeconds),
  );
  const [embeddable, setEmbeddable] = useState(
    profile?.embeddable === null || profile?.embeddable === undefined
      ? ""
      : String(profile.embeddable),
  );

  /** 어디서 온 값인지 밝히는 줄. 밝히지 않으면 "왜 이렇게 나오지"를 묻는다. */
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  function search() {
    const query = videoInput.trim();

    if (query === "") {
      setFailed("영상 주소를 넣어 주세요.");
      setNotice(null);

      return;
    }

    startSearch(async () => {
      const result = await findVideo(query);

      if (!result.ok) {
        setFailed(result.message);
        setNotice(null);

        return;
      }

      apply(result.video);
      setFailed(null);
      setNotice("YouTube에서 가져온 값으로 채웠습니다. 저장을 눌러야 남습니다.");
    });
  }

  function apply(video: VideoInfo) {
    setTitle(video.title.slice(0, MAX_TITLE_LENGTH));
    setVideoInput(video.watchUrl);
    setChannelName(video.channelName ?? "");
    setPublishedAt(video.publishedAt ?? "");
    setDurationSeconds(
      video.durationSeconds === null ? "" : String(video.durationSeconds),
    );
    setEmbeddable(video.embeddable === null ? "" : String(video.embeddable));
  }

  const seconds = Number(durationSeconds);
  const hasDuration = durationSeconds !== "" && Number.isFinite(seconds);

  return (
    <Panel
      title="영상 정보"
      help="youtube"
      helpLabel="YouTube 영상"
      hint="주소를 넣고 `찾기`를 누르면 제목·채널·길이를 가져옵니다. 저장을 눌러야 남습니다."
    >
      <form action={saveVideoProfile} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        {/*
          찾아온 값을 그대로 넘기는 칸들. 사용자가 손으로 적을 값이 아니라
          화면에 보일 이유가 없다. 다만 **숨은 칸이라도 서버가 믿지 않는다.**
        */}
        <input type="hidden" name="publishedAt" value={publishedAt} />
        <input type="hidden" name="durationSeconds" value={durationSeconds} />
        <input type="hidden" name="embeddable" value={embeddable} />

        {/* 주소 칸이 곧 검색어다. 값이 하나면 어긋날 자리가 없다. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            영상 주소
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="videoInput"
              type="text"
              required
              maxLength={2000}
              value={videoInput}
              onChange={(event) => setVideoInput(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="h-10 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              {searching ? "찾는 중…" : "찾기"}
            </button>
          </div>
          <span className="text-xs text-zinc-500">
            공유 주소(`youtu.be/…`)와 쇼츠 주소도 됩니다.
          </span>
        </label>

        {/* 오류는 사라지지 않는다. 못 본 오류는 아무 일도 없었던 것과 같다. */}
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

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            영상 제목
          </span>
          <input
            name="title"
            type="text"
            required
            maxLength={MAX_TITLE_LENGTH}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            채널
          </span>
          <input
            name="channelName"
            type="text"
            maxLength={500}
            value={channelName}
            onChange={(event) => setChannelName(event.target.value)}
            className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        {/*
          찾아온 값 중 사람이 고칠 일이 없는 것은 읽기만 보여준다.
          칸으로 두면 고쳐도 되는 값처럼 보이고, 실제로 고치면 YouTube가
          말한 것과 우리가 적어둔 것이 어긋난다.
        */}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-xs dark:bg-white/[.04]">
          <div className="flex gap-2">
            <dt className="text-zinc-500">길이</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {hasDuration ? formatDuration(seconds) : "모름"}
            </dd>
          </div>

          <div className="flex gap-2">
            <dt className="text-zinc-500">올라온 날</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {publishedAt === "" ? "모름" : publishedAt.slice(0, 10)}
            </dd>
          </div>

          {/*
            앱 안에서 틀 수 있는지.

            **모른다와 못 튼다를 갈라서 보여준다.** 다음 단계에서 이 값으로
            앱 안에서 틀지 바깥으로 보낼지를 정한다. 둘을 뭉뚱그리면 틀 수
            있는 영상까지 바깥으로 나가거나, 못 트는 영상에서 검은 화면이 뜬다.
          */}
          <div className="flex gap-2">
            <dt className="text-zinc-500">앱에서 재생</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {embeddable === ""
                ? "모름"
                : embeddable === "true"
                  ? "가능"
                  : "막혀 있음 (YouTube에서 봐야 합니다)"}
            </dd>
          </div>

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
          <button
            type="submit"
            className="h-10 shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>

          {/*
            YouTube에서 보기.

            앱 안에서 트는 것은 다음 단계다. 그때까지도 영상을 볼 길은
            있어야 한다. 담아두기만 하고 볼 수 없으면 담을 이유가 없다.
          */}
          {profile ? (
            <a
              href={watchUrl(profile.videoId)}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-accent dark:text-zinc-400 dark:hover:text-accent-dark"
            >
              YouTube에서 보기 →
            </a>
          ) : null}
        </div>

        <p className="text-xs leading-5 text-zinc-500">
          제목·채널·길이는 YouTube에서 가져온 값입니다. 영상이 지워지거나
          비공개가 되어도 여기 담아둔 것과 적어둔 메모는 남습니다.
        </p>
      </form>
    </Panel>
  );
}
