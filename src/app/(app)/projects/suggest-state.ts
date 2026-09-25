/**
 * 자리 추천이 화면에 주는 모양. (19-D)
 *
 * **`suggest-actions.ts`에 두지 않는다.** `"use server"` 파일은 async
 * 함수만 내보낼 수 있고, 내보낸 것은 전부 브라우저가 부를 수 있는 동작이
 * 된다. 이 저장소가 그 자리에 여러 번 걸렸다. (AGENTS.md 6절)
 */

/** 재료 하나에 대한 추천. 화면이 이 한 줄로 `여기에 놓기`를 그린다. */
export type Suggestion = {
  /** `source:<id>` 또는 `capture:<id>`. `placeItem`에 그대로 넘긴다. */
  value: string;
  /** 무엇을 놓는가. 사람이 읽을 한 줄. */
  itemLabel: string;
  /** 자료인가 기록인가. */
  kind: "source" | "capture";
  /** 어디에 놓으라는가. */
  nodeId: string;
  /** 자리의 이름. 위 자리를 이어 붙인 것이다. */
  nodePath: string;
  /** 왜 그 자리인지. 비어 있을 수 있다. */
  reason: string;
};

export type SuggestState = {
  /** 추천 목록. 아직 물어보지 않았으면 null. */
  suggestions: Suggestion[] | null;
  /**
   * 물어봤는데 하나도 고르지 않은 재료의 개수.
   *
   * **감추지 않는다.** 여덟 개를 물었는데 셋만 나오면, 나머지 다섯이
   * 빠진 것인지 어울리는 자리가 없다는 뜻인지 알 수 없다.
   */
  skipped: number;
  error: string | null;
  /** 이번 달에 몇 번 더 물어볼 수 있는가. 모르면 null. */
  remaining: number | null;
};

export const EMPTY_SUGGEST_STATE: SuggestState = {
  suggestions: null,
  skipped: 0,
  error: null,
  remaining: null,
};
