import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getPaperAnalysis } from "@/lib/papers/analysis-queries";
import { listProjectsForSource } from "@/lib/projects/queries";
import { isReadable, listSourceFiles } from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";

import { AnalysisForm } from "../../analysis-form";

export const metadata: Metadata = {
  title: "논문 분석 · ThreadMark",
};

/**
 * 논문 분석 서식만 크게 보는 화면. (설계 문서 8.2절)
 *
 * PDF를 옆에 두고 적는 것이 본래 자리다. 그쪽은 읽기 작업대에 있다. (9.1절)
 * 여기는 논문을 다시 펴지 않고 적어둔 것만 훑거나 고칠 때 쓴다.
 * 파일이 붙어 있으면 작업대로 건너가는 길을 위에 둔다.
 */
export default async function PaperAnalysisPage({
  params,
}: PageProps<"/sources/[id]/analysis">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다. (보안 원칙 9)
  if (!source) {
    notFound();
  }

  if (source.type !== "paper") {
    redirect(
      `/sources/${source.id}?notice=${encodeURIComponent(
        "논문 유형의 자료에만 분석을 적을 수 있습니다.",
      )}`,
    );
  }

  const [analysis, projects, files] = await Promise.all([
    getPaperAnalysis(source.id),
    listProjectsForSource(source.id),
    listSourceFiles(source.id),
  ]);

  const pdf = files.find(isReadable) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={`/sources/${source.id}`}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {source.title}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            논문 분석
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            묶음을 눌러 펼치고, 적은 만큼 저장하면 됩니다.
          </p>
        </div>

        {pdf ? (
          <Link
            href={`/sources/${source.id}/reader?file=${pdf.id}&panel=analysis`}
            className="h-11 rounded-full bg-zinc-900 px-5 text-sm font-medium leading-[2.75rem] text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            논문을 옆에 두고 적기
          </Link>
        ) : null}
      </header>

      <AnalysisForm
        sourceId={source.id}
        initial={analysis?.values ?? {}}
        projects={projects}
      />
    </div>
  );
}
