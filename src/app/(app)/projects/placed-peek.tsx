"use client";

import Link from "next/link";

import { Popover } from "@/app/(app)/popover";
import type { PlacedItem } from "@/lib/projects/placement-queries";

/**
 * 놓아둔 재료의 내용을 그 자리에서 들여다본다. (19-B, 사용자 요청으로 고침)
 *
 * **처음에는 그 재료의 화면으로 보냈다.** 쓰던 자리를 잃는다는 점을
 * 놓쳤다. 사용자가 "그 메모 페이지로 가기보다는 팝업 형식으로"라고 했고,
 * 맞는 말이었다. 자리에 글을 쓰다가 "이 인용이 정확히 뭐였지"를 확인하는
 * 것이므로 **떠나지 않아야 한다.**
 *
 * 그래도 그 화면으로 가는 길은 창 안에 둔다. 고칠 일이 있으면 가야 한다.
 * 다만 그것은 **고르는 일**이지 확인하는 길목이 아니다.
 *
 * 원문과 내 메모를 갈라서 보여준다. 이 앱의 가장 중요한 약속이고(2.4절),
 * 좁은 창에서 붙여 놓으면 어느 것이 남의 글인지 알 수 없게 된다.
 */
export function PlacedPeek({ item }: { item: PlacedItem }) {
  const label =
    item.kind === "source"
      ? item.title
      : (item.originalText ?? item.content ?? "내용 없는 기록");

  return (
    <Popover
      ariaLabel={`${label} 내용 보기`}
      hoverTitle="눌러서 내용 보기"
      width={420}
      className="min-w-0 flex-1"
      triggerClassName="w-full truncate text-left text-sm text-black underline decoration-dotted underline-offset-4 transition-colors hover:text-accent dark:text-zinc-50 dark:hover:text-accent-dark"
      trigger={label}
    >
      {item.kind === "source" ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
            {item.title}
          </h3>
          <Link
            href={`/sources/${item.sourceId}`}
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-black dark:hover:text-zinc-200"
          >
            자료 화면으로 가기 →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/*
            어느 자료에서 나온 말인지 맨 위에 적는다. 원문을 읽기 전에
            출처를 아는 편이 낫다. 같은 주제의 논문 여럿에서 고른 문장들은
            서로 닮아서, 출처를 모르면 어느 쪽 주장인지 헷갈린다.
          */}
          {item.sourceTitle ? (
            <Link
              href={`/sources/${item.sourceId}`}
              className="truncate text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              {item.sourceTitle}
            </Link>
          ) : null}

          {item.originalText ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">원문</span>
              {/*
                원문은 고칠 수 없는 값이고(2.4절) 여기서도 고르기만 한다.
                `whitespace-pre-wrap`으로 줄바꿈을 그대로 둔다. 인용은
                생긴 모양이 뜻의 일부다.
              */}
              <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm leading-7 text-zinc-800 dark:bg-white/[.04] dark:text-zinc-200">
                {item.originalText}
              </p>
            </div>
          ) : null}

          {item.content ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">내 메모</span>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
                {item.content}
              </p>
            </div>
          ) : null}

          {!item.originalText && !item.content ? (
            <p className="text-sm text-zinc-500">내용이 비어 있습니다.</p>
          ) : null}

          <Link
            href={`/captures/${item.captureId}/edit`}
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-black dark:hover:text-zinc-200"
          >
            이 기록 고치러 가기 →
          </Link>
        </div>
      )}
    </Popover>
  );
}
