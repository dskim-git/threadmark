"use client";

import { useEffect, useState } from "react";

import { getCaptureTypeLabel } from "@/lib/captures/types";
import type {
  PickerCapture,
  PickerSource,
  PickerTree,
} from "@/lib/projects/placement-queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { placeItem } from "./placement-actions";

/**
 * 자리에 놓을 재료를 고르는 창. (19-B, 사용자 요청으로 다시 만듦)
 *
 * **처음에는 드롭다운이었다.** 제목만 한 줄로 늘어놓으니 무엇인지 모르는
 * 채로 골라야 했다. 사용자가 "어떤 건지 모르잖아"라고 했고, 맞는 말이었다.
 * 기록에는 제목이 아예 없어서 더 그랬다.
 *
 * **파일 고르는 창처럼 만든다.** 왼쪽에서 자료를 고르고 오른쪽에서 그
 * 자료에 적어둔 기록을 본다. 자료 자체를 놓을 수도 있고 그 안의 기록
 * 하나를 놓을 수도 있다. 찾는 칸으로 걸러낸다.
 *
 * **고르는 일에 브라우저 코드가 필요하지만 놓는 일에는 필요 없다.**
 * 어느 자료를 펼쳤는지만 여기서 기억하고, 실제로 놓는 것은 줄마다 달린
 * `submit` 단추가 한다. `name`과 `value`가 붙은 단추는 눌린 것만 값을
 * 보낸다. 무엇이 눌렸는지를 우리가 다시 셀 필요가 없다.
 */
export function ItemPicker({
  projectId,
  nodeId,
  nodeTitle,
  tree,
  placedValues,
}: {
  projectId: string;
  nodeId: string;
  nodeTitle: string;
  tree: PickerTree;
  /** 이 자리에 이미 놓인 것. `source:<id>` / `capture:<id>` 모양이다. */
  placedValues: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Esc로 닫는다. 창이 화면을 덮고 있어서 나가는 길이 분명해야 한다.
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const placed = new Set(placedValues);
  const needle = query.trim().toLowerCase();

  /*
    찾는 칸은 **세 가지를 함께** 본다. 자료 이름, 인용한 원문, 내 메모다.

    자료 이름만 보면 "그 문장이 어느 자료에 있었더라"에 답하지 못한다.
    찾으려는 것은 대개 자료가 아니라 문장이다.

    원문만 보는 것으로도 모자란다. **인용은 남의 글이라 내 말로 기억되지
    않는다.** 오히려 내가 붙여둔 한 줄이 그 인용을 떠올리게 하는 열쇠인
    경우가 많다.

    기록이 걸린 자료는 왼쪽 목록에 남고, 오른쪽에는 걸린 기록만 보인다.
  */
  const captureMatches = (capture: PickerCapture) =>
    needle.length === 0 ||
    capture.text.toLowerCase().includes(needle) ||
    (capture.content ?? "").toLowerCase().includes(needle);

  const matches = (source: PickerSource) =>
    needle.length === 0 ||
    source.title.toLowerCase().includes(needle) ||
    source.captures.some(captureMatches);

  const sources = tree.sources.filter(matches);
  const loose = tree.loose.filter(captureMatches);

  const openSource =
    openSourceId === null
      ? null
      : (tree.sources.find((source) => source.id === openSourceId) ?? null);

  const shownCaptures = (openSource?.captures ?? tree.loose).filter(
    captureMatches,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 w-fit rounded-full border border-dashed border-black/[.16] px-4 text-sm text-zinc-700 transition-colors hover:border-black/30 hover:bg-black/[.03] dark:border-white/[.2] dark:text-zinc-300 dark:hover:border-white/40 dark:hover:bg-white/[.05]"
      >
        + 이 자리에 재료 놓기
      </button>
    );
  }

  return (
    <div
      /*
        화면을 덮는 창이다. 고르는 일은 목록을 훑는 일이라 자리가 넓어야
        하고, 뒤의 뼈대가 비쳐 보이면 어느 자리에 놓는 중인지 헷갈린다.
        대신 **어느 자리에 놓는 중인지를 머리말에 적는다.**
      */
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        // 바깥을 누르면 닫는다. 안쪽 누름은 여기까지 올라오지 않게 막는다.
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-label="자리에 놓을 재료 고르기"
        className="flex h-full max-h-[42rem] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
      >
        <header className="flex items-center gap-3 border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-zinc-500">여기에 놓습니다</span>
            <span className="truncate text-sm font-medium text-black dark:text-zinc-50">
              {nodeTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-full px-3 py-1 text-sm text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-black dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
          >
            닫기
          </button>
        </header>

        <div className="border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
          <label className="sr-only" htmlFor={`picker-search-${nodeId}`}>
            자료와 기록 찾기
          </label>
          <input
            id={`picker-search-${nodeId}`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="자료 이름이나 문장으로 찾기"
            className="h-9 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </div>

        {/*
          놓는 일은 폼 하나가 맡는다. 줄마다 달린 단추가 `item` 값을 보낸다.
          창 전체를 감싸므로 어느 쪽 목록에서 눌러도 같은 곳으로 간다.
        */}
        <form
          action={placeItem}
          className="flex min-h-0 flex-1 flex-col sm:flex-row"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="nodeId" value={nodeId} />

          {/* 왼쪽: 자료. 좁은 화면에서는 위아래로 쌓인다. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-b border-black/[.06] sm:border-b-0 sm:border-r dark:border-white/[.08]">
            <p className="px-4 py-2 text-xs font-medium text-zinc-500">
              자료 {sources.length}
            </p>

            <ul className="flex flex-col pb-2">
              {tree.loose.length > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setOpenSourceId(null)}
                    aria-pressed={openSourceId === null}
                    className={rowClass(openSourceId === null)}
                  >
                    <span className="shrink-0 text-zinc-400">▤</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      자료 없는 기록
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {loose.length}
                    </span>
                  </button>
                </li>
              ) : null}

              {sources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => setOpenSourceId(source.id)}
                    aria-pressed={openSourceId === source.id}
                    className={rowClass(openSourceId === source.id)}
                  >
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                      {getSourceTypeLabel(source.type)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {source.title}
                    </span>
                    {source.captures.length > 0 ? (
                      <span className="shrink-0 text-xs text-zinc-500">
                        {source.captures.length}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}

              {sources.length === 0 && loose.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-zinc-500">
                  찾는 것이 없습니다.
                </li>
              ) : null}
            </ul>
          </div>

          {/* 오른쪽: 고른 자료 자체와 그 안의 기록. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {openSource ? (
              <>
                <p className="px-4 py-2 text-xs font-medium text-zinc-500">
                  이 자료 자체
                </p>
                <PlaceRow
                  value={`source:${openSource.id}`}
                  already={placed.has(`source:${openSource.id}`)}
                  badge={getSourceTypeLabel(openSource.type)}
                  text={openSource.title}
                />
              </>
            ) : null}

            <p className="px-4 py-2 text-xs font-medium text-zinc-500">
              {openSource ? "여기에 적어둔 기록" : "자료 없는 기록"}{" "}
              {shownCaptures.length}
            </p>

            {shownCaptures.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs leading-5 text-zinc-500">
                {openSource
                  ? "이 자료에 남긴 기록이 아직 없습니다. 자료 자체를 놓을 수 있습니다."
                  : "자료 없는 기록이 없습니다."}
              </p>
            ) : (
              <ul className="flex flex-col pb-2">
                {shownCaptures.map((capture) => (
                  <li key={capture.id}>
                    <PlaceRow
                      value={`capture:${capture.id}`}
                      already={placed.has(`capture:${capture.id}`)}
                      badge={getCaptureTypeLabel(capture.captureType)}
                      {...describe(capture)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 기록 한 줄에서 무엇을 위에 놓을지 정한다.
 *
 * **내 메모가 위다.** 처음에는 인용을 위에 두고 메모를 아래에 붙였는데,
 * 사용자가 뒤집자고 했다. 맞는 말이었다.
 *
 * 고르는 순간에 필요한 것은 **"이걸 여기 넣을까"의 판단**이고, 그 판단은
 * 내가 그때 왜 적어뒀는지가 결정한다. 인용은 남의 글이라 훑어도 판단이
 * 서지 않고, 같은 자료에서 고른 문장들은 서로 비슷해 보이기까지 한다.
 * 인용은 "그게 뭐였더라"를 확인하는 자리이므로 아래에 줄여 둔다.
 *
 * 원문이 없는 기록(생각·질문)은 메모가 곧 본문이라 아래에 붙일 것이 없다.
 * 메모가 없는 기록은 인용이 위로 올라온다. 빈 줄을 만들지 않는다.
 */
function describe(capture: PickerCapture): { text: string; quote: string | null } {
  const memo = capture.content?.trim() ?? "";
  const quote = capture.originalText?.trim() ?? "";

  if (memo.length > 0) {
    return { text: memo, quote: quote.length > 0 ? quote : null };
  }

  return { text: quote.length > 0 ? quote : "내용 없는 기록", quote: null };
}

function rowClass(active: boolean): string {
  return active
    ? "flex w-full items-center gap-2 border-l-2 border-accent bg-accent-soft px-4 py-2 text-left text-black dark:border-accent-dark dark:bg-accent-dark-soft dark:text-zinc-50"
    : "flex w-full items-center gap-2 border-l-2 border-transparent px-4 py-2 text-left text-zinc-700 transition-colors hover:bg-black/[.03] dark:text-zinc-300 dark:hover:bg-white/[.05]";
}

/**
 * 놓을 수 있는 한 줄.
 *
 * **이미 놓인 것은 누를 수 없게 한다.** 눌러도 "이미 놓여 있습니다"가
 * 돌아올 뿐이고, 그 왕복은 사용자에게 아무것도 주지 않는다. 대신 이미
 * 놓였다고 그 자리에 적는다. 감추지는 않는다. 감추면 "내가 그걸 놓았던가"를
 * 확인할 길이 없다.
 */
function PlaceRow({
  value,
  already,
  badge,
  text,
  quote,
}: {
  value: string;
  already: boolean;
  badge: string;
  /** 위에 놓을 글. 기록이면 내 메모, 자료면 제목이다. */
  text: string;
  /**
   * 아래에 줄여서 붙일 인용문.
   *
   * **판단은 메모가 하고 확인은 인용이 한다.** 그래서 메모는 자르지 않고
   * 인용은 두 줄에서 자른다. 긴 인용 하나가 목록을 다 차지하면 고르는 일이
   * 훑는 일이 되지 못한다.
   */
  quote?: string | null;
}) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
        {badge}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {/*
          **자르지 않는다.** 이 글로 넣을지 말지를 정하는데 뒷부분이 잘려
          있으면 판단이 서지 않는다.
        */}
        <span
          className={
            already
              ? "whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-400"
              : "whitespace-pre-wrap text-sm leading-6 text-black dark:text-zinc-50"
          }
        >
          {text}
        </span>

        {/*
          **원문과 내 메모를 갈라 놓는다.** 이 앱의 가장 중요한 약속이고
          (2.4절), 한 줄에 붙여 놓으면 어디까지가 남의 글인지 알 수 없다.
          여기서는 색과 `인용` 표시로 가른다.
        */}
        {quote ? (
          <span className="flex min-w-0 gap-1.5">
            <span className="shrink-0 text-[10px] leading-5 text-zinc-400">
              인용
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 text-zinc-500">
              {quote}
            </span>
          </span>
        ) : null}
      </span>
    </>
  );

  if (already) {
    return (
      <div className="flex w-full items-start gap-2 px-4 py-2 opacity-60">
        {body}
        <span className="mt-0.5 shrink-0 text-[11px] text-zinc-500">
          이미 놓음
        </span>
      </div>
    );
  }

  return (
    <button
      type="submit"
      name="item"
      value={value}
      className="flex w-full items-start gap-2 px-4 py-2 text-left transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
    >
      {body}
    </button>
  );
}
