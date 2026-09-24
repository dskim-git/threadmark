import type { Metadata } from "next";
import Link from "next/link";

import { AutoNotice } from "@/app/(app)/auto-notice";
import { requireActiveAccount } from "@/lib/auth/account";
import { listProjects } from "@/lib/projects/queries";

export const metadata: Metadata = {
  title: "프로젝트 · ThreadMark",
  description: "자료를 활용하는 목적 단위를 관리합니다.",
};

/**
 * 프로젝트 목록. (설계 문서 21절의 `/projects`)
 *
 * 만드는 폼은 이 화면에 두지 않는다. `/projects/new`가 맡는다.
 * 여기 오는 일은 대부분 만들려고가 아니라 들어가려고이고, 늘 펼쳐진 폼이
 * 그 목록을 화면 위쪽 한 조각으로 밀어내고 있었다.
 */

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  await requireActiveAccount("/projects");

  const params = await searchParams;
  const projects = await listProjects();

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      {/*
        만드는 길은 목록 위, 오른쪽에 둔다. 내 자료 화면의 `자료 담기`와
        같은 자리다. 화면마다 다른 곳에 있으면 그때마다 찾아야 한다.
      */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            프로젝트
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            같은 자료도 목적에 따라 다르게 쓰입니다. 논문, 수업, 연수처럼
            쓰임새를 기준으로 묶습니다.
          </p>
        </div>

        <Link
          href="/projects/new"
          className="h-11 shrink-0 rounded-full bg-zinc-900 px-6 text-sm font-medium leading-[2.75rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          새 프로젝트 만들기
        </Link>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <AutoNotice>{notice}</AutoNotice>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          내 프로젝트 {projects.length}개
        </h2>

        {projects.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-start gap-3 rounded-2xl border border-black/[.08] bg-white p-5 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: project.color ?? "transparent" }}
                  />

                  <span className="flex flex-col gap-1">
                    <span className="text-base font-medium text-black dark:text-zinc-50">
                      {project.name}
                    </span>
                    {project.projectType ? (
                      <span className="text-xs text-zinc-500">
                        {project.projectType}
                      </span>
                    ) : null}
                    {project.description ? (
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {project.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-zinc-50 px-6 py-8 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
            아직 프로젝트가 없습니다. 오른쪽 위 새 프로젝트 만들기로 시작해
            보세요.
          </p>
        )}
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
