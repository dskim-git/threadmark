import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import { indentSteps, type OutlineItem } from "@/lib/projects/outline";
import type {
  PickerTree,
  PlacedItem,
} from "@/lib/projects/placement-queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { ItemPicker } from "./item-picker";
import { NodeSuggest } from "./node-suggest";
import { SuggestPanel } from "./suggest-panel";
import { PlacedPeek } from "./placed-peek";
import { removePlacement, savePlacementNote } from "./placement-actions";
import {
  addOutlineNode,
  deleteOutlineNode,
  moveOutlineNode,
  reparentOutlineNode,
  saveOutlineNode,
} from "./outline-actions";

/**
 * 프로젝트 뼈대. (설계 문서 7.3절)
 *
 * **재료를 모으는 쪽과 만드는 쪽 중 만드는 쪽이다.** 자리를 만들고 그 자리에
 * 쓸 글을 적고, 모아둔 재료를 그 자리에 놓는다. (19-B)
 *
 * **이 칸은 고치는 곳이다.** 그래서 자리가 접혀 있고, 펼치면 그 안이 통째로
 * 고치는 칸이다. 대신 전체가 어떻게 이어지는지는 여기서 볼 수 없다.
 * 그것은 조망이 한다. (`[id]/outline/page.tsx`, 19-C)
 *
 * **자바스크립트 없이 움직인다.** 자리 하나가 폼 하나이고, 단추는 전부
 * Server Action을 부른다. 접었다 펴는 것은 `details`가 한다.
 * 뼈대는 아이패드에서도 고치게 될 화면이라 브라우저에 짐을 지우지 않는다.
 *
 * **깊이에 한계가 없다.** 그래서 나무를 중첩해 그리지 않고 평평한 목록에
 * 들여쓰기만 한다. 중첩해 그리면 깊어질수록 위태로워지고, 좁은 화면에서
 * 오른쪽으로 끝없이 밀린다. 들여쓰기에만 한계를 둔다. (outline.ts)
 */
export function OutlinePanel({
  projectId,
  items,
  placements,
  tree,
  linked,
  /** AI 설정이 되어 있는가. 서버에서 정해 넘긴다. */
  aiConfigured,
}: {
  projectId: string;
  items: readonly OutlineItem[];
  /** 자리에 놓인 재료 전부. 여기서 자리별로 나눈다. */
  placements: readonly PlacedItem[];
  /** 고르는 창이 보여줄 나무. 자료와 그 안의 기록이다. */
  tree: PickerTree;
  /** 이 프로젝트에 이어둔 것. `자리 못 찾은 것`을 세는 기준이다. */
  linked: readonly PlacementChoice[];
  aiConfigured: boolean;
}) {
  /*
    자리별로 한 번에 나눈다.

    자리마다 목록을 훑으면 자리 수 × 재료 수만큼 헛일을 한다. 뼈대의 크기에
    한계가 없으므로 그 곱의 끝을 우리가 모른다.
  */
  const byNode = new Map<string, PlacedItem[]>();

  for (const placed of placements) {
    const group = byNode.get(placed.nodeId);

    if (group) {
      group.push(placed);
    } else {
      byNode.set(placed.nodeId, [placed]);
    }
  }

  /*
    자리를 못 찾은 것을 가려낸다.

    **프로젝트에 이어둔 것 중에서만 센다.** 내 자료 전부를 세면 담아둔 것이
    늘어날수록 이 칸이 수백 개가 되고, "아직 못 놓았다"는 말이 뜻을 잃는다.
    이어둔 것은 이 프로젝트에 쓰겠다고 정한 것들이다.
  */
  const placedValues = new Set(
    placements.map((item) =>
      item.kind === "source" ? `source:${item.sourceId}` : `capture:${item.captureId}`,
    ),
  );

  const unplaced = linked.filter((choice) => !placedValues.has(choice.value));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          뼈대
        </h2>
        <HelpButton topic="project-outline" label="프로젝트 뼈대" />
        <HelpButton topic="project-place" label="자리에 재료 놓기" />
        <span className="text-xs text-zinc-500">
          {items.length > 0 ? `자리 ${items.length}개` : null}
        </span>

        {/*
          조망으로 가는 길. (19-C)

          **자리가 있을 때만 보여준다.** 뼈대가 비어 있는데 "전체를 한눈에"를
          누르면 빈 화면이 나오고, 그것은 고장처럼 보인다.

          여기 두는 이유는 이 칸이 곧 조망이 보여줄 것이기 때문이다. 화면
          맨 위에 두면 무엇을 조망하는 것인지가 흐려진다.
        */}
        {items.length > 0 ? (
          <Link
            href={`/projects/${projectId}/outline`}
            className="ml-auto h-8 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-3 text-xs font-medium leading-8 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            조망 열기
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white px-6 py-8 text-center text-sm leading-6 text-zinc-500 dark:bg-zinc-950">
          아직 자리가 없습니다. 아래에서 첫 자리를 만들어 보세요.
          <br />
          장이든 차시든, 이름은 직접 적습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              /*
                조망에서 `고치기`로 돌아오는 자리. (19-C)

                **어느 카드인지 찾지 않아도 된다.** 자리가 스물이면 그 찾는
                일이 고치는 일보다 오래 걸린다. 카드가 접혀 있어 한 번 더
                눌러야 펼쳐지는데, 그것까지 열어주려면 브라우저 쪽 코드가
                필요하고 **이 칸은 자바스크립트 없이 움직여야 한다.**
              */
              id={`node-${item.id}`}
              /*
                들여쓰기를 여백으로 준다. 감싸는 칸을 겹치지 않는다.
                겹치면 깊은 자리가 좁은 화면에서 글자 한 줄 너비가 된다.
              */
              style={{ marginLeft: `${indentSteps(item.depth) * 1.25}rem` }}
              // 머리말에 가려 카드 위쪽이 잘리지 않게 자리를 띄워 멈춘다.
              className="scroll-mt-24"
            >
              <details className="rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="shrink-0 font-mono text-xs text-zinc-500">
                    {item.number}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-black dark:text-zinc-50">
                    {item.title}
                  </span>

                  {/*
                    글을 썼는지 한눈에 보인다. 접혀 있으면 안이 안 보이므로
                    표시가 없으면 "다 비어 있나"를 열어봐야 안다.
                  */}
                  {item.body ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                      글 있음
                    </span>
                  ) : null}

                  {(byNode.get(item.id) ?? []).length > 0 ? (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                      재료 {(byNode.get(item.id) ?? []).length}
                    </span>
                  ) : null}

                  {item.descendantCount > 0 ? (
                    <span className="shrink-0 text-xs text-zinc-500">
                      아래 {item.descendantCount}
                    </span>
                  ) : null}
                </summary>

                <div className="flex flex-col gap-4 border-t border-black/[.06] px-4 py-4 dark:border-white/[.08]">
                  <form
                    action={saveOutlineNode}
                    className="flex flex-col gap-3"
                  >
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="nodeId" value={item.id} />

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        자리 이름
                      </span>
                      <input
                        name="title"
                        type="text"
                        required
                        maxLength={300}
                        defaultValue={item.title}
                        className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                    </label>

                    {/*
                      이 자리에 쓸 글. 이 칸이 뼈대를 목차가 아니게 만든다.
                      (설계 문서 7.3절)
                    */}
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        여기에 쓸 글
                      </span>
                      <textarea
                        name="body"
                        rows={8}
                        maxLength={50000}
                        defaultValue={item.body ?? ""}
                        /*
                          단계 번호를 사용자에게 보이지 않는다. `19-B`는
                          우리끼리 쓰는 말이고, 읽는 사람에게는 무슨 소린지
                          알 수 없는 글자다. 이미 만든 기능이기도 하다.
                        */
                        placeholder="이 자리에서 할 말을 적습니다. 아래에서 모아둔 재료를 이 자리에 놓을 수 있습니다."
                        className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                    </label>

                    <button
                      type="submit"
                      className="h-9 w-fit rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                    >
                      저장
                    </button>
                  </form>

                  {/*
                    이 자리에 놓인 재료. 글 칸과 단추 사이에 둔다.
                    쓰면서 옆에 두고 보는 것이라 멀리 두면 소용이 없다.
                  */}
                  <PlacedList
                    projectId={projectId}
                    placed={byNode.get(item.id) ?? []}
                  />

                  <ItemPicker
                    projectId={projectId}
                    nodeId={item.id}
                    nodeTitle={`${item.number}. ${item.title}`}
                    tree={tree}
                    placedValues={(byNode.get(item.id) ?? []).map((placed) =>
                      placed.kind === "source"
                        ? `source:${placed.sourceId}`
                        : `capture:${placed.captureId}`,
                    )}
                  />

                  {/*
                    **이 자리에 어울리는 것을 담아둔 것 전부에서 찾는다.**
                    (19-D-2, 사용자 요청) 고르는 창 바로 아래에 둔다.
                    무엇을 놓을지 모를 때 누르는 것이라, 고르는 창을 열어
                    훑어본 다음이 그 순간이다.
                  */}
                  <NodeSuggest
                    projectId={projectId}
                    nodeId={item.id}
                    configured={aiConfigured}
                  />

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
                    <MoveButton
                      projectId={projectId}
                      nodeId={item.id}
                      action={moveOutlineNode}
                      direction="up"
                      label="↑ 위로"
                    />
                    <MoveButton
                      projectId={projectId}
                      nodeId={item.id}
                      action={moveOutlineNode}
                      direction="down"
                      label="↓ 아래로"
                    />
                    <MoveButton
                      projectId={projectId}
                      nodeId={item.id}
                      action={reparentOutlineNode}
                      direction="in"
                      label="→ 한 단 들이기"
                    />
                    <MoveButton
                      projectId={projectId}
                      nodeId={item.id}
                      action={reparentOutlineNode}
                      direction="out"
                      label="← 한 단 내보내기"
                    />

                    {/* 아래에 자리를 하나 더 만든다. 자식으로 들어간다. */}
                    <form
                      action={addOutlineNode}
                      className="flex items-center gap-1.5"
                    >
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="parentId" value={item.id} />
                      <input
                        name="title"
                        type="text"
                        required
                        maxLength={300}
                        placeholder="아래에 자리 더하기"
                        className="h-8 w-40 rounded-full border border-black/[.08] bg-white px-3 text-xs text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                      <button
                        type="submit"
                        className="h-8 rounded-full border border-black/[.08] px-3 text-xs text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                      >
                        더하기
                      </button>
                    </form>

                    {/*
                      지우기는 맨 오른쪽 끝에 둔다. 다른 단추와 붙여 두면
                      옮기려다 누른다. 아래 자리가 몇이나 함께 사라지는지
                      단추 이름에 적는다.
                    */}
                    <form action={deleteOutlineNode} className="ml-auto">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="nodeId" value={item.id} />
                      <button
                        type="submit"
                        className="h-8 rounded-full px-3 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        {item.descendantCount > 0
                          ? `지우기 (아래 ${item.descendantCount}개도 함께)`
                          : "지우기"}
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {/*
        자리를 못 찾은 것.

        프로젝트에 이어두었지만 아직 어느 자리에도 놓이지 않은 재료다.
        **실제 작업에서 가장 자주 보게 될 자리다.** 모으는 일과 배치하는
        일 사이에 이 칸이 있다. (설계 문서 7.4절)

        뼈대가 아직 없으면 보여주지 않는다. 놓을 자리가 없는데 "자리를
        못 찾았다"고 하면 사용자가 무엇을 해야 할지 알 수 없다.
      */}
      {items.length > 0 && unplaced.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-4 dark:bg-white/[.04]">
          <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            아직 자리를 못 찾은 것 {unplaced.length}개
          </h3>
          <p className="text-xs leading-5 text-zinc-500">
            이 프로젝트에 이어뒀지만 아직 어느 자리에도 놓지 않은 것입니다.
            위의 자리를 펼쳐 `이 자리에 재료 놓기`로 놓습니다.
          </p>
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {unplaced.map((choice) => (
              <li
                key={choice.value}
                className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-xs text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300"
              >
                {choice.label}
              </li>
            ))}
          </ul>

          {/*
            **여기에 둔다.** 이 칸이 곧 "어디에 놓지"를 묻는 자리다.
            자리마다 단추를 달면 뼈대가 스물한 자리일 때 스물한 번 물을 수
            있게 되고, 한 달에 예순 번뿐이다. (19-D)
          */}
          <SuggestPanel
            projectId={projectId}
            unplacedCount={unplaced.length}
            configured={aiConfigured}
          />
        </section>
      ) : null}

      {/* 맨 윗칸을 만든다. 목록 아래에 둬서 만들던 흐름이 이어진다. */}
      <form
        action={addOutlineNode}
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-black/[.12] px-4 py-3 dark:border-white/[.18]"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="parentId" value="" />
        <input
          name="title"
          type="text"
          required
          maxLength={300}
          placeholder="새 자리 이름"
          className="h-9 min-w-0 flex-1 rounded-full border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          자리 만들기
        </button>
      </form>
    </section>
  );
}

/**
 * 자리를 옮기는 단추.
 *
 * 폼 하나에 단추 하나다. 한 폼에 여러 단추를 두고 `value`로 가르는 길도
 * 있지만, 그러면 어느 단추가 눌렸는지를 브라우저가 정하게 된다. 나뉜 폼은
 * 무엇이 눌렸는지가 분명하다.
 */
function MoveButton({
  projectId,
  nodeId,
  action,
  direction,
  label,
}: {
  projectId: string;
  nodeId: string;
  action: (formData: FormData) => Promise<void>;
  direction: string;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="nodeId" value={nodeId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        className="h-8 rounded-full border border-black/[.08] px-3 text-xs text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
      >
        {label}
      </button>
    </form>
  );
}

/** 놓을 수 있는 재료 하나. 자료와 기록을 한 목록에 섞어 고른다. */
export type PlacementChoice = {
  /** `source:<id>` 또는 `capture:<id>`. 고른 것이 곧 뜻이 되게 한 값이다. */
  value: string;
  label: string;
  group: string;
};

/**
 * 이 자리에 놓인 재료.
 *
 * **무엇을 놓았는지와 그것으로 할 말을 함께 보여준다.** 재료만 늘어놓으면
 * 목록이고, 할 말이 붙어야 요리다. (설계 문서 7.1절 3번)
 */
function PlacedList({
  projectId,
  placed,
}: {
  projectId: string;
  placed: readonly PlacedItem[];
}) {
  if (placed.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {placed.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[.04]"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
              {item.kind === "source"
                ? getSourceTypeLabel(item.sourceType)
                : getCaptureTypeLabel(item.captureType)}
            </span>

            {/*
              **어느 자료에서 나온 기록인지 함께 적는다.**

              한 자리에 인용이 여럿 놓이면 `직접 인용`만으로는 어느 논문의
              말인지 알 수 없다. 글을 쓰면서 근거를 대는 자리라 **출처가
              바로 보여야 한다.** 사용자가 짚어준 것이다.
            */}
            {item.kind === "capture" && item.sourceTitle ? (
              <span className="max-w-[10rem] shrink-0 truncate text-[11px] text-zinc-500">
                {item.sourceTitle}
              </span>
            ) : null}

            {/*
              재료를 누르면 그 재료로 간다. 옆에 두고 보면서 쓰는 중이라
              원문을 확인하러 가는 일이 잦다.
            */}
            {/*
              **누르면 그 자리에서 내용이 뜬다.**

              처음에는 그 재료의 화면으로 보냈는데, 쓰던 자리를 잃는다.
              글을 쓰다가 "이 인용이 정확히 뭐였지"를 확인하는 것이므로,
              읽고 나서 돌아올 것이 아니라 **떠나지 않아야** 한다.
              물음표 단추와 같은 방식이다. (popover.tsx)
            */}
            <PlacedPeek item={item} />

            <form action={removePlacement} className="shrink-0">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="placementId" value={item.id} />
              <button
                type="submit"
                className="rounded-full px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-black/[.04] hover:text-red-700 dark:hover:bg-white/[.06] dark:hover:text-red-400"
              >
                빼기
              </button>
            </form>
          </div>

          {/*
            이 재료로 여기서 할 말.

            **무엇을 어디에 놓았는지는 못 바꾸고 이 칸만 고칠 수 있다.**
            옮기려면 빼고 다시 놓는다. 그때 무슨 말을 적을지 다시 생각하게
            되는 편이 맞다. (설계 문서 7.4절)
          */}
          <form action={savePlacementNote} className="flex items-start gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="placementId" value={item.id} />
            <textarea
              name="note"
              rows={2}
              maxLength={2000}
              defaultValue={item.note ?? ""}
              placeholder="이걸로 여기서 무슨 말을 할 것인가"
              className="min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 py-2 text-xs leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <button
              type="submit"
              className="h-8 shrink-0 rounded-full border border-black/[.08] px-3 text-xs text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              저장
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
