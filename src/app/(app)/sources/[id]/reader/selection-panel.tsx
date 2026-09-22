"use client";

import { useEffect, useState } from "react";

import type { PdfSelectionLocator } from "@/lib/captures/pdf-locator";
import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";

/**
 * 고른 문장을 기록으로 남기는 작은 창. (설계 문서 9.4절)
 *
 * 설계 문서 2.4절대로 자리를 나눠 보여준다.
 *
 *   위쪽  PDF에서 고른 문장 — 자료가 한 말. 고칠 수 없다.
 *   아래쪽 내 메모 — 내가 한 말. 비워도 된다.
 *
 * 고른 문장을 고칠 수 없게 둔 것이 중요하다. 인용은 원문 그대로여야 하고,
 * 여기서 손댈 수 있으면 나중에 "이게 정말 논문에 있던 말인가"를 확인할 수 없다.
 * 다듬고 싶다면 그것은 인용이 아니라 바꾸어 쓰기이며, 메모란에 적을 일이다.
 *
 * 9.4절의 메뉴에는 번역도 있다. 그것은 13-C에서 붙인다.
 */

export function SelectionPanel({
  locator,
  anchor,
  busy,
  onSave,
  onDismiss,
}: {
  locator: PdfSelectionLocator;
  /** 고른 자리의 화면 좌표. 이 근처에 창을 띄운다. */
  anchor: { left: number; top: number; bottom: number };
  busy: boolean;
  onSave: (memo: string) => void;
  onDismiss: () => void;
}) {
  /*
    고른 글이 바뀌면 메모도 비워져야 한다. 앞 문장에 쓰던 메모가 남으면
    엉뚱한 문장에 붙는다.

    여기서 비우지 않고 부르는 쪽이 key를 바꿔 이 창을 새로 만든다.
    effect로 상태를 되돌리면 한 번 그린 뒤에 다시 그리게 되고,
    그 사이에 예전 메모가 잠깐 보인다.
  */
  const [memo, setMemo] = useState("");

  // Esc로 닫는다. 읽는 중에 창이 걸리적거릴 때 손이 먼저 가는 키다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  /*
    화면 위쪽에 고른 글이 있으면 창을 아래에 띄우고, 아래쪽이면 위에 띄운다.
    고른 글을 창이 가리면 무엇을 저장하는지 볼 수 없다.
  */
  const below = anchor.top < window.innerHeight / 2;

  return (
    <div
      role="dialog"
      aria-label="고른 문장 저장"
      style={{
        left: Math.min(Math.max(anchor.left, 180), window.innerWidth - 180),
        top: below ? anchor.bottom + 12 : undefined,
        bottom: below ? undefined : window.innerHeight - anchor.top + 12,
      }}
      className="fixed z-50 w-[22rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-black/[.08] bg-white p-4 shadow-lg dark:border-white/[.145] dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-zinc-500">
            {locator.page}쪽에서 고른 문장
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="text-sm text-zinc-400 transition-colors hover:text-black dark:hover:text-zinc-50"
          >
            ×
          </button>
        </div>

        {/*
          고른 문장은 읽기만 한다. 인용은 원문 그대로여야 한다. (설계 문서 2.4절)
        */}
        <blockquote className="max-h-32 overflow-auto rounded-lg border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-800 dark:border-zinc-600 dark:bg-white/[.04] dark:text-zinc-200">
          {locator.selectedText}
        </blockquote>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="selection-memo"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            내 메모 (선택)
          </label>
          <textarea
            id="selection-memo"
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            value={memo}
            disabled={busy}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="이 문장을 어떻게 읽었는지 적어둘 수 있습니다."
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="h-9 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(memo)}
            disabled={busy}
            className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {busy ? "저장하는 중…" : "인용 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
