"use client";

import { useActionState } from "react";

import { placeItem } from "./placement-actions";
import { suggestPlacements } from "./suggest-actions";
import { EMPTY_SUGGEST_STATE, type SuggestState } from "./suggest-state";

/**
 * 자리를 못 찾은 재료들이 어디에 어울리는지 물어본다. (19-D)
 *
 * 왜 재료마다가 아니라 한 번에 묻는가
 *   자리마다 물으면 뼈대가 스물한 자리일 때 스물한 번이 나간다. 한 달에
 *   쓸 수 있는 것이 예순 번이다. 판단은 같은 판단이고, 한 번에 보면
 *   **한 재료가 두 자리에 겹쳐 추천되는 일도 덜하다.**
 *
 * **AI가 놓지 않는다.** 자리를 제안할 뿐이고 놓는 것은 사람이 누른다.
 * 스무 개가 한꺼번에 잘못 놓이면 무엇이 원래 자리였는지도 알 수 없다.
 * 되돌리기 어려운 일을 AI에게 맡기지 않는다.
 *
 * **놓는 일은 새로 만들지 않았다.** 줄마다 달린 단추가 `placeItem`을
 * 그대로 부른다. 고르는 창이 쓰는 것과 같은 동작이라, 두 벌이 되면
 * 한쪽만 고쳐졌을 때 놓이는 모양이 달라진다.
 */
export function SuggestPanel({
  projectId,
  unplacedCount,
  configured,
}: {
  projectId: string;
  /** 자리를 못 찾은 것이 몇 개인가. 없으면 단추를 그리지 않는다. */
  unplacedCount: number;
  /** AI 설정이 되어 있는가. 없으면 눌러야만 안 된다는 것을 알게 된다. */
  configured: boolean;
}) {
  const [state, formAction, pending] = useActionState<SuggestState, FormData>(
    suggestPlacements,
    EMPTY_SUGGEST_STATE,
  );

  if (!configured || unplacedCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            disabled={pending}
            className="h-8 whitespace-nowrap rounded-full border border-black/[.12] px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.06]"
          >
            {pending ? "자리를 고르는 중…" : "AI에게 자리 물어보기"}
          </button>
        </form>

        {/*
          남은 횟수를 보여준다. 물어본 뒤에만 알 수 있는 값이라 그전에는
          비어 있다. 창의 AI 단추와 달리 여기는 미리 세지 않는다.
          이 화면을 열 때마다 세면 물어볼 생각이 없는 사람에게도 질의가 는다.
        */}
        {!pending && state.remaining !== null ? (
          <span className="text-[11px] text-zinc-500">
            이번 달 {state.remaining}번 남음
          </span>
        ) : null}
      </div>

      {pending ? (
        <p className="text-xs leading-5 text-zinc-500">
          뼈대의 자리와 재료를 함께 읽고 있습니다. 몇 초 걸립니다.
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="text-xs leading-5 text-red-700 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.suggestions !== null ? (
        state.suggestions.length === 0 ? (
          <p className="text-xs leading-5 text-zinc-500">
            어울리는 자리를 고르지 못했습니다. 자리 이름이 아직 비슷비슷하면
            그럴 수 있습니다. 자리에 글을 조금 쓰고 다시 물어보세요.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {state.suggestions.map((suggestion) => (
                <li
                  key={suggestion.value}
                  className="flex flex-col gap-1.5 rounded-xl border border-black/[.08] bg-white px-3 py-2 dark:border-white/[.145] dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[11px] text-zinc-500">
                      {suggestion.kind === "capture" ? "기록" : "자료"}
                    </span>
                    <span className="line-clamp-1 text-xs text-black dark:text-zinc-50">
                      {suggestion.itemLabel}
                    </span>
                  </div>

                  <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    <span className="text-accent dark:text-accent-dark">
                      {suggestion.nodePath}
                    </span>
                    {suggestion.reason ? ` · ${suggestion.reason}` : null}
                  </p>

                  {/*
                    누르는 것은 사람이다. 놓는 동작은 고르는 창이 쓰는 것과
                    같은 `placeItem`이다.
                  */}
                  <form action={placeItem} className="flex">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="nodeId" value={suggestion.nodeId} />
                    <input type="hidden" name="item" value={suggestion.value} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={`/projects/${projectId}`}
                    />
                    <button
                      type="submit"
                      className="h-7 rounded-full bg-zinc-900 px-3 text-[11px] font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                    >
                      여기에 놓기
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            {/*
              고르지 못한 것이 있으면 밝힌다. **감추면 빠진 것인지 어울리는
              자리가 없다는 뜻인지 알 수 없다.**
            */}
            {state.skipped > 0 ? (
              <p className="text-[11px] leading-4 text-zinc-500">
                {state.skipped}개는 어울리는 자리를 고르지 못했습니다. 억지로
                놓지 않은 것입니다.
              </p>
            ) : null}

            <p className="text-[11px] leading-4 text-zinc-500">
              AI의 판단이라 틀릴 수 있습니다. 누르기 전에 재료와 자리를
              한 번 보세요.
            </p>
          </>
        )
      ) : null}
    </div>
  );
}
