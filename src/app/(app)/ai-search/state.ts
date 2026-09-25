import type { AskItem } from "@/lib/ai/types";

/**
 * 물어본 결과의 모양. (16-A-2)
 *
 * **왜 `actions.ts`에 두지 않았나.** `"use server"` 파일은 async 함수만
 * 내보낼 수 있고, 내보낸 것은 전부 브라우저가 부를 수 있는 동작이 된다.
 * 상수를 하나 두었다가 빌드가 멈춘 적이 이 저장소에 두 번 있다.
 * (AGENTS.md 6절 `Next.js 16`)
 *
 * 타입만이면 지워지니 괜찮지만, 빈 값도 함께 두어야 해서 파일을 나눴다.
 * 화면과 Server Action이 같은 모양을 봐야 하므로 둘 다 여기서 읽는다.
 */
export type AskState = {
  /** 물어본 것. 다시 그릴 때 칸에 남겨둔다. */
  question: string;
  /** 답. 없으면 아직 묻지 않았거나 실패한 것이다. */
  answer: string | null;
  /** 답이 근거로 가리킨 것들. 답에 나온 순서다. */
  cited: AskItem[];
  /** 잘못된 경우 사람에게 할 말. */
  error: string | null;
  /** 이번 달에 몇 번 더 물어볼 수 있는가. 모르면 null. */
  remaining: number | null;
};

export const EMPTY_ASK_STATE: AskState = {
  question: "",
  answer: null,
  cited: [],
  error: null,
  remaining: null,
};

/**
 * 남은 횟수를 알릴 기준.
 *
 * **평소에는 남은 횟수를 보여주지 않는다.** 늘 보이면 셈하면서 쓰게 된다.
 * 얼마 안 남았을 때만 알린다. 그때는 알아야 다음을 대비할 수 있다.
 */
export const REMAINING_WARNING_THRESHOLD = 20;
