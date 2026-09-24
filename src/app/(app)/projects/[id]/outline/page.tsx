import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HelpButton } from "@/app/(app)/help-button";
import { PlacedPeek } from "@/app/(app)/projects/placed-peek";
import { requireActiveAccount } from "@/lib/auth/account";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import { indentSteps, type OutlineItem } from "@/lib/projects/outline";
import {
  nodeState,
  summarizeOutline,
  type NodeState,
  type OutlineProgress,
} from "@/lib/projects/outline-overview";
import { listOutline } from "@/lib/projects/outline-queries";
import {
  listPlacements,
  type PlacedItem,
} from "@/lib/projects/placement-queries";
import { getProjectById } from "@/lib/projects/queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

export const metadata: Metadata = {
  title: "조망 · ThreadMark",
};

/**
 * 프로젝트 조망. (19-C, 설계 문서 7.5절)
 *
 * **왜 화면을 따로 두는가.**
 *
 * 작업대(`/projects/[id]`)에서는 자리 하나를 펼치면 그 안이 통째로
 * 고치는 칸이다. 이름 칸, 여덟 줄짜리 글 칸, 놓인 재료, 고르는 창,
 * 옮기는 단추 여섯. 그래서 2장을 펼치면 3장이 화면 두 개쯤 아래로 밀린다.
 *
 * 그 상태로는 **글이 이어지는지 볼 수가 없다.** 2장 끝이 3장 첫 줄로
 * 이어지는지는 둘을 나란히 놓고서야 안다. 접는 칸 너머로는 판단할 수 없고,
 * 접는 칸을 없애면 작업대가 못 쓰게 된다. 두 가지를 한 화면에서 하려던
 * 것이 잘못이었다.
 *
 * **고치는 칸은 두지 않는다.** 여기서도 고칠 수 있게 하면 같은 글을 고치는
 * 자리가 두 곳이 되고, 그것은 이 저장소가 반복해서 데인 자리다.
 * (AGENTS.md 6절 `같은 뜻의 입력칸을 두 벌 만들지 않는다`)
 * 대신 자리마다 작업대의 그 자리로 가는 길을 둔다.
 *
 * **브라우저에서 돌릴 코드가 없다.** 읽는 화면이라 고르는 것도 보내는 것도
 * 없다. 놓인 재료를 들여다보는 창 하나만 client다.
 */
export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[id]/outline">) {
  await requireActiveAccount();

  const { id } = await params;
  const project = await getProjectById(id);

  // 없는 프로젝트와 남의 프로젝트를 구분하지 않는다.
  if (!project) {
    notFound();
  }

  const [outline, placements] = await Promise.all([
    listOutline(project.id),
    listPlacements(project.id),
  ]);

  /*
    자리별로 한 번에 나눈다. 자리마다 목록을 훑으면 자리 수 × 재료 수만큼
    헛일을 하고, 뼈대의 크기에 한계가 없어서 그 곱의 끝을 우리가 모른다.
    작업대가 하는 것과 같은 셈이다.
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

  const placedCounts = new Map(
    [...byNode].map(([nodeId, group]) => [nodeId, group.length]),
  );

  const progress = summarizeOutline(outline, placedCounts);

  const workbench = `/projects/${project.id}`;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={workbench}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {project.name}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            조망
          </h1>
          <HelpButton topic="project-overview" label="조망" />

          <Link
            href={workbench}
            className="ml-auto h-9 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium leading-9 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            고치러 가기
          </Link>
        </div>

        <p className="text-sm text-zinc-500">
          {project.name} · 처음부터 끝까지 이어서 읽습니다. 여기서는 고치지
          않습니다.
        </p>
      </header>

      {outline.length === 0 ? (
        <p className="rounded-2xl bg-white px-6 py-10 text-center text-sm leading-7 text-zinc-500 dark:bg-zinc-950">
          아직 자리가 없습니다.
          <br />
          <Link
            href={workbench}
            className="text-accent underline underline-offset-4 dark:text-accent-dark"
          >
            프로젝트 화면
          </Link>
          에서 첫 자리를 만들면 여기에 펼쳐집니다.
        </p>
      ) : (
        <>
          <ProgressBanner progress={progress} />

          <ol className="flex flex-col gap-6">
            {outline.map((item) => (
              <OverviewNode
                key={item.id}
                item={item}
                placed={byNode.get(item.id) ?? []}
                workbench={workbench}
              />
            ))}
          </ol>

          {/*
            맨 아래에서도 돌아갈 수 있어야 한다. 조망은 길다. 끝까지 읽고
            고칠 곳을 찾았는데 위로 스크롤해 올라가야 하면, 무엇을 고치려
            했는지 올라가는 동안 잊는다.
          */}
          <div className="border-t border-black/[.08] pt-6 dark:border-white/[.145]">
            <Link
              href={workbench}
              className="h-11 rounded-full border border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              고치러 가기
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 맨 위 한 줄. "지금 어디까지 했나"에 답한다.
 *
 * **끝자리만 센다.** 아래로 나뉜 자리에 글이 없는 것은 정상이고, 그것을
 * 빈 자리로 세면 멀쩡한 뼈대가 절반이 비었다고 나온다. 한 번 거짓말한
 * 숫자는 그 뒤로 아무도 보지 않는다. (outline-overview.ts)
 *
 * 그 셈이 눈에 안 보이면 "자리는 열둘인데 왜 아홉이라고 하지"가 된다.
 * 그래서 아래 줄에 전체 수를 함께 적는다.
 */
function ProgressBanner({
  progress,
}: {
  progress: OutlineProgress;
}) {
  const { leaves, written, materialOnly, empty, total, placedTotal } = progress;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
      <p className="text-sm text-black dark:text-zinc-50">
        글을 쓸 곳 {leaves}군데 중{" "}
        <strong className="font-semibold">{written}군데</strong> 썼습니다.
      </p>

      {/*
        막대 하나로 세 갈래를 보여준다. 숫자만 있으면 "6과 9" 사이의 거리가
        얼마나 되는지 읽는 사람이 나눗셈을 해야 한다.

        `leaves`가 0이면 그리지 않는다. 나눌 수 없는 값이다.
      */}
      {leaves > 0 ? (
        <div
          aria-hidden="true"
          className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[.08]"
        >
          <span
            className="bg-accent dark:bg-accent-dark"
            style={{ width: `${(written / leaves) * 100}%` }}
          />
          <span
            className="bg-accent-soft dark:bg-accent-dark-soft"
            style={{ width: `${(materialOnly / leaves) * 100}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Tally label="글 썼음" count={written} tone="done" />
        <Tally label="재료만 놓임" count={materialOnly} tone="partial" />
        <Tally label="아직 빔" count={empty} tone="empty" />
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        자리 {total}개 · 놓인 재료 {placedTotal}개. 아래로 나뉜 자리는 글이
        나뉜 쪽에 있으므로 `글을 쓸 곳`에 세지 않습니다.
      </p>
    </section>
  );
}

/** 갈래별 개수. 0이면 그리지 않는다. 없는 것을 굳이 알릴 이유가 없다. */
function Tally({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "done" | "partial" | "empty";
}) {
  if (count === 0) {
    return null;
  }

  const toneClass =
    tone === "done"
      ? "bg-accent-soft text-accent dark:bg-accent-dark-soft dark:text-accent-dark"
      : tone === "partial"
        ? "bg-zinc-100 text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400"
        : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${toneClass}`}
    >
      {label} {count}
    </span>
  );
}

/**
 * 자리 하나.
 *
 * **깊이를 들여쓰기로만 보여주지 않는다.** 좁은 화면에서는 들여쓰기가
 * 금세 바닥나고, 여섯 단을 넘으면 더 들여쓰지도 않는다. 그래서 글자
 * 크기로도 가른다. 둘 중 하나가 무너져도 나머지가 남는다.
 */
function OverviewNode({
  item,
  placed,
  workbench,
}: {
  item: OutlineItem;
  placed: readonly PlacedItem[];
  workbench: string;
}) {
  const state = nodeState(item, placed.length);

  return (
    <li
      /*
        들여쓰기를 작업대보다 좁게 준다(1.25rem → 0.75rem). 여기서는
        읽는 것이 일이라, 깊은 자리의 글이 오른쪽으로 밀리면 한 줄에
        담기는 글자가 줄어 읽기 어려워진다.
      */
      style={{ marginLeft: `${indentSteps(item.depth) * 0.75}rem` }}
      className={
        item.depth > 0
          ? "border-l border-black/[.08] pl-4 dark:border-white/[.145]"
          : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          {item.number}
        </span>

        <h2 className={`min-w-0 ${headingClass(item.depth)}`}>{item.title}</h2>

        <StateMark state={state} />

        {/*
          그 자리로 가는 길.

          작업대의 그 카드까지 데려간다. 카드는 접혀 있어서 한 번 더 눌러야
          펼쳐지지만, **적어도 어느 카드인지 찾지 않아도 된다.** 자리가
          스물이면 그 찾는 일이 고치는 일보다 오래 걸린다.
        */}
        <Link
          href={`${workbench}#node-${item.id}`}
          className="ml-auto shrink-0 whitespace-nowrap text-xs text-zinc-500 underline-offset-4 transition-colors hover:text-accent hover:underline dark:hover:text-accent-dark"
        >
          고치기
        </Link>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {/*
          글. 줄바꿈을 그대로 둔다. 문단을 나눈 것이 곧 뜻이다.

          읽는 폭을 제한한다. 한 줄이 너무 길면 눈이 다음 줄 첫머리를
          놓친다. `max-w-[68ch]`가 그 폭이다.
        */}
        {item.body ? (
          <p className="max-w-[68ch] whitespace-pre-wrap text-sm leading-8 text-zinc-800 dark:text-zinc-200">
            {item.body}
          </p>
        ) : null}

        {/*
          빈 자리를 숨기지 않는다.

          **조망에서 정작 보고 싶은 것은 채운 곳이 아니라 뚫린 곳이다.**
          빈 자리를 조용히 넘기면 조망이 "잘 되고 있다"고 거짓말을 한다.

          나뉜 자리는 다르다. 글이 나뉜 쪽에 있으니 뚫린 것이 아니다.
          같은 말로 알리면 멀쩡한 자리가 뚫린 자리처럼 보인다.
        */}
        {state === "empty" ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            아직 비어 있습니다.
          </p>
        ) : null}

        {state === "material-only" ? (
          <p className="text-sm text-zinc-500">
            재료는 놓았고 글은 아직입니다.
          </p>
        ) : null}

        {placed.length > 0 ? (
          <PlacedReading placed={placed} />
        ) : null}
      </div>
    </li>
  );
}

/**
 * 단계에 따른 제목 크기.
 *
 * 깊어질수록 작아지다가 멈춘다. 계속 줄이면 깊은 자리의 이름이 본문보다
 * 작아져서 제목으로 읽히지 않는다.
 */
function headingClass(depth: number): string {
  if (depth === 0) {
    return "text-lg font-semibold text-black dark:text-zinc-50";
  }

  if (depth === 1) {
    return "text-base font-medium text-black dark:text-zinc-50";
  }

  return "text-sm font-medium text-zinc-800 dark:text-zinc-200";
}

/** 손볼 곳만 표시한다. 다 된 자리에까지 꼬리표를 달면 표시가 눈에 안 띈다. */
function StateMark({ state }: { state: NodeState }) {
  if (state === "empty") {
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        비어 있음
      </span>
    );
  }

  if (state === "material-only") {
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
        재료만
      </span>
    );
  }

  return null;
}

/**
 * 이 자리에 놓인 재료.
 *
 * **내가 할 말이 위에 오고 재료가 아래에 온다.** 이 자리에서 찾는 것은
 * "이 조각이 무엇이었나"가 아니라 **"내가 이걸로 무슨 말을 하려고 했나"**다.
 * 재료는 그것을 받치는 근거다. 사용자가 짚어준 순서다. (19-B)
 *
 * 재료 이름을 누르면 그 자리에서 전문이 뜬다. 읽다가 인용을 확인하려고
 * 화면을 떠나면 어디까지 읽었는지를 잃는다. (placed-peek.tsx)
 */
function PlacedReading({ placed }: { placed: readonly PlacedItem[] }) {
  return (
    <ul className="flex max-w-[68ch] flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[.04]">
      {placed.map((item) => (
        <li key={item.id} className="flex flex-col gap-1">
          {item.note ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
              {item.note}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
              {item.kind === "source"
                ? getSourceTypeLabel(item.sourceType)
                : getCaptureTypeLabel(item.captureType)}
            </span>

            {/*
              어느 자료에서 나온 기록인지 함께 적는다. 한 자리에 인용이
              여럿이면 `직접 인용`만으로는 어느 논문의 말인지 알 수 없다.
            */}
            {item.kind === "capture" && item.sourceTitle ? (
              <span className="max-w-[12rem] shrink-0 truncate text-[11px] text-zinc-500">
                {item.sourceTitle}
              </span>
            ) : null}

            <PlacedPeek item={item} />

            {/*
              **놓기만 하고 할 말을 안 적은 것도 뚫린 곳이다.**

              재료를 그대로 옮겨 담는 것은 요리가 아니다. (설계 문서 7.1절
              3번) 조망이 빈 자리를 알리면서 이것을 넘기면, 재료가 쌓인
              자리가 다 된 것처럼 보인다.
            */}
            {!item.note ? (
              <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-400">
                할 말 아직
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
