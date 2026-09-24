"use client";

import { useState } from "react";

import { HelpButton } from "@/app/(app)/help-button";
import type { MusicProfile } from "@/lib/music/queries";

import { MusicFindLinks } from "./music-find-links";
import { MusicProfileForm, type MusicValues } from "./music-profile-form";

/**
 * 곡 정보와 들을 수 있는 곳을 함께 묶는다. (설계 문서 13절)
 *
 * **적어 넣은 값을 여기 한 곳에 둔다.** 곡 정보 칸과 아래 `들을 곳 찾기`가
 * 같은 값을 봐야 하기 때문이다.
 *
 * 처음에는 찾는 칸을 따로 두었다. `찾아서 채우기` 안에 곡 이름 칸이 있고,
 * 곡 정보 안에 또 다른 칸들이 있었다. 두 벌이 되자 두 가지가 어긋났다.
 *
 *   - 아래 `들을 곳 찾기`가 자료 제목을 보고 있어서, 위에서 다른 이름으로
 *     찾아도 아래는 자료 제목으로 검색했다.
 *   - 찾는 칸의 곡 이름은 **어디에도 저장되지 않았다.** 그래서 저장을
 *     누르면 화면이 새로 그려질 때 자료 제목으로 되돌아갔다.
 *
 * 사용자가 두 번 말했다. "자꾸 자료 제목으로 고정된다", "복사한 정보에도
 * 반영되지 않는다."
 *
 * 그래서 **찾는 칸을 없앴다.** 곡 이름과 아티스트 칸 자체가 검색어가 된다.
 * 값이 하나면 어긋날 자리가 없다. `찾기`는 그 칸 옆에 있다.
 *
 * 곡 이름은 `sources.title`에 저장한다. 13.2절의 `곡명`이 그것이고,
 * 음악 자료에서 자료의 제목은 곧 곡 이름이다. 따로 담으면 "어느 쪽이
 * 맞는가"가 생긴다. 후보를 골라 이름이 바뀌면 자료 제목도 함께 바뀐다.
 *
 * 들을 수 있는 곳의 **목록과 손으로 담는 칸은 서버에서 그려 받는다.**
 * Server Action을 품고 있어 브라우저 쪽에서 만들 수 없다.
 * 읽기 화면이 기록 목록을 슬롯으로 받는 것과 같다.
 */
export function MusicWorkspace({
  sourceId,
  sourceTitle,
  thumbnailUrl,
  profile,
  returnTo,
  linksSlot,
}: {
  sourceId: string;
  /** 자료의 제목. 음악 자료에서는 이것이 곡 이름이다. */
  sourceTitle: string;
  thumbnailUrl: string | null;
  profile: MusicProfile | null;
  returnTo: string;
  /** 담아둔 링크 목록과 손으로 담는 칸. 서버에서 그려 넘겨받는다. */
  linksSlot: React.ReactNode;
}) {
  const [values, setValues] = useState<MusicValues>(() =>
    initialValues(sourceTitle, profile, thumbnailUrl),
  );

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            곡 정보
          </h2>
          <HelpButton topic="music" />
        </div>

        <MusicProfileForm
          sourceId={sourceId}
          values={values}
          onChange={setValues}
          returnTo={returnTo}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            들을 수 있는 곳
          </h2>
          <HelpButton topic="music-links" />
        </div>

        {/*
          위 칸에 적힌 그 곡으로 검색한다. 자료 제목을 따로 보지 않는다.
          값이 하나이므로 위에서 고치면 여기도 곧 바뀐다.
        */}
        <MusicFindLinks
          title={values.trackTitle}
          artist={values.artist.trim().length > 0 ? values.artist : null}
        />

        {linksSlot}
      </section>
    </>
  );
}

function initialValues(
  sourceTitle: string,
  profile: MusicProfile | null,
  thumbnailUrl: string | null,
): MusicValues {
  return {
    // 자료를 막 담았을 때는 자료 제목이 곧 곡 이름이다.
    trackTitle: sourceTitle,
    artist: profile?.artist ?? "",
    albumName: profile?.albumName ?? "",
    albumArtist: profile?.albumArtist ?? "",
    releasedOn: profile?.releasedOn ?? "",
    trackNumber: profile?.trackNumber?.toString() ?? "",
    durationSeconds: profile?.durationSeconds?.toString() ?? "",
    genre: profile?.genre ?? "",
    language: profile?.language ?? "",
    composer: profile?.composer ?? "",
    lyricist: profile?.lyricist ?? "",
    arranger: profile?.arranger ?? "",
    thumbnailUrl: thumbnailUrl ?? "",
  };
}
