/**
 * `이 자리에 어울리는 것`이 화면에 주는 모양. (19-D-2)
 *
 * **`fit-actions.ts`에 두지 않는다.** `"use server"` 파일은 async 함수만
 * 내보낼 수 있다. (AGENTS.md 6절)
 */

/** 이 자리에 어울린다고 고른 것 하나. */
export type Fit = {
  /** `source:<id>` 또는 `capture:<id>`. `placeItem`에 그대로 넘긴다. */
  value: string;
  kind: "source" | "capture";
  /** 무엇인가. 사람이 읽을 한 줄. */
  label: string;
  /** 어디서 나온 것인가. 기록이면 그 기록이 달린 자료 이름이다. */
  origin: string;
  /** 눌러서 열어볼 곳. 없으면 누를 수 없다. */
  href: string | null;
  /** 왜 이 자리에 쓸 만한지. 비어 있을 수 있다. */
  reason: string;
};

export type FitState = {
  /** 어느 자리에 대한 답인가. 자리마다 창이 따로라 섞일 일은 없지만 밝혀둔다. */
  nodeId: string | null;
  /** 고른 것들. 아직 물어보지 않았으면 null. */
  fits: Fit[] | null;
  /**
   * 키워드로 훑은 것들. 이름만 담는다.
   *
   * **하나도 못 골랐을 때 이것이 없으면 원인을 알 수 없다.** 후보에 아예
   * 안 들어온 것인지, 들어왔는데 AI가 안 고른 것인지가 갈린다. 두 경우에
   * 고칠 곳이 완전히 다르다.
   *
   * 실제로 그 자리에서 막혔다. `내가 재미있게 보는 드라마는` 자리에서
   * "6개를 훑었지만 고르지 못했습니다"만 나왔고, **그 여섯이 무엇인지
   * 볼 방법이 없었다.** (AGENTS.md 5절 6번 `확인하는 수단을 결과에 묶지
   * 않는다`와 같은 생각이다)
   */
  looked: string[];
  error: string | null;
  /** 이번 달에 몇 번 더 물어볼 수 있는가. 모르면 null. */
  remaining: number | null;
};

export const EMPTY_FIT_STATE: FitState = {
  nodeId: null,
  fits: null,
  looked: [],
  error: null,
  remaining: null,
};
