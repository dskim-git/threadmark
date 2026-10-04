"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 그림을 보는 칸. (설계 문서 16절, 2026-10-04 사용자 요청)
 *
 * > pdf와 비슷하게 이미지가 여러장이라면 이를 하나의 메모에 기록해야 할
 * > 때도 있으니까 pdf에 메모를 기록하는 방식과 비슷했으면 좋겠어.
 *
 * PDF와 무엇이 같고 무엇이 다른가
 *   PDF는 **파일 하나에 쪽이 여럿**이라 `?file=`로 파일을 고르고 그 안에서
 *   쪽을 넘겼다. 그림은 **파일 하나가 곧 한 장**이다. 그래서 이 화면은
 *   자료에 붙은 그림을 **한 묶음으로 보고 장을 넘긴다.**
 *
 *   `?file=`은 그대로 쓴다. 지금 몇 번째 장을 보는지가 주소에 남아야
 *   기록 목록의 `2장으로`가 그 자리를 열 수 있다.
 *
 * 왜 `<img>`를 직접 쓰는가
 *   `next/image`는 우리 서버가 그림을 받아 크기를 줄여 내보내는 길이다.
 *   이 그림은 **이용자의 Drive에 있고 우리 서버를 거쳐 흘러나온다.**
 *   (`/api/source-files/[id]/content`) 거기에 크기 줄이기를 또 얹으면
 *   남의 파일을 우리 서버가 한 번 더 붙잡고 있게 된다. 원본을 그대로
 *   보여주는 것이 이 화면이 할 일이다.
 *
 * 확대를 어떻게 다루는가
 *   **맞춤과 원본, 둘만 둔다.** 사진 앱처럼 무단계로 늘리는 길도 있는데,
 *   이 화면에서 하는 일은 "읽고 메모하기"라서 **글자가 읽히는 크기**와
 *   **전체가 보이는 크기** 둘이면 된다.
 *
 *   맞춤은 칸 안에 그림을 다 넣는다. 원본은 1:1로 두고 넘치면 스크롤이
 *   생긴다. 스캔본이나 손글씨는 원본으로 봐야 읽힌다.
 */

export type ReaderImage = {
  id: string;
  fileName: string;
  /** Drive에서 흘러나오는 주소. */
  src: string;
  /** Drive에 없는 파일. 자리는 두되 그림 대신 까닭을 적는다. */
  missing: boolean;
};

export function ImageReader({
  images,
  index,
  onIndexChange,
}: {
  images: readonly ReaderImage[];
  index: number;
  onIndexChange: (next: number) => void;
}) {
  /** 원본 크기로 볼 것인가. 기본은 칸에 맞춰 보는 것이다. */
  const [actualSize, setActualSize] = useState(false);

  /*
    **다 받아온 그림의 번호를 담는다.** `받았다/아니다`를 참거짓으로 들고
    있으면 장이 바뀔 때마다 거짓으로 되돌려야 하고, 그 되돌리기는 효과
    안에서 상태를 바꾸는 일이 된다. lint가 그것을 막는다.

    번호를 담으면 되돌릴 자리가 없다. 지금 장과 같은지만 보면 된다.
    (`place-map.tsx`에서 좌표를 `key`로 준 것과 같은 생각이다)
  */
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);

  const current = images[index];
  const loaded = loadedId === current?.id;

  const move = useCallback(
    (delta: number) => {
      const next = index + delta;

      if (next < 0 || next >= images.length) {
        return;
      }

      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  /*
    키보드로 장을 넘긴다. PDF 뷰어가 같은 키를 쓴다.

    **글을 적는 중에는 넘기지 않는다.** 오른쪽 메모 칸에 글을 쓰다가
    화살표로 글자 사이를 오갈 때 장이 넘어가면, 쓰던 메모가 다른 장의
    것이 된다. 그 자리는 조용하다. 오류가 나지 않는다.
  */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        move(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        move(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  /*
    장이 바뀌면 보던 자리를 위로 올린다.

    원본 크기로 보던 중에 다음 장으로 넘어가면 스크롤이 전 장의 아래쪽에
    머물러, **새 그림의 가운데가 아니라 엉뚱한 구석이 보인다.**

    여기서 상태를 되돌리지 않는다. 스크롤은 DOM을 움직이는 일이라 효과에
    두어도 되지만, 상태를 되돌리는 것은 다시 그리는 일을 한 번 더 만든다.
  */
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [index]);

  if (!current) {
    return (
      <p className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
        보여줄 그림이 없습니다.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 넘기는 줄. 어디쯤인지와 크기를 한 줄에 둔다. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0}
          aria-label="앞 장"
          className="h-8 w-8 shrink-0 rounded-full border border-black/[.08] text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-30 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          ←
        </button>

        <span className="shrink-0 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
          {index + 1} / {images.length}장
        </span>

        <button
          type="button"
          onClick={() => move(1)}
          disabled={index >= images.length - 1}
          aria-label="다음 장"
          className="h-8 w-8 shrink-0 rounded-full border border-black/[.08] text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-30 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          →
        </button>

        <span
          title={current.fileName}
          className="min-w-0 flex-1 truncate text-xs text-zinc-500"
        >
          {current.fileName}
        </span>

        <button
          type="button"
          onClick={() => setActualSize((value) => !value)}
          aria-pressed={actualSize}
          className="h-8 shrink-0 rounded-full border border-black/[.08] px-3 text-xs font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {actualSize ? "칸에 맞추기" : "원본 크기"}
        </button>
      </div>

      {/*
        그림이 놓이는 자리. **남는 높이를 다 쓴다.**

        `min-h-0`이 있어야 한다. 없으면 flex 칸이 안쪽 그림 높이만큼
        늘어나 창 밖으로 밀려난다. 작업대가 창 높이를 재서 나누는 화면이라
        한 칸이 넘치면 아래 썸네일이 보이지 않는다.
      */}
      <div
        ref={stageRef}
        className={`min-h-0 flex-1 rounded-xl border border-black/[.08] bg-zinc-50 dark:border-white/[.145] dark:bg-white/[.04] ${
          actualSize ? "overflow-auto" : "overflow-hidden"
        }`}
      >
        {current.missing ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
            Drive에 이 그림이 없어 보여드릴 수 없습니다. 남긴 기록은 그대로
            있습니다.
          </p>
        ) : (
          <div
            className={
              actualSize
                ? "w-max"
                : "flex h-full items-center justify-center p-2"
            }
          >
            {/*
              **그림을 두 번 그리지 않는다.** 장을 `key`로 주어 바뀌면 새로
              만든다. 같은 요소를 재사용하면 앞 그림이 남아 있다가 바뀌는데,
              그 사이가 느린 연결에서는 길다.

              `next/image`를 쓰지 않는 까닭은 머리말에 적었다.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={current.src}
              alt={`${index + 1}장: ${current.fileName}`}
              onLoad={() => setLoadedId(current.id)}
              onDoubleClick={() => setActualSize((value) => !value)}
              className={
                actualSize
                  ? "max-w-none cursor-zoom-out"
                  : "max-h-full max-w-full cursor-zoom-in object-contain"
              }
            />
          </div>
        )}

        {/*
          받아오는 동안. **빈 칸만 두지 않는다.** 느린 연결에서는 몇 초
          비어 있는데, 그 사이에 사용자는 고장이라고 생각한다.
          (`place-map.tsx`와 같은 판단)
        */}
        {!loaded && !current.missing ? (
          <p className="pointer-events-none -mt-8 text-center text-xs text-zinc-500">
            그림을 불러오는 중…
          </p>
        ) : null}
      </div>

      {/*
        아래 썸네일 줄.

        **두 장 이상일 때만 그린다.** 한 장뿐인데 줄이 있으면 넘길 것이
        있는 것처럼 보이고, 그만큼 그림이 작아진다.
      */}
      {images.length > 1 ? (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
          {images.map((image, position) => {
            const active = position === index;

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => onIndexChange(position)}
                aria-current={active ? "true" : undefined}
                title={image.fileName}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                  active
                    ? "border-accent dark:border-accent-dark"
                    : "border-black/[.08] hover:border-black/30 dark:border-white/[.145] dark:hover:border-white/40"
                }`}
              >
                {image.missing ? (
                  <span className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                    없음
                  </span>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={image.src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
