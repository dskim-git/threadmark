import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getProjectById } from "@/lib/projects/queries";

import { updateProject } from "../../actions";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = {
  title: "프로젝트 수정 · ThreadMark",
};

export default async function EditProjectPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/edit">) {
  await requireActiveAccount();

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const query = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={`/projects/${project.id}`}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 프로젝트로 돌아가기
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          프로젝트 수정
        </h1>
      </header>

      <ProjectForm
        action={updateProject}
        submitLabel="저장"
        cancelHref={`/projects/${project.id}`}
        errorMessage={firstValue(query.error)}
        values={{
          id: project.id,
          name: project.name,
          projectType: project.projectType ?? "",
          description: project.description ?? "",
          researchQuestion: project.researchQuestion ?? "",
          targetOutput: project.targetOutput ?? "",
          startDate: project.startDate ?? "",
          endDate: project.endDate ?? "",
          color: project.color ?? "",
        }}
      />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
