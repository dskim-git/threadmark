import type { CaptureHit, SourceHit } from "@/lib/search/queries";

/**
 * 떠다니는 찾기 창이 주고받는 모양. (사용자 요청, 2026-09-25)
 *
 * **`dock-actions.ts`에 두지 않는다.** `"use server"` 파일은 async 함수만
 * 내보낼 수 있고, 내보낸 것은 전부 브라우저가 부를 수 있는 동작이 된다.
 * 이 저장소가 그 자리에 세 번 걸렸다. (AGENTS.md 6절 `Next.js 16`)
 */
export type DockState = {
  /** 무엇으로 찾았는가. 다시 그릴 때 칸에 남겨둔다. */
  term: string;
  /** 찾은 자료. 아직 찾지 않았으면 null. */
  sources: SourceHit[] | null;
  captures: CaptureHit[] | null;
  /** 잘못된 경우 사람에게 할 말. */
  error: string | null;
};

export const EMPTY_DOCK_STATE: DockState = {
  term: "",
  sources: null,
  captures: null,
  error: null,
};

/**
 * 창 안에 보여줄 최대 개수.
 *
 * 찾기 화면은 50건까지 보여준다. 이 창은 **작업하다 곁눈질하는 자리**라
 * 그만큼 필요하지 않다. 길어지면 스크롤만 길어지고, 정말 많이 봐야 할 때는
 * 찾기 화면으로 가는 편이 낫다. 그 길을 창 안에 둔다.
 */
export const DOCK_LIMIT = 8;
