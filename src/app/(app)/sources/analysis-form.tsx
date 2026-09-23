"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

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
      <p className="text-xs leading-5 text-zinc-500">
        {filled}/{ANALYSIS_FIELDS.length}칸을 채웠습니다. 한 번에 다 채우지
        않아도 됩니다.
      </p>

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

        return (
          <details
            key={section.id}
            /*
              넓은 화면에서는 첫 묶음과 아직 손대지 않은 묶음을 펼쳐둔다.
              다 채운 묶음이 접히면 남은 곳이 눈에 띈다.

              좁은 패널에서는 모두 접는다. 펼쳐두면 스크롤만 길어지고
              어느 묶음이 있는지조차 한눈에 안 들어온다.
            */
            open={!compact && (index === 0 || sectionFilled === 0)}
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
              {section.id === "context" ? (
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

              {section.fields.map((field) => (
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
                8.4절의 source_relations가 맡는다. 아직 만들지 않았다.
              */}
              {section.id === "use" ? (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500 dark:bg-white/[.04]">
                  연결되는 다른 자료는 논문끼리 잇는 기능(14-D)에서 다룹니다.
                </p>
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
