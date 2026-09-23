"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 창의 남는 높이를 채우는 칸. (설계 문서 9.1절)
 *
 * 읽기 작업대는 창 높이에 딱 맞아야 한다. 안쪽 두 칸이 각자 스크롤하는데
 * 바깥까지 움직이면, 휠을 굴릴 때 무엇이 움직일지 알 수 없다.
 *
 * 왜 CSS로 하지 않는가
 *   처음에는 `calc(100vh - 9rem)`으로 뺐다. 틀렸다. 9rem은 머리말이 이만큼일
 *   거라고 짐작한 값인데, 파일 확인 줄이 붙거나 파일이 여러 개여서 고르는
 *   줄이 생기면 그만큼 어긋나 바깥 스크롤이 나왔다.
 *
 *   다음에는 flex로 남는 높이를 물려받게 했다. body부터 여기까지 대여섯 겹을
 *   지나는 동안 한 곳만 `min-height: 0`을 빠뜨려도 사슬이 끊긴다. 끊기면
 *   칸이 내용만큼 늘어나고, 안쪽 스크롤이 통째로 사라진다. 실제로 그랬다.
 *
 *   그래서 잰다. 이 칸이 화면의 어디서 시작하는지 물어보고, 창 높이에서
 *   그만큼을 뺀다. 머리말이 몇 줄이든 맞는다. 짐작하는 값이 없다.
 *
 * 좁은 화면에는 걸지 않는다. 거기서는 나누지 않고 하나씩 보여주므로
 * 페이지가 평소처럼 스크롤되는 편이 자연스럽다. (설계 문서 21절)
 */

/** 이 너비부터 창 높이에 맞춘다. Tailwind의 lg와 같은 값이다. */
const SPLIT_WIDTH = 1024;

/** 아래에 남겨둘 여백. 본문의 아래 여백과 같다. */
const BOTTOM_GAP = 24;

/** 아무리 좁아도 이만큼은 준다. 창이 아주 낮을 때 칸이 사라지지 않게 한다. */
const MIN_HEIGHT = 420;

export function FillViewport({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /*
    상태를 두지 않고 DOM을 직접 고친다. 상태로 하면 "재고 → 다시 그리고 →
    또 재고"가 되어 화면이 한 번 깜빡이고, React 19는 effect 안에서 상태를
    바꾸는 것을 막는다.
  */
  const measure = () => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (window.innerWidth < SPLIT_WIDTH) {
      // 좁은 화면에서는 재지 않는다. 내용만큼 늘어나게 둔다.
      element.style.height = "";

      return;
    }

    const top = element.getBoundingClientRect().top;
    const height = Math.max(
      window.innerHeight - top - BOTTOM_GAP,
      MIN_HEIGHT,
    );

    element.style.height = `${Math.round(height)}px`;
  };

  // 그리기 전에 한 번 맞춘다. 늦으면 잘못된 높이가 한 번 보인다.
  useLayoutEffect(measure);

  /*
    창 크기가 바뀌면 다시 잰다.

    위쪽 내용이 늘거나 줄어도 다시 잰다. 파일 확인 줄이 뒤늦게 뜨거나,
    저장했다는 안내가 한 줄 붙으면 시작 지점이 내려간다. 그때 다시 재지
    않으면 딱 그만큼 바깥이 스크롤된다.
  */
  useEffect(() => {
    const element = ref.current;

    if (!element?.parentElement) {
      return;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(element.parentElement);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
