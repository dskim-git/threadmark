"use client";

import { useState } from "react";

import { MAX_TAG_LENGTH } from "@/lib/tags/name";

/**
 * 태그 이름. 평소에는 글자이고, 고칠 때만 글상자가 된다.
 *
 * 처음에는 줄마다 글상자를 늘어놓았다. 고치는 걸음이 하나 줄어든다고 생각했는데
 * 반대였다. **화면을 열자마자 전부 고칠 수 있는 상태로 보여서, 목록을 보러 온
 * 사람에게 "여기는 고치는 곳"이라고 말하는 화면이 되었다.** 글상자가 여럿 놓인
 * 화면은 읽기도 어렵다.
 *
 * 이 칸이 브라우저에서 도는 이유는 하나다. **화면을 옮기지 않고 고치기로
 * 바꾸기 위해서다.** 주소에 `?edit=<id>`를 붙이는 방법도 있지만 그러면 누를
 * 때마다 서버에 다녀와야 한다. 고치려고 누른 것뿐인데 화면이 한 번 넘어간다.
 *
 * 저장은 서버가 한다. 이 칸은 글상자를 보여줄지 말지만 정한다.
 */
export function TagName({
  action,
  tagId,
  name,
  returnTo,
}: {
  /** renameTag. 서버에서 돈다. */
  action: (formData: FormData) => Promise<void>;
  tagId: string;
  name: string;
  returnTo: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex min-w-60 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-black dark:text-zinc-50">
          {name}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="h-8 shrink-0 rounded-full border border-black/[.08] px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex min-w-60 flex-1 items-center gap-2">
      <input type="hidden" name="tagId" value={tagId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <label htmlFor={`tag-name-${tagId}`} className="sr-only">
        태그 이름
      </label>
      <input
        id={`tag-name-${tagId}`}
        name="name"
        type="text"
        required
        // 누르자마자 칠 수 있게 한다. 한 번 더 누르게 하지 않는다.
        autoFocus
        maxLength={MAX_TAG_LENGTH}
        defaultValue={name}
        onKeyDown={(event) => {
          // Esc로 물러난다. 고치다 만 글은 버린다. 저장은 저장 단추로만 한다.
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        className="h-9 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      <button
        type="submit"
        className="h-9 shrink-0 rounded-full bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
      >
        저장
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="h-9 shrink-0 rounded-full border border-black/[.08] px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
      >
        취소
      </button>
    </form>
  );
}
