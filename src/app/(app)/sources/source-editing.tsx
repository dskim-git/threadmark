"use client";

import { createContext, useContext, useState } from "react";

import { PencilIcon } from "@/app/(app)/pencil-icon";

/**
 * 자료 화면의 **고치는 상태**. (2026-10-04, 사용자가 쓰다가 말함)
 *
 * > 각 자료를 눌러보면 여기도 마찬가지로 기본값이 수정할 수 있는 창들로
 * > 되어 있어. (…) 그 버튼을 누르지 않았을 때는 입력되어 있는 내용들이
 * > 편집창처럼 나오지 않고 깔끔하게 기록되어 있는 화면을 보이게 해줘.
 *
 * 기록 카드에서 같은 말을 들은 그 다음이다. (`capture-editing.tsx`)
 * **그때 기록만 고치고 자료는 그대로 두었다.** 같은 고장이 두 자리에
 * 있었는데 한 자리만 보았다.
 *
 * 무엇이 문제였나
 *   음악·책·YouTube·장소·영화 칸이 **늘 펼친 폼이었다.** 담아둔 값을
 *   보려고 자료를 열면 입력칸 열대여섯 개가 먼저 보인다. 담긴 내용이
 *   한눈에 들어오지 않는다.
 *
 *   **논문만 달랐다.** `PaperSummary`가 읽기 전용으로 보여주고 `고치기`
 *   링크를 따로 둔다. 갈래마다 쓰는 법이 다르면 읽는 사람이 자료 갈래를
 *   바꿀 때마다 새로 익혀야 한다.
 *
 * 왜 화면 하나에 단추 하나인가
 *   기록 쪽은 **카드마다 따로** 접힌다. 목록이 길고 두 카드를 함께 펴
 *   두고 견주는 일이 있어서다.
 *
 *   자료는 화면 하나가 자료 하나다. 칸마다 연필을 달면 **한 화면에 연필이
 *   다섯 개** 생기고, 무엇을 눌러야 하는지가 더 어려워진다. 사용자가
 *   가리킨 자리도 하나다. `제목·설명 고치기` 옆이다.
 *
 * 왜 CSS로 하지 않나
 *   `<details>`로 접으면 **접힌 내용이 화면에 그려진 채로 남는다.** 그
 *   안에 입력칸과 폼이 들어 있어서 탭 이동이 거기로 빠지고, 읽어주는
 *   기계도 읽는다. (기록 쪽에 같은 까닭을 적어 두었다)
 */

const EditingContext = createContext<{
  editing: boolean;
  toggle: () => void;
} | null>(null);

/**
 * 자료 화면을 감싼다. 안쪽의 단추와 갈래 칸들이 이 상태를 함께 본다.
 *
 * **서버 컴포넌트를 자식으로 받는다.** 자료 화면은 서버에서 그려지고
 * 이것만 브라우저에서 돈다. 상태는 브라우저에만 있으면 되므로 그 경계가
 * 여기다.
 */
export function SourceEditing({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);

  return (
    <EditingContext.Provider
      value={{ editing, toggle: () => setEditing((value) => !value) }}
    >
      {children}
    </EditingContext.Provider>
  );
}

/**
 * 고치는 중인가. **감싸지 않은 곳에서도 쓸 수 있다.**
 *
 * 기록 쪽은 감싸지 않으면 오류를 냈다. 거기서는 카드가 반드시 감싸여
 * 있어야 하고, 안 감싸인 것은 만든 사람의 실수다.
 *
 * 여기는 다르다. 갈래 칸들은 **자료 화면 밖에서도 쓰일 수 있고**, 그때는
 * "늘 고치는 중"이 맞다. 감싸지 않았다고 화면이 깨지는 것보다 낫다.
 * 지금은 다섯 칸 모두 자료 화면에서만 쓰지만, 그 사실에 기대지 않는다.
 */
export function useSourceEditing(): boolean {
  return useContext(EditingContext)?.editing ?? true;
}

/**
 * 고치는 중에만 보이는 칸.
 *
 * 잇는 단추, 떼는 단추, 적는 칸이 여기 들어간다. **읽을 때는 담긴 것만
 * 보여주고 바꾸는 길은 숨긴다.** (2026-10-04, 사용자 요청)
 *
 * > 이미지의 부분들도 연필로 수정모드가 될때만 연결할 수 있게 해주고
 * > 수정모드가 아닐 때는 등록(기록, 연결)된 것만 나오게 해주면 돼.
 */
export function WhenEditing({ children }: { children: React.ReactNode }) {
  return useSourceEditing() ? <>{children}</> : null;
}

/** 읽는 중에만 보이는 칸. 같은 것이 두 모양으로 동시에 보이지 않게 한다. */
export function WhenReading({ children }: { children: React.ReactNode }) {
  return useSourceEditing() ? null : <>{children}</>;
}

/*
  **`WhenRecorded`를 두었다가 지웠다.** (2026-10-05)

  담긴 것이 없으면 칸째로 숨기는 장치였다. 사용자가 **그 자리가 보여야
  한다**고 했다.

  > 아무것도 담지 않아도 그 자리에 있어야 할 칸은 보이는게 좋을 것 같아.
  > (…) 그 자리가 프로젝트에 해당하는 빈칸(프로젝트라는 이름은 있어야
  > 겠지?)이 나왔으면 좋을 것 같아.

  **칸 이름이 그 자리가 무엇을 담는 곳인지 말한다.** 숨기면 그 말까지
  사라져서, 처음 쓰는 사람은 자료에 프로젝트를 이을 수 있다는 것조차
  모른다. 숨겨서 얻는 깔끔함보다 그 말이 크다.

  쓰는 곳이 없어진 장치를 남겨두지 않는다. 필요해지면 그때 다시 만든다.
*/

/**
 * 고치기를 켜고 끄는 단추. `제목·설명 고치기` 옆에 놓는다.
 *
 * **기록 카드와 같은 연필을 쓴다.** 같은 일을 가리키는 그림이 화면마다
 * 다르면 읽는 사람이 둘을 다른 것으로 여긴다. (`pencil-icon.tsx`)
 *
 * 켜져 있을 때 모양이 달라진다. **무엇이 켜져 있는지 보이지 않으면 왜
 * 아래에 입력칸이 생겼는지 알 수 없다.**
 */
export function SourceEditButton() {
  const value = useContext(EditingContext);

  if (value === null) {
    return null;
  }

  const { editing, toggle } = value;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      aria-label={editing ? "고치기 닫기" : "고치기"}
      title={editing ? "고치기 닫기" : "담아둔 값 고치기"}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors ${
        editing
          ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
          : "border-transparent text-zinc-400 hover:border-black/[.08] hover:bg-black/[.04] hover:text-black dark:hover:border-white/[.145] dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
      }`}
    >
      <PencilIcon />
    </button>
  );
}
