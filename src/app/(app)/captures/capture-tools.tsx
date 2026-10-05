"use client";

import { useState } from "react";

/**
 * 기록 줄 오른쪽의 두 단추. (2026-10-05, 사용자 요청)
 *
 * > 기록이라는 줄의 맨 오른쪽에 추가 버튼(+모양)을 만들어서 이 추가버튼을
 * > 눌렀을 때 (…) 새로운 기록을 남길 수 있는 칸이 나오도록 해줘. (…)
 * > + 모양의 버튼 왼쪽에 찾기 버튼(돋보기 모양)을 만들어서 그 버튼을
 * > 누르면 찾고자 하는 단어나 문구를 입력받아서 그 문구가 있는 기록(메모)만
 * > 찾아서 나오도록
 *
 * **두 단추가 하는 일의 결이 다르다.**
 *
 *   `+`      브라우저 안에서 칸을 폈다 접는다. 서버에 갈 일이 없다
 *   `돋보기`  **주소를 바꾼다.** 걸러진 목록은 서버가 만든다
 *
 * 찾기를 주소에 싣는 까닭
 *   이 화면은 이미 별과 태그를 주소로 거르고 있다. 찾기만 브라우저 안에서
 *   하면 **거르는 길이 두 가지가 되고**, 둘을 함께 쓸 때 어느 쪽이 이기는지
 *   알 수 없다. 그리고 걸러 놓은 자리를 **다시 열거나 남에게 줄 수 없다.**
 *
 *   무엇보다 브라우저 안에서 거르려면 **이미 그려진 기록만** 거를 수 있다.
 *   서버가 거르면 처음부터 그것만 온다.
 *
 * 자료 화면과 자료 밖 검색은 다른 자리다
 *   앱 전체를 뒤지는 `글자로 찾기`(`/search`)가 따로 있다. 여기는 **이
 *   자료 안에서만** 찾는다. 기록이 마흔 건씩 쌓이면 그 안에서 한 줄을
 *   눈으로 찾기 어렵다.
 */
export function CaptureTools({
  /** 제목 쪽. `기록 N건`과 물음표 단추다. */
  titleSlot,
  /** 별로 거르는 줄. 단추 왼쪽에 선다. */
  filterSlot,
  /** 지금 찾고 있는 말. 주소에서 온다. 없으면 빈 글자다. */
  term,
  /** 찾기를 보낼 자리. 지금 걸려 있는 별·태그를 그대로 들고 간다. */
  action,
  /** 찾기를 지우고 돌아갈 자리. */
  clearHref,
  /** 지금 걸려 있는 거르기를 함께 보낼 숨은 칸들. */
  keep,
  /** `+`를 눌렀을 때 펴지는 칸. 서버가 그려 넘긴다. */
  children,
}: {
  titleSlot: React.ReactNode;
  filterSlot: React.ReactNode;
  term: string;
  action: string;
  clearHref: string;
  keep: Readonly<Record<string, string>>;
  children: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);

  /*
    **찾고 있는 중이면 찾기 칸을 펴 둔다.**

    걸러진 목록을 보고 있는데 찾기 칸이 접혀 있으면, 무엇으로 걸렀는지
    알 수 없고 지울 길도 보이지 않는다. **지금 상태를 화면이 말해야 한다.**
  */
  const [searching, setSearching] = useState(term.length > 0);

  return (
    <>
      {/*
        **머리말 줄을 이 칸이 들고 있다.** (2026-10-05, 사용자가 찾음)

        처음에는 단추만 돌려주고 펼쳐지는 칸까지 그 자리에서 내보냈다.
        그랬더니 **펼쳐지는 칸이 머리말 줄의 칸 하나가 되어 제목 오른쪽에
        세로로 길게 섰다.** 두 단으로 나뉜 것처럼 보였다.

        > 2단으로 만드는게 아니라는거야.

        단추는 줄 안에 있어야 하고 펼쳐지는 칸은 **줄 아래 전체 너비**여야
        한다. 그 둘이 한 묶음으로 나올 수 없으므로, **줄 자체를 이 칸이
        그린다.** 제목과 거르기는 밖에서 받는다.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {titleSlot}

        <div className="flex flex-wrap items-center gap-3">
          {filterSlot}

          <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setSearching((value) => !value)}
          aria-pressed={searching}
          aria-label={searching ? "찾기 닫기" : "기록에서 찾기"}
          title={searching ? "찾기 닫기" : "기록에서 찾기"}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            searching || term.length > 0
              ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
              : "border-transparent text-zinc-400 hover:border-black/[.08] hover:bg-black/[.04] hover:text-black dark:hover:border-white/[.145] dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
          }`}
        >
          {/*
            돋보기. 그림 파일을 두지 않고 선으로 그린다. 연필과 같은 자리다.
            (`pencil-icon.tsx`)
          */}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          aria-pressed={adding}
          aria-label={adding ? "새 기록 닫기" : "새 기록 적기"}
          title={adding ? "새 기록 닫기" : "새 기록 적기"}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            adding
              ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
              : "border-transparent text-zinc-400 hover:border-black/[.08] hover:bg-black/[.04] hover:text-black dark:hover:border-white/[.145] dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
          }`}
        >
          {/*
            더하기. 켜져 있을 때는 돌려서 `×`로 보인다. **같은 단추가 닫는
            일도 한다는 것을 모양이 말한다.**
          */}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className={`h-4 w-4 transition-transform ${adding ? "rotate-45" : ""}`}
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
            </button>
          </div>
        </div>
      </div>

      {searching ? (
        /*
          **`GET`으로 보낸다.** 걸러진 자리가 주소에 남아야 다시 열 수 있다.
          `method`를 적지 않으면 기본이 `GET`이지만, 이 폼은 주소를 바꾸는
          것이 일이므로 적어 둔다.
        */
        <form
          method="GET"
          action={action}
          className="flex w-full flex-wrap items-center gap-2"
        >
          {/*
            지금 걸려 있는 별·태그를 함께 들고 간다. 빠뜨리면 찾는 순간
            **별만 보던 것이 풀린다.**
          */}
          {Object.entries(keep).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <label htmlFor="capture-search" className="sr-only">
            기록에서 찾을 말
          </label>
          <input
            id="capture-search"
            type="search"
            name="q"
            defaultValue={term}
            autoFocus
            placeholder="이 자료의 기록에서 찾을 말"
            className="h-10 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />

          <button
            type="submit"
            className="h-10 shrink-0 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            찾기
          </button>

          {/*
            **지우는 길을 찾는 중일 때만 보여준다.** 찾고 있지 않으면 지울
            것이 없고, 그때 보여주면 눌러도 아무 일이 없다.
          */}
          {term.length > 0 ? (
            <a
              href={clearHref}
              className="shrink-0 text-sm text-zinc-500 underline underline-offset-4 hover:text-black dark:hover:text-zinc-50"
            >
              찾기 지우기
            </a>
          ) : null}
        </form>
      ) : null}

      {adding ? children : null}
    </>
  );
}
