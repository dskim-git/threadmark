"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Popover } from "@/app/(app)/popover";
import type { PlacementOfSource } from "@/lib/projects/placement-queries";

import { findPlacementsOfCapture } from "./placement-actions";

/**
 * 이 기록이 어디에 놓여 있는지 그 자리에서 보여준다. (사용자 요청)
 *
 * **"이 메모 어디에 썼더라"를 물을 데가 필요하다.** 기록은 자료와 달리
 * 제목이 없어 목록에서 스쳐 지나가기 쉽고, 물을 데가 없으면 같은 것을 두 번
 * 적게 된다.
 *
 * **화면을 옮기지 않는다.** 확인하려고 프로젝트 화면까지 갔다 오면 보던
 * 목록을 잃는다. 물음표 단추와 같은 창을 쓴다. (popover.tsx)
 *
 * **누를 때 물어본다.** 기록 카드는 받은함·자료 화면·읽기 화면 세 곳에
 * 나온다. 카드마다 미리 물어보면 카드 수만큼 왕복이 늘고, 대부분은 열어보지
 * 않는다.
 */
export function PlacedWhere({ captureId }: { captureId: string }) {
  const [rows, setRows] = useState<readonly PlacementOfSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  function load() {
    // 한 번 받아오면 다시 받지 않는다. 창을 여닫는 동안 바뀔 일은 드물다.
    if (rows !== null || loading) {
      return;
    }

    startLoading(async () => {
      try {
        setRows(await findPlacementsOfCapture(captureId));
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <span onPointerDown={load}>
      <Popover
        ariaLabel="이 기록이 놓인 자리"
        hoverTitle="이 기록을 어디에 놓았는지 보기"
        width={320}
        triggerClassName="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        trigger="놓인 자리"
      >
        <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
          이 기록이 놓인 자리
        </h3>

        {failed ? (
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            가져오지 못했습니다. 다시 눌러 주세요.
          </p>
        ) : rows === null ? (
          <p className="mt-2 text-xs leading-5 text-zinc-500">불러오는 중…</p>
        ) : rows.length === 0 ? (
          /*
            아직 없을 때가 정상이다. 그래서 "없다"로 끝내지 않고 무엇을 하면
            되는지 한 줄 덧붙인다. 빈 화면은 고장처럼 보인다.
          */
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            아직 어느 자리에도 놓지 않았습니다.
            <br />
            옆의 `자리에 놓기`로 정할 수 있습니다.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={`${row.projectId}-${row.nodeId}`}>
                <Link
                  href={`/projects/${row.projectId}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs leading-5 transition-colors hover:text-accent dark:hover:text-accent-dark"
                >
                  <span className="text-zinc-500">{row.projectName}</span>
                  <span aria-hidden="true" className="text-zinc-400">
                    ›
                  </span>
                  <span className="text-black dark:text-zinc-50">
                    {row.nodeTitle}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </span>
  );
}
