import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { linkSourceToProject, unlinkSourceFromProject } from "@/app/(app)/projects/actions";
import { requireActiveAccount } from "@/lib/auth/account";
import { listCapturesForSource } from "@/lib/captures/queries";
import { listProjectChips, listProjectsForSource } from "@/lib/projects/queries";
import { getSourceById } from "@/lib/sources/queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { deleteSource } from "../actions";

export const metadata: Metadata = {
  title: "자료 · ThreadMark",
};

export default async function SourceDetailPage({
  params,
  searchParams,
}: PageProps<"/sources/[id]">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다.
  // 구분하면 어떤 id가 존재하는지 알려주는 셈이 된다.
  if (!source) {
    notFound();
  }

  const [captures, linkedProjects, allProjects, query] = await Promise.all([
    listCapturesForSource(source.id),
    listProjectsForSource(source.id),
    listProjectChips(),
    searchParams,
  ]);

  const error = firstValue(query.error);
  const notice = firstValue(query.notice);
  const returnTo = `/sources/${source.id}`;

  const linkedIds = new Set(linkedProjects.map((project) => project.id));
  const linkableProjects = allProjects.filter(
    (project) => !linkedIds.has(project.id),
  );

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href="/library"
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 내 자료
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
            {getSourceTypeLabel(source.type)}
          </span>
          <span className="text-xs text-zinc-500">
            등록 {formatDateTime(source.createdAt)}
          </span>
          {source.updatedAt !== source.createdAt ? (
            <span className="text-xs text-zinc-500">
              수정 {formatDateTime(source.updatedAt)}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl font-semibold leading-9 tracking-tight text-black dark:text-zinc-50">
          {source.title}
        </h1>

        {source.subtitle ? (
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            {source.subtitle}
          </p>
        ) : null}
      </header>

      {source.originalUrl ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            원본 주소
          </h2>
          {/*
            저장 시점에 http/https만 통과시키므로 링크로 만들어도 안전하다.
            외부로 나가는 링크이므로 referrer와 opener를 넘기지 않는다.
          */}
          <a
            href={source.originalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-sm text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
          >
            {source.originalUrl}
          </a>
        </section>
      ) : null}

      {source.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            설명
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {source.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          프로젝트
        </h2>

        {linkedProjects.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {linkedProjects.map((project) => (
              <li key={project.id}>
                <form
                  action={unlinkSourceFromProject}
                  className="flex items-center gap-2 rounded-full border border-black/[.08] px-3 py-1 dark:border-white/[.145]"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: project.color ?? "transparent" }}
                  />
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-sm text-black hover:underline dark:text-zinc-50"
                  >
                    {project.name}
                  </Link>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="targetId" value={source.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    aria-label={`${project.name} 연결 끊기`}
                    className="text-sm text-zinc-400 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            연결된 프로젝트가 없습니다.
          </p>
        )}

        {linkableProjects.length > 0 ? (
          <form
            action={linkSourceToProject}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="targetId" value={source.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label htmlFor="projectId" className="sr-only">
              연결할 프로젝트
            </label>
            <select
              id="projectId"
              name="projectId"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {linkableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-10 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              프로젝트에 추가
            </button>
          </form>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-8 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          기록 {captures.length}건
        </h2>
        <CaptureList
          captures={captures}
          returnTo={returnTo}
          projects={allProjects}
          emptyText="아직 이 자료에 남긴 기록이 없습니다."
        />
      </section>

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-medium text-black dark:text-zinc-50">
          새 기록
        </h2>
        <CaptureForm
          action={createCapture}
          submitLabel="기록하기"
          returnTo={returnTo}
          compact
          values={{
            sourceId: source.id,
            captureType: "quote",
            content: "",
            originalText: "",
            translatedText: "",
            translationLanguage: "",
          }}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        <Link
          href={`/sources/${source.id}/edit`}
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          수정
        </Link>

        {/* 삭제는 표시만 남긴다. 되살릴 수 있어야 하기 때문이다. */}
        <form action={deleteSource}>
          <input type="hidden" name="id" value={source.id} />
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
