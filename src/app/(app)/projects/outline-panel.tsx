import { HelpButton } from "@/app/(app)/help-button";
import { indentSteps, type OutlineItem } from "@/lib/projects/outline";

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
 * 쓸 글을 적는다. 자리마다 재료를 놓는 일은 19-B에서 붙인다.
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
}: {
  projectId: string;
  items: readonly OutlineItem[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          뼈대
        </h2>
        <HelpButton topic="project-outline" label="프로젝트 뼈대" />
        <span className="text-xs text-zinc-500">
          {items.length > 0 ? `자리 ${items.length}개` : null}
        </span>
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
                들여쓰기를 여백으로 준다. 감싸는 칸을 겹치지 않는다.
                겹치면 깊은 자리가 좁은 화면에서 글자 한 줄 너비가 된다.
              */
              style={{ marginLeft: `${indentSteps(item.depth) * 1.25}rem` }}
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
                        placeholder="이 자리에서 할 말을 적습니다. 모아둔 재료는 19-B에서 여기 붙입니다."
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
