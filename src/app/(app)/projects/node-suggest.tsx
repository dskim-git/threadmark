"use client";

import { useActionState } from "react";

import { suggestForNode } from "./fit-actions";
import { EMPTY_FIT_STATE, type FitState } from "./fit-state";
import { placeItem } from "./placement-actions";

/**
 * 이 자리에 어울리는 것을 담아둔 것 전부에서 찾아준다. (19-D-2, 사용자 요청)
 *
 * `SuggestPanel`과 방향이 반대다.
 *
 *   저쪽  자리를 못 찾은 것들 → 어느 자리에 놓을까
 *   이쪽  이 자리 → 담아둔 것 전부에서 무엇을 가져올까
 *
 * **이쪽이 더 값지다.** 이미 이어둔 것은 내가 아는 것이고, 이쪽은 잊고
 * 있던 것을 찾아준다.
 *
 * 왜 자리마다 단추를 두는가
 *   19-D를 만들 때는 "자리마다 단추를 달면 스물한 번 물을 수 있게 된다"고
 *   보고 한 번에 묻는 쪽으로 만들었다. 여기는 다르다. **묻는 물음이
 *   자리마다 다르다.** 한 번에 물으면 후보를 스물한 자리 몫으로 모아야
 *   하고, 그러면 넘길 글이 감당이 안 된다.
 *
 *   대신 단추를 **자리를 펼쳤을 때만** 보이게 둔다. 자리는 `details`로
 *   접혀 있어서, 펼치는 것 자체가 "이 자리를 지금 손보는 중"이라는 뜻이다.
 *
 * **AI가 놓지 않는다.** 누르는 것은 사람이다. 놓는 동작은 고르는 창이
 * 쓰는 것과 같은 `placeItem`이다.
 */
export function NodeSuggest({
  projectId,
  nodeId,
  configured,
}: {
  projectId: string;
  nodeId: string;
  configured: boolean;
}) {
  const [state, formAction, pending] = useActionState<FitState, FormData>(
    suggestForNode,
    EMPTY_FIT_STATE,
  );

  if (!configured) {
    return null;
  }

  /*
    이 창은 자리마다 따로 있지만, `useActionState`가 든 상태는 이 창의
    것이다. 그래도 어느 자리의 답인지 한 번 더 확인한다. **자리를 지우고
    다시 만드는 사이에 답이 남아 있을 수 있다.**
  */
  const mine = state.nodeId === null || state.nodeId === nodeId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="nodeId" value={nodeId} />
          <button
            type="submit"
            disabled={pending}
            className="h-8 whitespace-nowrap rounded-full border border-black/[.12] px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.06]"
          >
            {pending ? "찾아보는 중…" : "AI에게 이 자리에 쓸 것 물어보기"}
          </button>
        </form>

        {!pending && mine && state.remaining !== null ? (
          <span className="text-[11px] text-zinc-500">
            이번 달 {state.remaining}번 남음
          </span>
        ) : null}
      </div>

      {pending ? (
        <p className="text-xs leading-5 text-zinc-500">
          담아둔 것 전부에서 이 자리와 겹치는 것을 훑고 있습니다. 몇 초
          걸립니다.
        </p>
      ) : null}

      {mine && state.error ? (
        <p
          role="alert"
          className="text-xs leading-5 text-red-700 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {mine && state.fits !== null ? (
        state.fits.length === 0 ? (
          /*
            **무엇을 훑었는지 볼 수 있게 둔다.** 개수만 말하면 후보에 아예
            안 들어온 것인지 AI가 안 고른 것인지 알 수 없고, 그 둘은 고칠
            곳이 완전히 다르다. 실제로 그 자리에서 막혔다.
          */
          <div className="flex flex-col gap-1">
            <p className="text-xs leading-5 text-zinc-500">
              {state.looked.length}개를 훑었지만 이 자리에 쓸 만한 것을 고르지
              못했습니다. 억지로 고르지 않은 것입니다.
            </p>
            <LookedList looked={state.looked} />
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {state.fits.map((fit) => (
                <li
                  key={fit.value}
                  className="flex flex-col gap-1.5 rounded-xl border border-black/[.08] bg-zinc-50 px-3 py-2 dark:border-white/[.145] dark:bg-white/[.04]"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[11px] text-zinc-500">
                      {fit.kind === "capture" ? "기록" : "자료"}
                    </span>
                    {/*
                      **새 탭에서 연다.** 뼈대를 손보는 중에 화면이 바뀌면
                      하던 일을 잃는다. 띄워놓고 찾기와 같은 판단이다.
                    */}
                    {fit.href ? (
                      <a
                        href={fit.href}
                        target="_blank"
                        rel="noopener"
                        className="text-[11px] text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                      >
                        {fit.origin}
                      </a>
                    ) : (
                      <span className="text-[11px] text-zinc-500">
                        {fit.origin}
                      </span>
                    )}
                  </div>

                  <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-zinc-800 dark:text-zinc-200">
                    {fit.label}
                  </p>

                  {fit.reason ? (
                    <p className="text-[11px] leading-4 text-accent dark:text-accent-dark">
                      {fit.reason}
                    </p>
                  ) : null}

                  <form action={placeItem} className="flex">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="nodeId" value={nodeId} />
                    <input type="hidden" name="item" value={fit.value} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={`/projects/${projectId}`}
                    />
                    <button
                      type="submit"
                      className="h-7 rounded-full bg-zinc-900 px-3 text-[11px] font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                    >
                      이 자리에 놓기
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <p className="text-[11px] leading-4 text-zinc-500">
              이 프로젝트에 이어두지 않은 것도 함께 찾습니다. 놓으면 프로젝트에
              자동으로 이어집니다. AI의 판단이라 틀릴 수 있으니 누르기 전에
              한 번 열어보세요.
            </p>

            {/*
              **골랐을 때도 훑은 목록을 볼 수 있게 둔다.** 문제가 있을 때만
              보여주면 문제를 발견할 방법 자체가 없어진다. 13-D에서 겪은
              것과 같다. (AGENTS.md 5절 6번)
            */}
            <LookedList looked={state.looked} />
          </>
        )
      ) : null}
    </div>
  );
}

/**
 * 키워드로 훑은 것들을 접어서 보여준다.
 *
 * **접어 두는 까닭.** 평소에 볼 것은 아니다. 하나도 못 골랐을 때, 또는
 * 엉뚱한 것을 골랐을 때 **무엇을 보고 그랬는지** 확인하는 자리다.
 * 펼치는 데 브라우저 코드가 필요 없어 `details`로 둔다.
 */
function LookedList({ looked }: { looked: readonly string[] }) {
  if (looked.length === 0) {
    return null;
  }

  return (
    <details className="text-[11px] leading-4 text-zinc-500">
      <summary className="cursor-pointer">
        훑어본 {looked.length}개 보기
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 pl-3">
        {looked.map((name, index) => (
          <li key={`${index}-${name}`} className="truncate">
            · {name}
          </li>
        ))}
      </ul>
    </details>
  );
}
