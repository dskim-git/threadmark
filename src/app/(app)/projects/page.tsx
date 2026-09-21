import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";
import { listProjects } from "@/lib/projects/queries";

import { createProject } from "./actions";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = {
  title: "프로젝트 · ThreadMark",
  description: "자료를 활용하는 목적 단위를 관리합니다.",
};

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
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          프로젝트
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          같은 자료도 목적에 따라 다르게 쓰입니다. 논문, 수업, 연수처럼 쓰임새를
          기준으로 묶습니다.
        </p>
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
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {notice}
        </p>
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
            아직 프로젝트가 없습니다. 아래에서 하나 만들어 보세요.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-medium text-black dark:text-zinc-50">
          새 프로젝트
        </h2>
        <ProjectForm
          action={createProject}
          submitLabel="만들기"
          cancelHref="/home"
          values={{
            name: "",
            projectType: "",
            description: "",
            researchQuestion: "",
            targetOutput: "",
            startDate: "",
            endDate: "",
            color: "",
          }}
        />
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
