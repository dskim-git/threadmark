import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import {
  PROJECT_USE_FIELDS,
  countUseFilled,
  getPaperUseStatusLabel,
} from "@/lib/papers/project-use-fields";
import { listProjectPaperUses } from "@/lib/papers/project-use-queries";
import {
  getProjectById,
  listProjectCaptures,
  listProjectSources,
} from "@/lib/projects/queries";
import { listSources } from "@/lib/sources/queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import {
  deleteProject,
  linkSourceToProject,
  unlinkCaptureFromProject,
  unlinkSourceFromProject,
} from "../actions";

export const metadata: Metadata = {
  title: "프로젝트 · ThreadMark",
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]">) {
  await requireActiveAccount();

  const { id } = await params;
  const project = await getProjectById(id);

  // 없는 프로젝트와 남의 프로젝트를 구분하지 않는다.
  if (!project) {
    notFound();
  }

  const [linkedSources, linkedCaptures, paperUses, allSources, query] =
    await Promise.all([
      listProjectSources(project.id),
      listProjectCaptures(project.id),
      listProjectPaperUses(project.id),
      listSources(),
      searchParams,
    ]);

  const returnTo = `/projects/${project.id}`;
  const linkedIds = new Set(linkedSources.map((source) => source.id));
  const linkableSources = allSources.filter(
    (source) => !linkedIds.has(source.id),
  );

  const notice = firstValue(query.notice);
  const error = firstValue(query.error);

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href="/projects"
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 프로젝트
        </Link>
      </nav>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
            style={{ backgroundColor: project.color ?? "transparent" }}
          />
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {project.name}
          </h1>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {project.projectType ? <span>{project.projectType}</span> : null}
          {project.startDate ? <span>시작 {project.startDate}</span> : null}
          {project.endDate ? <span>종료 {project.endDate}</span> : null}
        </div>

        {project.description ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {project.description}
          </p>
        ) : null}
      </header>

      {project.researchQuestion || project.targetOutput ? (
        <section className="flex flex-col gap-4 rounded-2xl bg-zinc-50 p-6 dark:bg-white/[.04]">
          {project.researchQuestion ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-medium text-zinc-500">연구 질문</h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
                {project.researchQuestion}
              </p>
            </div>
          ) : null}

          {project.targetOutput ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-medium text-zinc-500">목표 산출물</h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
                {project.targetOutput}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          연결된 자료 {linkedSources.length}건
        </h2>

        {linkedSources.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {linkedSources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <Link
                  href={`/sources/${source.id}`}
                  className="flex items-center gap-3 text-sm text-black hover:underline dark:text-zinc-50"
                >
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                    {getSourceTypeLabel(source.type)}
                  </span>
                  {source.title}
                </Link>

                <form action={unlinkSourceFromProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="targetId" value={source.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="text-sm text-zinc-500 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    연결 끊기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">연결된 자료가 없습니다.</p>
        )}

        {linkableSources.length > 0 ? (
          <form
            action={linkSourceToProject}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label htmlFor="targetId" className="sr-only">
              연결할 자료
            </label>
            <select
              id="targetId"
              name="targetId"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {linkableSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-10 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              자료 연결
            </button>
          </form>
        ) : null}
      </section>

      {/*
        논문 활용 계획. (설계 문서 8.3절)

        원고를 쓸 때는 논문 한 편이 아니라 프로젝트 하나를 붙들고 앉는다.
        그래서 "이 프로젝트에 쓸 논문이 무엇이고 어디까지 됐는가"를 여기서
        한눈에 본다. 적고 고치는 것은 논문 화면에서 한다. 두 곳에서 고칠 수
        있게 하면 같은 글을 두 자리에서 맞춰야 한다.

        계획이 하나도 없으면 자리를 만들지 않는다. 논문이 아닌 자료만 모은
        프로젝트에서는 영원히 빈 칸으로 남는다.
      */}
      {paperUses.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            논문 활용 계획 {paperUses.length}건
          </h2>

          <ul className="flex flex-col gap-2">
            {paperUses.map((use) => (
              <li
                key={use.id}
                className="flex flex-col gap-2 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/sources/${use.paperSourceId}`}
                    className="text-sm text-black hover:underline dark:text-zinc-50"
                  >
                    {use.paperTitle}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {getPaperUseStatusLabel(use.status)} ·{" "}
                    {countUseFilled(use.values)}/{PROJECT_USE_FIELDS.length}
                  </span>
                </div>

                {use.values.planned_section ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {use.values.planned_section}
                  </p>
                ) : null}

                {use.values.usage_intent ? (
                  <p className="line-clamp-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    {use.values.usage_intent}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          연결된 기록 {linkedCaptures.length}건
        </h2>

        {linkedCaptures.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {linkedCaptures.map((capture) => (
              <li
                key={capture.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-zinc-500">
                    {getCaptureTypeLabel(capture.captureType)}
                  </span>
                  <p className="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-200">
                    {capture.content ?? capture.originalText}
                  </p>
                </div>

                <form action={unlinkCaptureFromProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="targetId" value={capture.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="text-sm text-zinc-500 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    연결 끊기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            연결된 기록이 없습니다. 기록 아래의 프로젝트 선택에서 연결합니다.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <Link
          href={`/projects/${project.id}/edit`}
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          수정
        </Link>

        <form action={deleteProject}>
          <input type="hidden" name="id" value={project.id} />
          <button
            type="submit"
            className="h-11 rounded-full border border-red-300 px-6 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            삭제
          </button>
        </form>
      </div>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
