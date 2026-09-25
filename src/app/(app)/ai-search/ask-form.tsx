"use client";

import { useActionState } from "react";
import Link from "next/link";

import { askAboutMyNotes } from "./actions";
import {
  EMPTY_ASK_STATE,
  REMAINING_WARNING_THRESHOLD,
  type AskState,
} from "./state";

/**
 * 담아둔 것에서 물어보는 칸. (설계 문서 19절)
 *
 * **왜 브라우저에서 도는 코드가 필요한가.** 이 저장소의 폼은 거의 전부
 * 서버에서 그리고 Server Action이 끝나면 주소로 되돌아온다. 여기는 다르다.
 *
 * 답은 몇 문단짜리 글이라 주소에 담을 수 없고, 담아서도 안 된다. 주소에
 * 남으면 새로고침할 때마다 다시 물어보게 되고 **새로고침 한 번이 돈 한
 * 번이다.** (`actions.ts`) 그래서 결과를 화면이 들고 있는다.
 *
 * `useActionState`가 그 일을 한다. 누를 때만 서버로 가고, 돌아온 것을
 * 화면이 쥔다. 주소는 그대로다.
 *
 * **기다리는 동안 무슨 일이 일어나는지 보여준다.** 다른 폼은 눌러서 곧
 * 끝나지만 이것은 몇 초 걸린다. 아무 반응이 없으면 한 번 더 누르게 되고,
 * 그러면 돈이 두 번 나간다. 그래서 누르는 동안 단추를 잠근다.
 */
export function AskForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState<AskState, FormData>(
    askAboutMyNotes,
    EMPTY_ASK_STATE,
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <label htmlFor="question" className="sr-only">
          물어볼 것
        </label>
        <textarea
          id="question"
          name="question"
          rows={3}
          defaultValue={state.question}
          disabled={!configured}
          placeholder="모델링 수업에서 학생들이 자주 걸리는 데가 어디였지?"
          className="w-full resize-y rounded-lg border border-black/[.08] bg-white px-4 py-3 text-sm leading-6 text-black disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !configured}
            className="h-11 whitespace-nowrap rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {pending ? "찾아보는 중…" : "물어보기"}
          </button>

          {pending ? (
            <span className="text-xs text-zinc-500">
              담아둔 것에서 찾아 읽고 있습니다. 몇 초 걸립니다.
            </span>
          ) : null}

          {/*
            남은 횟수는 평소에 보여주지 않는다. 늘 보이면 셈하면서 쓰게 된다.
            얼마 안 남았을 때만 알린다. (`state.ts`)
          */}
          {!pending &&
          state.remaining !== null &&
          state.remaining <= REMAINING_WARNING_THRESHOLD ? (
            <span className="text-xs text-accent dark:text-accent-dark">
              이번 달에 {state.remaining}번 남았습니다.
            </span>
          ) : null}
        </div>
      </form>

      {/*
        오류는 사라지게 하지 않는다. 못 본 오류는 "아무 일도 없었다"와
        구분되지 않는다. (AGENTS.md 6절)
      */}
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-400/20 dark:bg-red-950/30 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.answer ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-zinc-950">
            <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
              {state.answer}
            </p>
          </div>

          {state.cited.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                답이 가리킨 것
              </h2>

              {/*
                번호는 답에 적힌 것과 같아야 한다. 답에 `[2]`라고 쓰여 있는데
                여기 목록이 1번부터 다시 매겨지면 짝이 어긋난다. 그래서
                서버가 매긴 번호를 그대로 쓴다.
              */}
              <ul className="flex flex-col gap-2">
                {state.cited.map((item) => (
                  <li
                    key={`${item.kind}-${item.index}`}
                    className="flex gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
                  >
                    <span className="shrink-0 text-xs text-zinc-500">
                      [{item.index}]
                    </span>

                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs text-zinc-500">
                          {item.kind === "capture" ? "기록" : "자료"}
                        </span>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                          >
                            {item.origin}
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            {item.origin}
                          </span>
                        )}
                      </span>

                      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                        {item.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            /*
              답은 왔는데 가리킨 것이 없다. 감출 일이 아니다. 근거 없는
              답은 덜 믿어야 하고, 그것을 읽는 사람이 알아야 한다.
            */
            <p className="text-xs leading-5 text-zinc-500">
              이 답은 어느 기록을 근거로 삼았는지 밝히지 않았습니다. 그대로
              믿지 마시고 직접 찾아 확인해 주세요.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
