"use client";

import { useState } from "react";

import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";

/**
 * 지금 보는 쪽에 메모를 남기는 자리. (설계 문서 22절의 `페이지 메모`)
 *
 * 문장을 고르는 자리와 나눠 둔 이유가 있다. 저 쪽은 "자료가 한 말"을 그대로
 * 담고 내 메모를 곁들이는 자리이고, 이 쪽은 처음부터 "내가 한 말"만 담는
 * 자리다. 설계 문서 2.4절의 구분이 두 자리의 생김새부터 달라야 한다.
 *
 * 그래서 여기에는 인용을 보여주는 칸이 없고, 메모가 비면 저장할 수 없다.
 * 남길 말이 없는 페이지 메모는 의미가 없다.
 *
 * 스캔 이미지 PDF에서는 이것이 유일한 길이다. 고를 글자가 없기 때문이다.
 * 9.5절의 안내문이 약속하는 것이 이 기능이다.
 *
 * 14-E에서 떠 있는 창을 걷어내고 오른쪽 패널의 `메모` 탭에 두었다.
 * 늘 자리에 있으므로 닫기와 취소가 없다. 닫을 것이 없기 때문이다.
 * 자동 초점도 주지 않는다. 늘 떠 있는 칸이 초점을 가져가면, 패널을 열
 * 때마다 화면이 그리로 끌려가고 PDF의 키보드 넘김이 막힌다.
 */
export function PageMemoPanel({
  page,
  busy,
  onSave,
}: {
  page: number;
  busy: boolean;
  onSave: (memo: string) => void;
}) {
  const [memo, setMemo] = useState("");

  const trimmed = memo.trim();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-zinc-500">{page}쪽에 메모</span>

      <label htmlFor="page-memo" className="sr-only">
        {page}쪽에 남길 메모
      </label>
      <textarea
        id="page-memo"
        rows={4}
        maxLength={MAX_TEXT_LENGTH}
        value={memo}
        disabled={busy}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="이 쪽에 대해 남길 말을 적습니다. 나중에 이 쪽으로 바로 돌아올 수 있습니다."
        className="resize-none rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => onSave(trimmed)}
          disabled={busy || trimmed.length === 0}
          className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          {busy ? "저장하는 중…" : "메모 저장"}
        </button>
      </div>
    </div>
  );
}
