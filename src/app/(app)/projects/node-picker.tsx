"use client";

import { useEffect, useState, useTransition } from "react";

import { indentSteps } from "@/lib/projects/outline";

import {
  listPlaceTargets,
  placeItem,
  type PlaceTargetProject,
} from "./placement-actions";

/**
 * 이 기록을 어느 프로젝트의 어느 자리에 놓을지 고르는 창.
 * (19-B 뒤, 사용자 요청)
 *
 * **재료 쪽에서 가는 길이다.** 프로젝트 화면의 고르는 창(`item-picker.tsx`)이
 * 요리 쪽에서 재료를 부르는 것이라면, 이쪽은 재료를 손에 든 채 "이건 어디에
 * 쓸까"를 정하는 것이다. **적어둔 직후가 그 판단이 가장 또렷한 때다.**
 * 나중에 프로젝트 화면에서 찾으려면 무엇을 적었는지부터 다시 떠올려야 한다.
 *
 * 같은 모양으로 만든다. 왼쪽에서 프로젝트를 고르고 오른쪽에서 자리를
 * 고른다. 자리가 곧 쓰임새라 **프로젝트 이름만으로는 고를 수 없다.**
 *
 * **열 때 가져온다.** 기록 카드는 받은함·자료 화면·읽기 화면 세 곳에
 * 나온다. 그 화면이 열릴 때마다 모든 프로젝트의 뼈대를 실어 나를 이유가
 * 없다. 자리를 고르는 일은 가끔 있는 일이다.
 */
export function NodePicker({
  item,
  returnTo,
  label = "자리에 놓기",
}: {
  /**
   * 놓을 것. `source:<id>` 또는 `capture:<id>`.
   *
   * 기록만 받다가 자료도 받게 넓혔다. (사용자 요청) 자리에 놓는 일은
   * 둘에 똑같이 필요한데, 처음에는 기록에만 길을 냈다. 자료를 통째로
   * `3장에 쓸 논문`으로 정해두는 일이 오히려 더 흔하다.
   */
  item: string;
  /** 놓은 뒤 돌아올 곳. 보던 목록을 잃지 않는다. */
  returnTo: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<PlaceTargetProject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleOpen() {
    setOpen(true);

    // 한 번 받아오면 다시 받지 않는다. 창을 여닫는 동안 뼈대가 바뀔 일은 드물다.
    if (targets !== null) {
      return;
    }

    startLoading(async () => {
      try {
        const rows = await listPlaceTargets();

        setTargets(rows);
        setFailed(false);
        setOpenProjectId(rows.find((row) => row.nodes.length > 0)?.id ?? null);
      } catch {
        setFailed(true);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        {label}
      </button>
    );
  }

  const openProject =
    openProjectId === null
      ? null
      : ((targets ?? []).find((row) => row.id === openProjectId) ?? null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-label="이 기록을 놓을 자리 고르기"
        className="flex h-full max-h-[36rem] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
      >
        <header className="flex items-center gap-3 border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
          <span className="min-w-0 flex-1 text-sm font-medium text-black dark:text-zinc-50">
            어디에 놓을까요
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-full px-3 py-1 text-sm text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-black dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
          >
            닫기
          </button>
        </header>

        {loading || targets === null ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {failed ? "자리를 가져오지 못했습니다." : "불러오는 중…"}
          </p>
        ) : targets.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm leading-6 text-zinc-500">
            아직 프로젝트가 없습니다.
            <br />
            `프로젝트` 메뉴에서 먼저 하나 만들어 주세요.
          </p>
        ) : (
          <form
            action={placeItem}
            className="flex min-h-0 flex-1 flex-col sm:flex-row"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="item" value={item} />
            {/*
              어느 프로젝트인지는 고른 자리에서 따라오지만, 놓는 동작이
              프로젝트에도 함께 잇기 때문에 값이 따로 필요하다.
              고른 프로젝트가 바뀌면 이 값도 함께 바뀐다.
            */}
            <input
              type="hidden"
              name="projectId"
              value={openProject?.id ?? ""}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-b border-black/[.06] sm:border-b-0 sm:border-r dark:border-white/[.08]">
              <p className="px-4 py-2 text-xs font-medium text-zinc-500">
                프로젝트 {targets.length}
              </p>
              <ul className="flex flex-col pb-2">
                {targets.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => setOpenProjectId(project.id)}
                      aria-pressed={openProjectId === project.id}
                      className={
                        openProjectId === project.id
                          ? "flex w-full items-center gap-2 border-l-2 border-accent bg-accent-soft px-4 py-2 text-left text-black dark:border-accent-dark dark:bg-accent-dark-soft dark:text-zinc-50"
                          : "flex w-full items-center gap-2 border-l-2 border-transparent px-4 py-2 text-left text-zinc-700 transition-colors hover:bg-black/[.03] dark:text-zinc-300 dark:hover:bg-white/[.05]"
                      }
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {project.nodes.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <p className="px-4 py-2 text-xs font-medium text-zinc-500">
                자리 {openProject?.nodes.length ?? 0}
              </p>

              {!openProject ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-500">
                  왼쪽에서 프로젝트를 고르세요.
                </p>
              ) : openProject.nodes.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs leading-5 text-zinc-500">
                  이 프로젝트에는 아직 뼈대가 없습니다.
                  <br />
                  프로젝트 화면에서 자리를 먼저 만들어 주세요.
                </p>
              ) : (
                <ul className="flex flex-col pb-2">
                  {openProject.nodes.map((node) => (
                    <li key={node.id}>
                      {/*
                        자리를 누르면 곧바로 놓인다. 고르고 나서 또 `놓기`를
                        누르는 두 걸음을 두지 않는다. 자리 고르기 자체가
                        이미 뜻이 분명한 동작이다.
                      */}
                      <button
                        type="submit"
                        name="nodeId"
                        value={node.id}
                        style={{
                          paddingLeft: `${1 + indentSteps(node.depth) * 0.875}rem`,
                        }}
                        className="flex w-full items-baseline gap-2 py-2 pr-4 text-left transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                      >
                        <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                          {node.number}
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-black dark:text-zinc-50">
                          {node.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
