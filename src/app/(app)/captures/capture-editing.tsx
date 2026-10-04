"use client";

import { createContext, useContext, useState } from "react";

import { PencilIcon } from "@/app/(app)/pencil-icon";

/**
 * 기록 카드의 **고치는 상태**. (2026-10-04, 사용자가 쓰다가 말함)
 *
 * > 자료에 저장된 메모의 형태가 계속 수정(편집)가능한 상태의 창으로 나오니까
 * > 사실 그 자료에 저장된 메모가 한눈에 들어오지 못하고 너무 산만해보여.
 *
 * 무엇이 문제였나
 *   카드마다 **태그 적는 칸과 단추 다섯 개가 늘 펼쳐져 있었다.** 기록
 *   하나를 읽는 데 필요한 것은 인용과 내 메모인데, 그 아래가 고치는
 *   도구로 가득 차 있어서 **기록 셋만 있어도 화면이 도구로 뒤덮였다.**
 *
 *   도구가 늘어난 것은 하나씩이었다. 태그, 자리에 놓기, 프로젝트에 잇기.
 *   더할 때마다 "하나쯤이야"였고, 다 모이고 나서야 보였다.
 *
 * 왜 자리를 나눠야 했나
 *   **단추는 날짜 왼쪽에 있고 숨는 것은 카드 아래쪽에 있다.** 둘이 멀리
 *   떨어져 있어서 한 칸으로 감쌀 수 없다. 그래서 상태를 context로 나눠
 *   쓰고, 단추와 숨는 칸이 각자 그 값을 본다.
 *
 *   `Reveal`(panel.tsx)을 쓰지 못하는 까닭이 그것이다. 그쪽은 단추와
 *   내용이 붙어 있는 경우를 위한 것이다.
 *
 * 왜 CSS로 하지 않나
 *   `<details>`로 접으면 자바스크립트가 없어도 되는데, **접힌 내용이
 *   화면에 그려진 채로 남는다.** 그 안에 입력 칸과 폼이 들어 있어서 탭
 *   이동이 거기로 빠지고, 읽어주는 기계도 읽는다. 눌러야 나타나는 편이
 *   맞다.
 */

const EditingContext = createContext<{
  editing: boolean;
  toggle: () => void;
} | null>(null);

/**
 * 카드 하나를 감싼다. 안쪽의 단추와 숨는 칸이 이 상태를 함께 본다.
 *
 * **카드마다 따로 접힌다.** 한 곳에서 모아 들고 있으면 하나를 펴는 순간
 * 다른 카드가 다시 그려진다. 목록이 길면 그만큼 느려지고, 무엇보다
 * 두 카드를 함께 펴 두고 견주는 일을 막을 이유가 없다.
 */
export function CaptureEditing({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);

  return (
    <EditingContext.Provider
      value={{ editing, toggle: () => setEditing((value) => !value) }}
    >
      {children}
    </EditingContext.Provider>
  );
}

function useEditing() {
  const value = useContext(EditingContext);

  if (!value) {
    throw new Error("CaptureEditing 안에서만 쓸 수 있습니다.");
  }

  return value;
}

/**
 * 고치기를 켜고 끄는 단추. 날짜 왼쪽에 놓는다.
 *
 * **글자가 아니라 그림으로 둔다.** 그 줄에는 이미 갈래 이름과 쪽 번호와
 * 날짜와 별이 있다. 거기에 `편집`이라는 글자를 더하면 줄이 넘친다.
 * 읽어주는 기계에는 `aria-label`로 말한다.
 *
 * 켜져 있을 때 모양이 달라진다. **무엇이 켜져 있는지 보이지 않으면 왜
 * 아래에 칸이 생겼는지 알 수 없다.**
 */
export function CaptureEditButton() {
  const { editing, toggle } = useEditing();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      aria-label={editing ? "고치기 닫기" : "고치기"}
      title={editing ? "고치기 닫기" : "고치기"}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors ${
        editing
          ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
          : "border-transparent text-zinc-400 hover:border-black/[.08] hover:bg-black/[.04] hover:text-black dark:hover:border-white/[.145] dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
      }`}
    >
      {/*
        연필. 자료 화면의 고치기 단추와 **같은 그림을 쓴다.**
        (2026-10-04) 한때 이 파일 안에 그려 두었는데, 쓰는 곳이 둘이
        되면서 `pencil-icon.tsx`로 떼어냈다.
      */}
      <PencilIcon />
    </button>
  );
}

/** 고치기를 켰을 때만 보이는 칸. */
export function WhenEditing({ children }: { children: React.ReactNode }) {
  return useEditing().editing ? <>{children}</> : null;
}

/**
 * 고치기를 껐을 때만 보이는 칸.
 *
 * 읽기 상태에서 보여줄 것들이다. 태그와 이어진 프로젝트가 그렇다.
 * **고치는 중에는 숨긴다.** 같은 것이 두 모양으로 동시에 보이면 어느
 * 쪽을 눌러야 하는지 알 수 없다.
 */
export function WhenReading({ children }: { children: React.ReactNode }) {
  return useEditing().editing ? null : <>{children}</>;
}
