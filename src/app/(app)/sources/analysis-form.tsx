"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";

import {
  ANALYSIS_FIELDS,
  ANALYSIS_SECTIONS,
  MAX_ANALYSIS_FIELD_LENGTH,
  countFilled,
} from "@/lib/papers/analysis-fields";

import { saveAnalysis } from "./analysis-actions";

/**
 * 논문 분석 서식. (설계 문서 8.2절)
 *
 * 두 곳에서 같은 것을 쓴다. 단독 화면(`/sources/[id]/analysis`)과
 * 읽기 작업대의 오른쪽 패널(14-E)이다. 한 벌만 두는 이유는, 항목이 서른 개라
 * 두 벌이 되면 한쪽만 고쳐지는 일이 반드시 생기기 때문이다.
 *
 * 브라우저에서 도는 이유는 둘이다.
 *
 * 하나, 저장해도 화면이 넘어가면 안 된다. 작업대에서는 왼쪽에 PDF가 떠 있고,
 * 저장할 때마다 넘어가면 보던 쪽을 잃고 PDF를 다시 그린다.
 *
 * 둘, 채운 칸 수가 적는 즉시 따라 움직여야 한다. 서른 칸을 며칠에 걸쳐
 * 채우는 일이라, 얼마나 남았는지가 보이면 이어서 하게 된다.
 */
/**
 * `적은 것만 보기`를 이 브라우저에 기억해 둔다.
 *
 * 켜고 끄는 것을 논문마다 다시 하게 하면 있으나 마나다. 갈라진 너비를
 * 기억하는 것과 같은 방식이다. (split-pane.tsx)
 *
 * `useSyncExternalStore`로 읽는 이유도 같다. effect에서 읽어 상태를 바꾸면
 * 한 번 그리고 다시 그리게 되고, React 19가 그 방식을 막는다.
 */
const ONLY_FILLED_KEY = "threadmark.analysis.onlyFilled";
const ONLY_FILLED_EVENT = "threadmark:analysis-only-filled";

function readOnlyFilled(): boolean {
  try {
    return window.localStorage.getItem(ONLY_FILLED_KEY) === "1";
  } catch {
    // 저장소를 못 쓰는 브라우저가 있다. 전체 보기로 간다.
    return false;
  }
}

function serverOnlyFilled(): boolean {
  return false;
}

function subscribeOnlyFilled(onChange: () => void): () => void {
  window.addEventListener(ONLY_FILLED_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(ONLY_FILLED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function saveOnlyFilled(value: boolean): void {
  try {
    window.localStorage.setItem(ONLY_FILLED_KEY, value ? "1" : "0");
    window.dispatchEvent(new Event(ONLY_FILLED_EVENT));
  } catch {
    // 기억해 두지 못해도 이번 동안은 그대로 쓴다.
  }
}

export function AnalysisForm({
  sourceId,
  initial,
  projects,
  /** 좁은 패널에 넣을 때. 설명을 줄이고 묶음을 모두 접는다. */
  compact = false,
}: {
  sourceId: string;
  initial: Record<string, string | null>;
  /** 8.2절의 "관련 프로젝트". 글로 적지 않고 맺어둔 연결을 보여준다. */
  projects: readonly { id: string; name: string }[];
  compact?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};

    for (const field of ANALYSIS_FIELDS) {
      start[field.column] = initial[field.column] ?? "";
    }

    return start;
  });

  /**
   * 적은 칸만 볼 것인가.
   *
   * 서른 칸 중 일곱 개를 적었을 때, 나머지 스물셋을 지나며 찾는 일이 번거롭다.
   * 빈칸을 감추면 적은 것이 자연스럽게 위쪽에 모인다.
   *
   * 순서는 바꾸지 않는다. 8.2절의 차례는 논문을 읽는 순서라, 섞으면 무엇을
   * 적다 말았는지 알 수 없어진다. 빼기만 한다.
   */
  const onlyFilled = useSyncExternalStore(
    subscribeOnlyFilled,
    readOnlyFilled,
    serverOnlyFilled,
  );

  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  /*
    저장한 뒤로 고친 곳이 있는지. 있으면 저장 단추를 눈에 띄게 둔다.
    작업대에서는 PDF를 읽다가 적기를 오가게 되는데, 저장했는지 아닌지
    기억나지 않는 순간이 자주 온다.
  */
  const [dirty, setDirty] = useState(false);

  const filled = countFilled(values);

  function set(column: string, value: string) {
    setValues((previous) => ({ ...previous, [column]: value }));
    setDirty(true);
    setMessage(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await saveAnalysis({ sourceId, values });

      if (result.ok) {
        setDirty(false);
        setMessage({ kind: "ok", text: "저장했습니다." });

        return;
      }

      setMessage({ kind: "error", text: result.message });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs leading-5 text-zinc-500">
          {filled}/{ANALYSIS_FIELDS.length}칸을 채웠습니다. 한 번에 다 채우지
          않아도 됩니다.
        </p>

        {/*
          빈칸을 감추는 전환. 적은 것이 일곱이고 빈칸이 스물셋일 때, 적은
          것을 다시 읽으려면 그 스물셋을 지나야 한다. 감추면 적은 것이
          위쪽에 모인다.

          순서는 바꾸지 않는다. 8.2절의 차례가 논문을 읽는 순서라, 섞으면
          무엇을 적다 말았는지 알 수 없어진다. 빼기만 한다.
        */}
        <button
          type="button"
          onClick={() => saveOnlyFilled(!onlyFilled)}
          aria-pressed={onlyFilled}
          className={
            onlyFilled
              ? "h-8 shrink-0 rounded-full bg-zinc-900 px-4 text-xs font-medium text-white dark:bg-zinc-100 dark:text-black"
              : "h-8 shrink-0 rounded-full border border-black/[.08] px-4 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
          }
        >
          {onlyFilled ? "전체 보기" : "적은 것만 보기"}
        </button>
      </div>

      {/*
        켜 두었는데 적은 것이 하나도 없는 경우다. 아무것도 없는 화면만
        보여주면 칸이 어디 갔는지 알 수 없다.
      */}
      {onlyFilled && filled === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-4 text-xs leading-5 text-zinc-500 dark:bg-white/[.04]">
          아직 적은 것이 없습니다. `전체 보기`를 누르면 서른 칸이 모두
          나옵니다.
        </p>
      ) : null}

      {message ? (
        <p
          role={message.kind === "ok" ? "status" : "alert"}
          className={
            message.kind === "ok"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          }
        >
          {message.text}
        </p>
      ) : null}

      {ANALYSIS_SECTIONS.map((section, index) => {
        const sectionFilled = countFilled(values, section.fields);

        /*
          `적은 것만 보기`일 때는 빈칸을 뺀다. 남는 것이 없는 묶음은 제목도
          보여주지 않는다. 빈 묶음만 다섯 개 늘어서면 감춘 보람이 없다.
        */
        const shown = onlyFilled
          ? section.fields.filter((field) => {
              const value = values[field.column];

              return typeof value === "string" && value.trim().length > 0;
            })
          : section.fields;

        if (onlyFilled && shown.length === 0) {
          return null;
        }

        return (
          <details
            key={section.id}
            /*
              넓은 화면에서는 첫 묶음과 아직 손대지 않은 묶음을 펼쳐둔다.
              다 채운 묶음이 접히면 남은 곳이 눈에 띈다.

              좁은 패널에서는 모두 접는다. 펼쳐두면 스크롤만 길어지고
              어느 묶음이 있는지조차 한눈에 안 들어온다.
            */
            /*
              `적은 것만 보기`에서는 남은 묶음을 모두 펼친다. 적은 것을
              보려고 켠 것인데 접혀 있으면 다시 눌러야 한다.
            */
            open={onlyFilled || (!compact && (index === 0 || sectionFilled === 0))}
            className="rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
          >
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                {section.title}
              </span>
              <span className="text-xs text-zinc-500">
                {sectionFilled}/{section.fields.length}
              </span>
            </summary>

            <div className="flex flex-col gap-5 border-t border-black/[.06] px-4 py-4 dark:border-white/[.1]">
              {compact ? null : (
                <p className="text-xs leading-5 text-zinc-500">
                  {section.purpose}
                </p>
              )}

              {/*
                8.2절의 "관련 프로젝트"는 글로 적지 않는다.
                source_projects가 이미 그 일을 한다. 두 곳에 적으면
                같은 물음에 답이 두 개가 된다.
              */}
              {section.id === "context" && !onlyFilled ? (
                <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-white/[.04]">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    관련 프로젝트
                  </p>
                  {projects.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {projects.map((project) => (
                        <li
                          key={project.id}
                          className="rounded-full border border-black/[.08] px-3 py-1 text-xs text-zinc-700 dark:border-white/[.145] dark:text-zinc-300"
                        >
                          {project.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs leading-5 text-zinc-500">
                      아직 연결된 프로젝트가 없습니다.
                    </p>
                  )}
                  <Link
                    href={`/sources/${sourceId}`}
                    className="w-fit text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                  >
                    자료 상세에서 연결하기
                  </Link>
                </div>
              ) : null}

              {shown.map((field) => (
                <div key={field.column} className="flex flex-col gap-2">
                  <label
                    htmlFor={`analysis-${field.column}`}
                    className="text-sm font-medium text-black dark:text-zinc-50"
                  >
                    {field.label}
                  </label>

                  {field.size === "short" ? (
                    <input
                      id={`analysis-${field.column}`}
                      type="text"
                      maxLength={MAX_ANALYSIS_FIELD_LENGTH}
                      value={values[field.column] ?? ""}
                      disabled={pending}
                      onChange={(event) => set(field.column, event.target.value)}
                      className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  ) : (
                    <textarea
                      id={`analysis-${field.column}`}
                      rows={compact ? 3 : 4}
                      maxLength={MAX_ANALYSIS_FIELD_LENGTH}
                      value={values[field.column] ?? ""}
                      disabled={pending}
                      onChange={(event) => set(field.column, event.target.value)}
                      className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  )}

                  {field.hint && !compact ? (
                    <p className="text-xs leading-5 text-zinc-500">
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              ))}

              {/*
                8.2절의 "연결되는 다른 자료"도 글로 적지 않는다.
                8.4절의 source_relations가 맡는다. (14-D-2a)
                여기서는 그 자리로 가는 길만 둔다.
              */}
              {section.id === "use" && !onlyFilled ? (
                <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-white/[.04]">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    연결되는 다른 자료
                  </p>
                  <p className="text-xs leading-5 text-zinc-500">
                    인용함·유사 연구·상반된 결과처럼 방향이 있는 관계로 잇습니다.
                    글로 적지 않고 자료끼리 직접 잇습니다.
                  </p>
                  <Link
                    href={`/sources/${sourceId}`}
                    className="w-fit text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                  >
                    자료 상세의 관련 자료에서 잇기
                  </Link>
                </div>
              ) : null}
            </div>
          </details>
        );
      })}

      {/*
        저장 단추가 아래에 붙어 따라온다. 묶음을 여러 개 펼치면 화면이
        길어지는데, 그때 맨 아래까지 내려가야 저장할 수 있으면 저장을 잊는다.
      */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl border border-black/[.08] bg-white/95 p-3 backdrop-blur dark:border-white/[.145] dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="h-10 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <span className="text-xs text-zinc-500">
          {dirty
            ? "저장하지 않은 내용이 있습니다."
            : "접힌 묶음의 내용도 함께 저장됩니다."}
        </span>
      </div>
    </div>
  );
}
