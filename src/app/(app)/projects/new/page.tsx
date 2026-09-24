import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";

import { createProject } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = {
  title: "새 프로젝트 · ThreadMark",
  description: "자료를 활용하는 목적 단위를 새로 만듭니다.",
};

/**
 * 새 프로젝트를 만드는 화면.
 *
 * 예전에는 이 폼이 `/projects`의 목록 아래에 늘 펼쳐져 있었다. 프로젝트가
 * 하나뿐일 때는 괜찮았지만, 이 화면에 오는 일은 대부분 **만들려고**가 아니라
 * **들어가려고**다. 그런데 화면의 대부분이 만드는 폼이라 목록이 위쪽 한
 * 조각으로 밀려 있었다. 자주 하는 일이 화면을 적게 쓰고 있었다.
 *
 * 자료 등록(`/sources/new`)과 같은 모양으로 맞췄다. 목록 화면에는 단추만
 * 두고, 만드는 일은 자기 화면에서 한다.
 *
 * 오류는 이 화면에 그대로 보여준다. 목록으로 돌려보내면 무엇이 잘못됐는지
 * 읽는 순간 고쳐 쓸 칸이 눈앞에 없다.
 */
export default async function NewProjectPage({
  searchParams,
}: PageProps<"/projects/new">) {
  await requireActiveAccount("/projects/new");

  const query = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href="/projects"
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 프로젝트 목록으로
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          새 프로젝트
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          이름만 있으면 시작할 수 있습니다. 나머지는 진행하면서 채워 넣습니다.
        </p>
      </header>

      <ProjectForm
        action={createProject}
        showTemplates
        submitLabel="만들기"
        cancelHref="/projects"
        errorMessage={firstValue(query.error)}
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
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
