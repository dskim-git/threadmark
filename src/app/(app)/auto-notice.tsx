"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * 잘 되었다는 안내문. 잠깐 보이고 스스로 사라진다.
 *
 * 왜 사라져야 하는가
 *   안내문은 한 줄을 차지한다. 읽기 화면처럼 창 높이를 재서 남는 만큼을 PDF에
 *   주는 화면에서는, 그 한 줄이 그대로 읽는 자리에서 빠져나간다. 그런데
 *   "저장했습니다"는 **읽고 나면 할 일이 끝나는 글**이다. 할 일이 끝난 글이
 *   자리를 계속 차지한다.
 *
 * 오류는 사라지지 않는다
 *   못 본 오류는 "아무 일도 없었다"와 구분되지 않는다. 사라지는 것은 잘
 *   되었다는 안내뿐이고, `role="alert"`로 알리는 오류는 그대로 둔다.
 *
 * 어떻게 사라지는가
 *   상태를 따로 두지 않고 **주소에서 지운다.** 서버가 `?notice=`를 보고
 *   그리므로, 그 값이 없어지면 안내문도 없어진다.
 *
 *   이렇게 한 이유가 둘 있다.
 *
 *   하나는 **같은 안내문이 잇달아 뜰 때**다. 기록을 연달아 둘 지우면 같은
 *   글이 두 번 온다. "한 번 감췄다"를 이 칸이 기억하고 있으면 두 번째는
 *   보여주지 못한다. 주소를 보고 정하면 그 기억이 없다.
 *
 *   다른 하나는 **다른 일로 화면을 다시 그릴 때**다. 별을 달면 서버가 화면을
 *   다시 그리는데, 주소에 옛 `?notice=`가 남아 있으면 이미 본 안내문이 다시
 *   뜬다. 지워두면 다시 뜰 값이 없다.
 *
 *   주소는 `history.replaceState`로 고친다. `router.replace`는 서버에
 *   다시 물어보러 가고, 그러면 적다 만 글상자가 초기화될 수 있다.
 *   이쪽은 주소만 고치고 화면을 다시 받아오지 않는다.
 */

/** 안내문이 머무는 시간. */
export const NOTICE_HIDE_MS = 2000;

/** 잘 되었다는 안내문의 모양. 읽기 화면도 같은 모양을 쓴다. */
export const NOTICE_CLASS_NAME =
  "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";

export function AutoNotice({
  children,
  /** 주소에서 지울 이름. 안내문을 담아 온 그 값이다. */
  param = "notice",
}: {
  children: React.ReactNode;
  param?: string;
}) {
  const searchParams = useSearchParams();
  const present = searchParams.get(param) !== null;

  useEffect(() => {
    if (!present) {
      return;
    }

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);

      next.delete(param);

      const query = next.toString();

      window.history.replaceState(
        null,
        "",
        query.length > 0
          ? `${window.location.pathname}?${query}`
          : window.location.pathname,
      );
    }, NOTICE_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [present, param]);

  if (!present) {
    return null;
  }

  return (
    <p role="status" className={NOTICE_CLASS_NAME}>
      {children}
    </p>
  );
}
