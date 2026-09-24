"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpButton } from "@/app/(app)/help-button";
import type { MusicCandidate } from "@/lib/music/candidates";
import { formatPosition } from "@/lib/music/time";
import { MAX_TITLE_LENGTH } from "@/lib/sources/schema";

import {
  attachProviderLink,
  lookupMusicCandidates,
  saveMusicProfile,
} from "./music-actions";

/**
 * 곡 정보 칸. 찾아와 채우고, 고쳐서 저장한다. (설계 문서 13.2절, 13.3절)
 *
 * **찾는 칸을 따로 두지 않는다.**
 *
 * 처음에는 `찾아서 채우기` 안에 곡 이름과 아티스트 칸을 따로 두었다.
 * 아래 곡 정보에도 같은 칸이 있어서 값이 두 벌이 되었고, 두 가지가 어긋났다.
 * 아래쪽 `들을 곳 찾기`가 엉뚱한 이름으로 검색했고, 찾는 칸에 친 곡 이름은
 * 어디에도 저장되지 않아 저장을 누르면 자료 제목으로 되돌아갔다.
 * 사용자가 두 번 말했다.
 *
 * 지금은 **곡 이름과 아티스트 칸 자체가 검색어다.** `찾기`가 그 옆에 있다.
 * 값이 하나면 어긋날 자리가 없다.
 *
 * **찾아온 값을 바로 저장하지 않는다.** 후보를 늘어놓고 사용자가 고르고,
 * 채워진 값을 보고 고칠 수 있게 한 뒤에 저장한다. 13.3절의 "후보 목록에서
 * 정확한 버전 선택"이 그것이고, 실제로 받아보니 그러지 않으면 안 되는 이유가
 * 분명했다. `붉은 노을 / 이문세`에 iTunes는 BIGBANG의 판을 준다. (13.3-1절)
 *
 * **고른 곡의 값으로 바꾼다.** 후보를 누른 것이 곧 "이 곡이 맞다"는 뜻이다.
 * 빈 칸만 채우게 두면 한 곡을 채운 뒤 다른 곡으로 바꿀 수 없다. 처음에
 * 그렇게 만들었다가 사용자가 "수정이 안 된다"고 했다. 후보가 내주지 않는
 * 칸(작곡·작사·편곡)은 건드리지 않으므로 손으로 적어둔 값은 남는다.
 *
 * 덮어써도 위험하지 않은 까닭이 둘 있다. 저장을 누르기 전에는 아무것도
 * 저장되지 않고, 바뀐 값이 바로 칸에 보여서 고칠 수 있다.
 *
 * 적어 넣은 값은 이 칸이 들고 있지 않고 **바깥에서 받는다.** 아래
 * `들을 곳 찾기`가 같은 값을 써야 한다. (music-workspace.tsx)
 */

export type MusicValues = {
  /** 곡 이름. 저장하면 자료의 제목이 된다. (13.2절의 `곡명`) */
  trackTitle: string;
  artist: string;
  albumName: string;
  albumArtist: string;
  releasedOn: string;
  trackNumber: string;
  durationSeconds: string;
  genre: string;
  language: string;
  composer: string;
  lyricist: string;
  arranger: string;
  thumbnailUrl: string;
};

/**
 * 접어두는 칸.
 *
 * 열두 칸을 한꺼번에 보여주니 다 적어야 하는 것처럼 보였다. 사용자가
 * "이 부분은 내가 알아서 적어야 하는 거야?"라고 물었다. **자주 적는 것만
 * 펼쳐두고 나머지는 접는다.** 값이 들어 있으면 저절로 펼친다. 접힌 채로
 * 두면 적어둔 것을 못 보고 지나간다.
 */
const MORE_FIELDS: readonly {
  name: keyof MusicValues;
  label: string;
  hint?: string;
}[] = [
  {
    name: "albumArtist",
    label: "앨범 아티스트",
    hint: "모음집처럼 곡마다 아티스트가 다를 때 적습니다.",
  },
  { name: "trackNumber", label: "트랙 번호" },
  {
    name: "durationSeconds",
    label: "재생 시간(초)",
    hint: "3분 45초는 225입니다.",
  },
  { name: "language", label: "언어" },
  { name: "composer", label: "작곡" },
  { name: "lyricist", label: "작사" },
  { name: "arranger", label: "편곡" },
  {
    name: "thumbnailUrl",
    label: "앨범 표지 주소",
    hint: "찾아오면 저절로 채워집니다.",
  },
];

export function MusicProfileForm({
  sourceId,
  values,
  onChange,
  returnTo,
}: {
  sourceId: string;
  values: MusicValues;
  onChange: (next: MusicValues) => void;
  returnTo: string;
}) {
  const [candidates, setCandidates] = useState<MusicCandidate[] | null>(null);
  /** 방금 어느 후보를 적용했는지. 목록에 표시해 준다. */
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [attaching, startAttaching] = useTransition();
  const router = useRouter();

  const hasMore = MORE_FIELDS.some(
    (field) => (values[field.name] ?? "").length > 0,
  );

  const set = (name: keyof MusicValues, value: string) =>
    onChange({ ...values, [name]: value });

  function handleLookup() {
    setMessage(null);
    setFailed(false);

    startLoading(async () => {
      const result = await lookupMusicCandidates(
        values.trackTitle,
        values.artist,
      );

      if (!result.ok) {
        setCandidates(null);
        setAppliedKey(null);
        setFailed(true);
        setMessage(result.message);

        return;
      }

      setCandidates(result.candidates);
      setAppliedKey(null);
      setMessage(result.notice);
    });
  }

  /** 고른 곡의 값으로 칸을 바꾼다. 후보가 내주는 칸만 건드린다. */
  function handleFill(candidate: MusicCandidate) {
    const incoming: Partial<MusicValues> = {
      trackTitle: candidate.title,
      artist: candidate.artist ?? "",
      albumName: candidate.albumName ?? "",
      albumArtist: candidate.albumArtist ?? "",
      releasedOn: candidate.releasedOn ?? "",
      trackNumber: candidate.trackNumber?.toString() ?? "",
      durationSeconds: candidate.durationSeconds?.toString() ?? "",
      genre: candidate.genre ?? "",
      thumbnailUrl: candidate.artworkUrl ?? "",
    };

    const given = Object.entries(incoming).filter(
      ([, value]) => (value ?? "").length > 0,
    );

    onChange({ ...values, ...Object.fromEntries(given) });
    setAppliedKey(candidate.key);
    setMessage(
      given.length > 0
        ? `${given.length}칸을 이 곡의 값으로 바꿨습니다. 아래에서 고칠 수 있고, 저장을 눌러야 남습니다.`
        : "이 후보에는 채울 값이 없었습니다.",
    );
  }

  /**
   * 찾은 곡의 재생 링크를 `들을 수 있는 곳`에 담는다. (13.6절)
   *
   * **화면을 옮기지 않는다.** 이 칸에는 아직 저장하지 않은 값이 들어 있고,
   * 화면을 옮기면 그것이 사라진다. 그래서 값을 돌려받은 뒤 목록만 다시
   * 받아온다.
   */
  function handleAttach(url: string) {
    startAttaching(async () => {
      const result = await attachProviderLink(sourceId, url);

      setFailed(!result.ok);
      setMessage(result.message);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <form action={saveMusicProfile} className="flex flex-col gap-4">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {/*
        곡 이름과 아티스트. **이 두 칸이 곧 검색어다.**
        따로 찾는 칸을 두면 값이 두 벌이 되어 어긋난다.
      */}
      <div className="flex flex-col gap-3 rounded-xl border border-black/[.06] p-4 dark:border-white/[.1]">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            곡 이름과 아티스트
          </p>
          <HelpButton topic="music-lookup" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="trackTitle"
            label="곡 이름"
            value={values.trackTitle}
            hint="저장하면 이 자료의 제목이 됩니다."
            required
            maxLength={MAX_TITLE_LENGTH}
            onChange={(value) => set("trackTitle", value)}
            onEnter={handleLookup}
          />
          <Field
            name="artist"
            label="아티스트"
            value={values.artist}
            onChange={(value) => set("artist", value)}
            onEnter={handleLookup}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLookup}
            disabled={loading || values.trackTitle.trim().length < 2}
            className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {loading ? "찾는 중…" : "이 이름으로 찾기"}
          </button>
          <p className="text-xs text-zinc-500">
            아티스트는 비워 두는 편이 잘 찾기도 합니다.
          </p>
        </div>

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

        {candidates && candidates.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                /*
                  줄 안에 단추가 둘이다. 채우기와 링크 담기다. 하나를 다른
                  것 안에 넣을 수 없으므로(button 안의 button은 올바른
                  HTML이 아니다) 형제로 두고 가로로 붙인다.
                */
                <li key={candidate.key} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => handleFill(candidate)}
                    aria-pressed={appliedKey === candidate.key}
                    /*
                      누른 뒤에도 목록을 그대로 둔다. 잘못 골랐을 때 바로 다른
                      것을 누를 수 있어야 한다. 처음에는 누르면 목록을
                      감췄는데, 그래서 바꾸려면 다시 찾아야 했다.
                    */
                    className={
                      appliedKey === candidate.key
                        ? "flex min-w-0 flex-1 items-start gap-3 rounded-lg border border-accent bg-accent-soft p-3 text-left dark:border-accent-dark dark:bg-accent-dark-soft"
                        : "flex min-w-0 flex-1 items-start gap-3 rounded-lg border border-black/[.08] p-3 text-left transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.05]"
                    }
                  >
                    <Artwork url={candidate.artworkUrl} />

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm text-black dark:text-zinc-50">
                        {candidate.title}
                      </span>
                      <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                        {[candidate.artist, candidate.albumName]
                          .filter(Boolean)
                          .join(" · ") || "정보 없음"}
                      </span>
                      <span className="truncate text-xs text-zinc-500">
                        {[
                          candidate.releasedOn,
                          candidate.durationSeconds
                            ? formatPosition(candidate.durationSeconds)
                            : null,
                          candidate.genre,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>

                    {/*
                      어디서 온 값인지 밝힌다. 밝히지 않으면 "왜 영문으로
                      나오지"를 묻게 된다. iTunes는 이름을 영문으로 바꿔 준다.
                    */}
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                      {candidate.source === "musicbrainz"
                        ? "MusicBrainz"
                        : "Apple"}
                    </span>
                  </button>

                  {/*
                    이 곡을 들을 수 있는 주소가 함께 온 경우다. iTunes가
                    Apple Music 주소를 준다. 담아둘지는 따로 고른다.
                    곡 정보와 재생 링크는 다른 일이기 때문이다.
                  */}
                  {candidate.listenUrl ? (
                    <button
                      type="button"
                      onClick={() => handleAttach(candidate.listenUrl!)}
                      disabled={attaching}
                      title="이 곡의 Apple Music 주소를 `들을 수 있는 곳`에 담습니다."
                      className="shrink-0 rounded-lg border border-black/[.08] px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                    >
                      들을 곳
                      <br />
                      담기
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="text-xs leading-5 text-zinc-500">
              MusicBrainz는 한글 이름을 그대로 주고, Apple은 표지와 장르가
              좋지만 이름이 영문으로 올 수 있습니다. 눌러도 저장되지 않으니
              여러 개를 눌러 보고 마음에 드는 것으로 두셔도 됩니다.
            </p>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="albumName"
          label="앨범"
          value={values.albumName}
          onChange={(value) => set("albumName", value)}
        />
        <Field
          name="releasedOn"
          label="발매일"
          value={values.releasedOn}
          hint="아는 만큼만 적습니다. `2024` 나 `2024년 3월`도 됩니다."
          onChange={(value) => set("releasedOn", value)}
        />
        <Field
          name="genre"
          label="장르"
          value={values.genre}
          onChange={(value) => set("genre", value)}
        />
      </div>

      {/* 값이 들어 있으면 저절로 펼친다. 접힌 채로 두면 적어둔 것을 못 본다. */}
      <details open={hasMore} className="flex flex-col gap-4">
        <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
          자세히 적기 (트랙 번호, 재생 시간, 작곡·작사·편곡, 표지)
        </summary>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {MORE_FIELDS.map((field) => (
            <Field
              key={field.name}
              name={field.name}
              label={field.label}
              value={values[field.name] ?? ""}
              hint={
                field.name === "durationSeconds" && values.durationSeconds
                  ? `지금 ${formatPosition(Number(values.durationSeconds) || 0)}입니다.`
                  : field.hint
              }
              onChange={(value) => set(field.name, value)}
            />
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="h-10 rounded-full border border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          곡 정보 저장
        </button>
        <p className="text-xs text-zinc-500">
          곡 이름만 있으면 됩니다. 나머지는 아는 것만 적으세요.
        </p>
      </div>
    </form>
  );
}

/**
 * 후보의 표지.
 *
 * 없는 판도 많다. Cover Art Archive는 그림이 없으면 404를 주는데, 그것을
 * 미리 확인하려면 후보마다 요청을 한 번 더 보내야 한다. 안 뜨면 **이 칸을
 * 감춘다.** 깨진 그림 표시가 목록에 늘어서 있으면 더 나쁘다.
 */
function Artwork({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <span
        aria-hidden="true"
        className="h-12 w-12 shrink-0 rounded bg-zinc-100 dark:bg-white/[.08]"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-12 w-12 shrink-0 rounded object-cover"
    />
  );
}

function Field({
  label,
  name,
  value,
  hint,
  required,
  maxLength,
  onChange,
  onEnter,
}: {
  label: string;
  name: string;
  value: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  /** Enter를 눌렀을 때. 찾는 칸에서 쓴다. */
  onEnter?: () => void;
}) {
  const id = `music-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red-600 dark:text-red-400">*</span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required={required}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={
          onEnter
            ? (event) => {
                if (event.key === "Enter") {
                  // 폼이 저장으로 넘어가지 않게 막고 찾기만 한다.
                  event.preventDefault();
                  onEnter();
                }
              }
            : undefined
        }
        className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      {hint ? <p className="text-xs leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}
