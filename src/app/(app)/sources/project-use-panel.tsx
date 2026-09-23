"use client";

import { useState, useTransition } from "react";

import {
  DEFAULT_PAPER_USE_STATUS,
  PAPER_USE_STATUSES,
  PROJECT_USE_FIELDS,
  countUseFilled,
  getPaperUseStatusLabel,
  maxLengthFor,
  isPaperUseStatus,
  type PaperUseStatus,
} from "@/lib/papers/project-use-fields";

import {
  deletePaperProjectUse,
  savePaperProjectUse,
} from "./project-use-actions";

/**
 * 프로젝트별 논문 활용 계획. (설계 문서 8.3절)
 *
 * 프로젝트 하나에 계획 하나다. 같은 논문이라도 프로젝트마다 쓰는 방식이
 * 다르기 때문에, 저장도 프로젝트마다 따로 한다. 한 단추로 모두 저장하면
 * A 프로젝트 칸을 고치다가 B 프로젝트 칸까지 건드리게 된다.
 *
 * 브라우저에서 도는 이유는 분석 서식과 같다. 저장해도 화면이 넘어가면
 * 여러 프로젝트를 오가며 적던 자리를 잃는다.
 *
 * 처음부터 펼쳐 두지 않는다. 프로젝트가 여럿이면 화면만 길어지고, 어느
 * 프로젝트가 어디까지 됐는지는 접힌 줄에 이미 적혀 있다.
 */

type Draft = {
  status: PaperUseStatus;
  values: Record<string, string>;
  /** 저장된 계획이 있는지. 없으면 지우기 단추를 보여주지 않는다. */
  exists: boolean;
  dirty: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  /** 지우기를 한 번 눌렀는지. 두 번 눌러야 지워진다. */
  confirming: boolean;
};

export function ProjectUsePanel({
  sourceId,
  projects,
  uses,
}: {
  sourceId: string;
  /**
   * 계획 칸을 보여줄 프로젝트.
   *
   * `linked`가 거짓인 것은 연결을 끊었는데 계획이 남아 있는 경우다.
   * 감추지 않는다. 감추면 적어둔 글이 사라진 것처럼 보인다.
   */
  projects: readonly { id: string; name: string; linked: boolean }[];
  uses: readonly {
    projectId: string;
    status: PaperUseStatus;
    values: Record<string, string | null>;
  }[];
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const start: Record<string, Draft> = {};

    for (const project of projects) {
      const saved = uses.find((use) => use.projectId === project.id) ?? null;
      const values: Record<string, string> = {};

      for (const field of PROJECT_USE_FIELDS) {
        values[field.column] = saved?.values[field.column] ?? "";
      }

      start[project.id] = {
        status: saved?.status ?? DEFAULT_PAPER_USE_STATUS,
        values,
        exists: saved !== null,
        dirty: false,
        message: null,
        confirming: false,
      };
    }

    return start;
  });

  const [pending, startTransition] = useTransition();
  /** 지금 저장·삭제가 도는 프로젝트. 그 줄만 잠근다. */
  const [busy, setBusy] = useState<string | null>(null);

  function update(projectId: string, patch: Partial<Draft>) {
    setDrafts((previous) => ({
      ...previous,
      [projectId]: { ...previous[projectId], ...patch },
    }));
  }

  function setField(projectId: string, column: string, value: string) {
    setDrafts((previous) => {
      const draft = previous[projectId];

      return {
        ...previous,
        [projectId]: {
          ...draft,
          values: { ...draft.values, [column]: value },
          dirty: true,
          message: null,
          confirming: false,
        },
      };
    });
  }

  function submit(projectId: string) {
    const draft = drafts[projectId];

    setBusy(projectId);

    startTransition(async () => {
      const result = await savePaperProjectUse({
        sourceId,
        projectId,
        status: draft.status,
        values: draft.values,
      });

      setBusy(null);

      if (result.ok) {
        update(projectId, {
          exists: true,
          dirty: false,
          confirming: false,
          message: { kind: "ok", text: "저장했습니다." },
        });

        return;
      }

      update(projectId, { message: { kind: "error", text: result.message } });
    });
  }

  function remove(projectId: string) {
    setBusy(projectId);

    startTransition(async () => {
      const result = await deletePaperProjectUse({ sourceId, projectId });

      setBusy(null);

      if (result.ok) {
        const values: Record<string, string> = {};

        for (const field of PROJECT_USE_FIELDS) {
          values[field.column] = "";
        }

        update(projectId, {
          status: DEFAULT_PAPER_USE_STATUS,
          values,
          exists: false,
          dirty: false,
          confirming: false,
          message: { kind: "ok", text: "계획을 지웠습니다." },
        });

        return;
      }

      update(projectId, {
        confirming: false,
        message: { kind: "error", text: result.message },
      });
    });
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm leading-6 text-zinc-500">
        위에서 프로젝트를 연결하면, 그 프로젝트에서 이 논문을 어떻게 쓸지 적을
        수 있습니다. 같은 논문도 프로젝트마다 쓰는 방식이 다릅니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.map((project) => {
        const draft = drafts[project.id];
        const filled = countUseFilled(draft.values);
        const locked = pending && busy === project.id;

        return (
          <details
            key={project.id}
            className="rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
          >
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                {project.name}
              </span>
              <span className="text-xs text-zinc-500">
                {draft.exists
                  ? `${getPaperUseStatusLabel(draft.status)} · ${filled}/${PROJECT_USE_FIELDS.length}`
                  : "계획 없음"}
              </span>
            </summary>

            <div className="flex flex-col gap-5 border-t border-black/[.06] px-4 py-4 dark:border-white/[.1]">
              {project.linked ? null : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  이 프로젝트와의 연결은 끊겨 있습니다. 적어둔 계획은 그대로
                  남아 있으니, 위에서 다시 연결하면 이어서 쓸 수 있습니다.
                </p>
              )}

              {draft.message ? (
                <p
                  role={draft.message.kind === "ok" ? "status" : "alert"}
                  className={
                    draft.message.kind === "ok"
                      ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  }
                >
                  {draft.message.text}
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <label
                  htmlFor={`use-status-${project.id}`}
                  className="text-sm font-medium text-black dark:text-zinc-50"
                >
                  상태
                </label>
                <select
                  id={`use-status-${project.id}`}
                  value={draft.status}
                  disabled={locked}
                  onChange={(event) => {
                    const next = event.target.value;

                    update(project.id, {
                      // 목록에 없는 값이 올 수 없지만, 올 경우 기본값으로 둔다.
                      status: isPaperUseStatus(next)
                        ? next
                        : DEFAULT_PAPER_USE_STATUS,
                      dirty: true,
                      message: null,
                      confirming: false,
                    });
                  }}
                  className="h-11 w-fit rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                >
                  {PAPER_USE_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-zinc-500">
                  원고에 넣은 뒤에 &ldquo;원고에 넣음&rdquo;으로 바꿔두면, 논문이
                  쌓였을 때 남은 것만 골라 볼 수 있습니다.
                </p>
              </div>

              {PROJECT_USE_FIELDS.map((field) => (
                <div
                  key={field.column}
                  className="flex flex-col gap-2"
                >
                  <label
                    htmlFor={`use-${project.id}-${field.column}`}
                    className="text-sm font-medium text-black dark:text-zinc-50"
                  >
                    {field.label}
                  </label>

                  {field.size === "short" ? (
                    <input
                      id={`use-${project.id}-${field.column}`}
                      type="text"
                      maxLength={maxLengthFor(field)}
                      value={draft.values[field.column] ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        setField(project.id, field.column, event.target.value)
                      }
                      className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  ) : (
                    <textarea
                      id={`use-${project.id}-${field.column}`}
                      rows={3}
                      maxLength={maxLengthFor(field)}
                      value={draft.values[field.column] ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        setField(project.id, field.column, event.target.value)
                      }
                      className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                    />
                  )}

                  {field.hint ? (
                    <p className="text-xs leading-5 text-zinc-500">
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => submit(project.id)}
                  disabled={locked}
                  className="h-10 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                >
                  {locked ? "저장하는 중…" : "저장"}
                </button>

                {/*
                  지우기는 두 번 눌러야 지워진다. 적어둔 글이 그대로 사라지는
                  일이고, 자료와 달리 되살릴 표시를 두지 않았다.
                */}
                {draft.exists ? (
                  draft.confirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(project.id)}
                        disabled={locked}
                        className="h-10 rounded-full border border-red-300 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        정말 지우기
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update(project.id, { confirming: false })
                        }
                        disabled={locked}
                        className="text-sm text-zinc-600 underline underline-offset-2 disabled:opacity-60 dark:text-zinc-400"
                      >
                        그만두기
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => update(project.id, { confirming: true })}
                      disabled={locked}
                      className="text-sm text-zinc-500 underline underline-offset-2 transition-colors hover:text-red-700 disabled:opacity-60 dark:hover:text-red-400"
                    >
                      계획 지우기
                    </button>
                  )
                ) : null}

                <span className="text-xs text-zinc-500">
                  {draft.dirty ? "저장하지 않은 내용이 있습니다." : null}
                </span>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
