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

/** 그림 안의 사각형. 전부 상대값(0~1)이다. */
export type ImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 끌었다고 볼 만한 가장 짧은 거리(화면 픽셀).
 *
 * **누르기와 끌기를 가른다.** 이 값이 없으면 확대하려고 두 번 누르는
 * 사이에 손이 1픽셀 흔들려도 상자가 만들어진다. 그 상자는 보이지 않으면서
 * 메모 칸의 안내문을 `한 부분`으로 바꿔 놓는다.
 */
const DRAG_THRESHOLD = 6;

export function ImageReader({
  images,
  index,
  onIndexChange,
  region,
  onRegionChange,
  highlight,
}: {
  images: readonly ReaderImage[];
  index: number;
  onIndexChange: (next: number) => void;
  /** 지금 골라 둔 영역. 없으면 장 전체에 메모한다. */
  region: ImageRegion | null;
  onRegionChange: (next: ImageRegion | null) => void;
  /**
   * 기록을 눌러 들어왔을 때 보여줄 상자. (16-2)
   *
   * 고르는 상자와 **다른 색으로 따로 그린다.** 하나로 합치면, 들어온
   * 상자를 지우려고 누른 것이 새 영역을 고르는 일이 되거나 그 반대가 된다.
   */
  highlight: ImageRegion | null;
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

  /*
    끌고 있는 중의 상자. **끝나면 `onRegionChange`로 넘기고 비운다.**

    여기서 들고 있는 까닭은 끌리는 동안의 모양이 **이 칸에서만 쓰이는
    값**이기 때문이다. 위로 올리면 손가락이 움직이는 동안 작업대 전체가
    다시 그려진다.
  */
  const [dragging, setDragging] = useState<ImageRegion | null>(null);

  /** 끌기 시작한 자리. 화면 좌표가 아니라 그림 안의 상대값이다. */
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  /** 그 자리의 화면 좌표. 끌었는지 눌렀는지 가리는 데 쓴다. */
  const dragOrigin = useRef<{ clientX: number; clientY: number } | null>(null);

  const current = images[index];
  const loaded = loadedId === current?.id;

  /**
   * 화면에 그릴 상자.
   *
   * 끌고 있는 중에는 그 모양을, 놓은 뒤에는 골라 둔 것을 그린다.
   * **둘을 한 변수로 모아 둔다.** 그리는 자리에서 가리면 좌표 네 칸마다
   * 같은 판단이 되풀이되고, 한 칸만 고치는 실수가 생긴다.
   */
  const shown = dragging ?? region;

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

  /*
    끌어서 한 부분을 고른다. (16-2)

    **상대값으로 잰다.** 그림을 칸에 맞춰 볼 때와 원본으로 볼 때 크기가
    다른데, 화면 픽셀로 담으면 다른 크기로 열었을 때 상자가 엉뚱한 데
    생긴다. (`image-locator.ts`의 머리말)

    `getBoundingClientRect()`로 재는 것이 `<img>` 요소 자체여야 한다.
    바깥 칸을 재면 칸 안에서 그림이 가운데로 밀린 만큼 어긋난다.
  */
  const ratioAt = (
    event: React.PointerEvent<HTMLElement>,
  ): { x: number; y: number } => {
    const box = event.currentTarget.getBoundingClientRect();

    // 칸 밖으로 끌어도 그림 안에 가둔다. 밖을 가리키는 상자를 만들지 않는다.
    const clamp = (value: number) => Math.min(1, Math.max(0, value));

    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    /*
      **주된 단추로만 시작한다.** 가운데 단추나 오른쪽 단추로 끌면 브라우저
      나름의 일(붙여넣기, 메뉴)이 함께 일어난다.
    */
    if (event.button !== 0) {
      return;
    }

    dragStart.current = ratioAt(event);
    dragOrigin.current = { clientX: event.clientX, clientY: event.clientY };

    /*
      **이 요소가 끝까지 손가락을 쥔다.** 안 쥐면 그림 밖으로 끌 때
      `pointerup`이 다른 요소로 가고, 상자가 끌린 채로 남는다.
    */
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    const origin = dragOrigin.current;

    if (!start || !origin) {
      return;
    }

    const moved =
      Math.abs(event.clientX - origin.clientX) +
      Math.abs(event.clientY - origin.clientY);

    // 아직 누르기인지 끌기인지 모른다. 상자를 그리지 않는다.
    if (moved < DRAG_THRESHOLD) {
      return;
    }

    const now = ratioAt(event);

    setDragging({
      x: Math.min(start.x, now.x),
      y: Math.min(start.y, now.y),
      width: Math.abs(now.x - start.x),
      height: Math.abs(now.y - start.y),
    });
  };

  const handlePointerUp = () => {
    const box = dragging;

    dragStart.current = null;
    dragOrigin.current = null;
    setDragging(null);

    if (!box) {
      // 끌지 않았다. 누르기는 확대를 다루는 쪽이 받는다.
      return;
    }

    /*
      **너무 작은 상자는 버린다.** 담기는 쪽(`imageRegionLocatorSchema`)도
      막지만, 여기서 버리면 메모 칸의 안내문이 잘못 바뀌는 일이 없다.
    */
    if (box.width < 0.01 || box.height < 0.01) {
      return;
    }

    onRegionChange(box);
  };

  /*
    장이 바뀌면 골라 둔 영역을 거둔다.

    **앞 장에서 고른 상자가 남으면 다음 장의 그 자리를 가리키게 된다.**
    그림마다 담긴 것이 달라서, 같은 좌표가 전혀 다른 곳을 뜻한다.
    오류는 나지 않는다.
  */
  useEffect(() => {
    onRegionChange(null);
  }, [index, onRegionChange]);

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

        {/*
          고른 영역을 거두는 단추. (16-2)

          **고른 뒤에만 보인다.** 늘 보이면 누를 것이 없는 단추가 되고,
          누를 것이 없는 단추는 "지금 뭔가 골라져 있나" 하고 찾게 만든다.
        */}
        {region ? (
          <button
            type="button"
            onClick={() => onRegionChange(null)}
            className="h-8 shrink-0 rounded-full border border-accent px-3 text-xs font-medium text-accent transition-colors hover:bg-accent-soft dark:border-accent-dark dark:text-accent-dark dark:hover:bg-accent-dark-soft"
          >
            고른 영역 지우기
          </button>
        ) : null}

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
        **끌 수 있다는 것을 말해 준다.** (16-2)

        끌어서 고르는 길은 **보이지 않는 기능**이다. 단추가 없으니 눌러볼
        것도 없고, 설명이 없으면 그런 길이 있다는 것을 모른 채 장 전체에만
        메모한다. 사용법에도 적지만 그 화면까지 가야 읽힌다.

        고른 뒤에는 무엇이 달라졌는지로 바꿔 적는다. 같은 자리에 같은 말이
        남아 있으면 골라진 것인지 알 수 없다.
      */}
      <p className="shrink-0 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {region
          ? "이 부분에 메모가 달립니다. 다시 끌면 자리가 바뀝니다."
          : "그림에서 끌어 한 부분을 고르면 그 자리에 메모를 달 수 있습니다."}
      </p>

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
            {/*
              **상자를 그리려면 그림을 감싸는 칸이 필요하다.**

              `relative`인 칸이 `<img>` 크기에 딱 맞아야 한다. 바깥 칸에
              맞추면 그림이 가운데로 밀린 만큼 상자가 어긋난다.
              `inline-block`과 `leading-none`이 그 일을 한다. `leading-none`이
              없으면 글자 높이만큼 아래에 틈이 생긴다.
            */}
            <span className="relative inline-block leading-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.id}
                src={current.src}
                alt={`${index + 1}장: ${current.fileName}`}
                onLoad={() => setLoadedId(current.id)}
                onDoubleClick={() => setActualSize((value) => !value)}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                /*
                  **브라우저의 그림 끌기를 막는다.** 막지 않으면 끌기 시작할
                  때 반투명한 그림이 손가락에 따라붙고, 그 뒤로는
                  `pointermove`가 오지 않는다. 영역 고르기가 통째로 안 된다.

                  PDF 쪽에서 글자를 고를 때 덮개를 둔 것과 같은 자리다.
                */
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className={
                  actualSize
                    ? "max-w-none cursor-crosshair select-none"
                    : "max-h-full max-w-full cursor-crosshair object-contain select-none"
                }
              />

              {/*
                기록을 눌러 들어왔을 때의 상자. (16-2)

                **고르는 상자와 색을 달리한다.** 같으면 어느 것이 내가 지금
                고른 것인지 알 수 없다.
              */}
              {highlight ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-400/20"
                  style={{
                    left: `${highlight.x * 100}%`,
                    top: `${highlight.y * 100}%`,
                    width: `${highlight.width * 100}%`,
                    height: `${highlight.height * 100}%`,
                  }}
                />
              ) : null}

              {/*
                지금 고르는 상자. 끌리는 동안과 놓은 뒤 모두 이것으로 그린다.

                `pointer-events-none`이 있어야 한다. 없으면 상자가 그림 위를
                덮어 **그 안에서 다시 끌 수 없다.**
              */}
              {shown ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute rounded-sm border-2 border-accent bg-accent/15 dark:border-accent-dark dark:bg-accent-dark/15"
                  style={{
                    left: `${shown.x * 100}%`,
                    top: `${shown.y * 100}%`,
                    width: `${shown.width * 100}%`,
                    height: `${shown.height * 100}%`,
                  }}
                />
              ) : null}
            </span>
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
