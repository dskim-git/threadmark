import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  ANALYSIS_FIELDS,
  ANALYSIS_SECTIONS,
  MAX_ANALYSIS_FIELD_LENGTH,
  countFilled,
} from "@/lib/papers/analysis-fields";
import { getPaperAnalysis } from "@/lib/papers/analysis-queries";
import { listProjectsForSource } from "@/lib/projects/queries";
import { getSourceById } from "@/lib/sources/queries";

import { savePaperAnalysis } from "../../analysis-actions";

export const metadata: Metadata = {
  title: "논문 분석 · ThreadMark",
};

/**
 * 논문 분석 서식. (설계 문서 8.2절)
 *
 * 서른 칸이다. 한 화면에 늘어놓으면 아무도 채우지 않는다. 그래서 묶음마다
 * 접어두고, 채운 수를 묶음 옆에 보여준다. 어디까지 했는지가 한눈에 보이고,
 * 이어서 할 자리를 찾으려고 다시 읽지 않아도 된다.
 *
 * 첫 묶음만 펼쳐둔다. 논문을 읽는 순서가 그 순서이기도 하고, 처음 여는
 * 사람에게 "여기부터 적으면 된다"를 보여주는 자리이기도 하다.
 *
 * 저장은 한 번에 한다. 중간 저장을 자동으로 하지 않는다. 이 앱 어디에도
 * 아직 그런 장치가 없고, 여기에만 두면 다른 화면과 다르게 동작하게 된다.
 * 대신 저장한 뒤 이 화면에 그대로 남는다. 이어서 적는 것이 보통이라서다.
 */
export default async function PaperAnalysisPage({
  params,
  searchParams,
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

  const [analysis, projects, query] = await Promise.all([
    getPaperAnalysis(source.id),
    // 8.2절의 "관련 프로젝트". 글로 적지 않고 이미 맺어둔 연결을 보여준다.
    listProjectsForSource(source.id),
    searchParams,
  ]);

  const values = analysis?.values ?? {};
  const filled = countFilled(values);

  const error = firstValue(query.error);
  const notice = firstValue(query.notice);

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

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          논문 분석
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {filled}/{ANALYSIS_FIELDS.length}칸을 채웠습니다. 한 번에 다 채우지
          않아도 됩니다. 묶음을 눌러 펼치고, 적은 만큼 저장하면 됩니다.
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

      <form action={savePaperAnalysis} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={source.id} />

        {ANALYSIS_SECTIONS.map((section, index) => {
          const sectionFilled = countFilled(values, section.fields);

          return (
            <details
              key={section.id}
              /*
                첫 묶음과 아직 손대지 않은 묶음을 펼쳐둔다.
                다 채운 묶음을 접어두면 남은 곳이 눈에 띈다.
              */
              open={index === 0 || sectionFilled === 0}
              className="rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
            >
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-5 py-4">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  {section.title}
                </span>
                <span className="text-xs text-zinc-500">
                  {sectionFilled}/{section.fields.length}
                </span>
              </summary>

              <div className="flex flex-col gap-5 border-t border-black/[.06] px-5 py-5 dark:border-white/[.1]">
                <p className="text-xs leading-5 text-zinc-500">
                  {section.purpose}
                </p>

                {/*
                  8.2절의 "관련 프로젝트"는 글로 적지 않는다.
                  source_projects가 이미 그 일을 한다. 두 곳에 적으면
                  같은 물음에 답이 두 개가 된다.
                */}
                {section.id === "context" ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-white/[.04]">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      관련 프로젝트
                    </p>
                    {projects.length > 0 ? (
                      <ul className="flex flex-wrap gap-2">
                        {projects.map((project) => (
                          <li
                            key={project.id}
                            className="rounded-full border border-black/[.08] px-3 py-1 text-xs text-zinc-700 dark:border-white/[.145] dark:text-zinc-300"
                          >
                            {project.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs leading-5 text-zinc-500">
                        아직 연결된 프로젝트가 없습니다.
                      </p>
                    )}
                    <Link
                      href={`/sources/${source.id}`}
                      className="w-fit text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                    >
                      자료 상세에서 연결하기
                    </Link>
                  </div>
                ) : null}

                {section.fields.map((field) => (
                  <div key={field.column} className="flex flex-col gap-2">
                    <label
                      htmlFor={field.column}
                      className="text-sm font-medium text-black dark:text-zinc-50"
                    >
                      {field.label}
                    </label>

                    {field.size === "short" ? (
                      <input
                        id={field.column}
                        name={field.column}
                        type="text"
                        maxLength={MAX_ANALYSIS_FIELD_LENGTH}
                        defaultValue={values[field.column] ?? ""}
                        className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                    ) : (
                      <textarea
                        id={field.column}
                        name={field.column}
                        rows={4}
                        maxLength={MAX_ANALYSIS_FIELD_LENGTH}
                        defaultValue={values[field.column] ?? ""}
                        className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                      />
                    )}

                    {field.hint ? (
                      <p className="text-xs leading-5 text-zinc-500">
                        {field.hint}
                      </p>
                    ) : null}
                  </div>
                ))}

                {/*
                  8.2절의 "연결되는 다른 자료"도 글로 적지 않는다.
                  8.4절의 source_relations가 맡는다. 아직 만들지 않았다.
                */}
                {section.id === "use" ? (
                  <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500 dark:bg-white/[.04]">
                    연결되는 다른 자료는 논문끼리 잇는 기능(14-D)에서 다룹니다.
                    지금은 프로젝트로 묶어두면 함께 볼 수 있습니다.
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}

        {/*
          저장 단추를 아래에 붙여둔다. 묶음을 여러 개 펼치면 화면이 길어지는데,
          그때 맨 아래까지 내려가야 저장할 수 있으면 저장을 잊는다.
        */}
        <div className="sticky bottom-4 flex items-center gap-3 rounded-2xl border border-black/[.08] bg-white/95 p-4 backdrop-blur dark:border-white/[.145] dark:bg-zinc-950/95">
          <button
            type="submit"
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>
          <span className="text-xs text-zinc-500">
            펼치지 않은 묶음의 내용도 그대로 저장됩니다.
          </span>
        </div>
      </form>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
