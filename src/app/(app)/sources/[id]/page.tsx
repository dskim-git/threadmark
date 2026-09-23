import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createCapture } from "@/app/(app)/captures/actions";
import { CaptureForm } from "@/app/(app)/captures/capture-form";
import { CaptureList } from "@/app/(app)/captures/capture-list";
import { linkSourceToProject, unlinkSourceFromProject } from "@/app/(app)/projects/actions";
import { requireActiveAccount } from "@/lib/auth/account";
import { listCapturesForSource } from "@/lib/captures/queries";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import {
  ANALYSIS_FIELDS,
  countFilled,
} from "@/lib/papers/analysis-fields";
import { getPaperAnalysis } from "@/lib/papers/analysis-queries";
import { listPaperProjectUses } from "@/lib/papers/project-use-queries";
import { buildCitation, getPaperProfile } from "@/lib/papers/queries";
import { listProjectChips, listProjectsForSource } from "@/lib/projects/queries";
import { listSourceFiles } from "@/lib/sources/files";
import { listSourceRelations } from "@/lib/sources/relation-queries";
import {
  SOURCE_RELATION_OPTIONS,
  getSourceRelationLabel,
} from "@/lib/sources/relation-types";
import { getSourceById, listSources } from "@/lib/sources/queries";
import { getSourceTypeLabel } from "@/lib/sources/types";

import { deleteSource } from "../actions";
import {
  linkSourceRelation,
  unlinkSourceRelation,
} from "../relation-actions";
import { DrivePickerButton } from "../drive-picker-button";
import { FileList } from "../file-list";
import { FileUpload } from "../file-upload";
import { PaperSummary } from "../paper-summary";
import { ProjectUsePanel } from "../project-use-panel";

export const metadata: Metadata = {
  title: "자료 · ThreadMark",
};

export default async function SourceDetailPage({
  params,
  searchParams,
}: PageProps<"/sources/[id]">) {
  const account = await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다.
  // 구분하면 어떤 id가 존재하는지 알려주는 셈이 된다.
  if (!source) {
    notFound();
  }

  const [
    captures,
    linkedProjects,
    allProjects,
    files,
    driveConnection,
    paperProfile,
    paperAnalysis,
    paperUses,
    relations,
    allSources,
    query,
  ] = await Promise.all([
    listCapturesForSource(source.id),
    listProjectsForSource(source.id),
    listProjectChips(),
    listSourceFiles(source.id),
    getDriveConnectionSummary(account.userId),
    // 논문이 아닌 자료에는 조회하지 않는다. 있을 수 없는 행을 찾는 왕복이 된다.
    source.type === "paper" ? getPaperProfile(source.id) : null,
    source.type === "paper" ? getPaperAnalysis(source.id) : null,
    source.type === "paper" ? listPaperProjectUses(source.id) : [],
    listSourceRelations(source.id),
    listSources(),
    searchParams,
  ]);

  const citation =
    paperProfile !== null
      ? buildCitation(paperProfile, {
          title: source.title,
          originalUrl: source.originalUrl,
        })
      : null;

  const error = firstValue(query.error);
  const notice = firstValue(query.notice);
  const returnTo = `/sources/${source.id}`;

  const linkedIds = new Set(linkedProjects.map((project) => project.id));
  const linkableProjects = allProjects.filter(
    (project) => !linkedIds.has(project.id),
  );

  /*
    이을 수 있는 다른 자료. (설계 문서 8.4절)

    자기 자신은 뺀다. 데이터베이스도 막지만, 목록에 있으면 고를 수 있는 것처럼
    보이고 눌러야 안 된다는 것을 안다.
  */
  const relatableSources = allSources.filter((other) => other.id !== source.id);

  /*
    활용 계획 칸을 보여줄 프로젝트. (설계 문서 8.3절)

    연결된 프로젝트가 기본이다. 여기에 **연결은 끊겼는데 계획이 남아 있는**
    프로젝트를 덧붙인다. 빼면 적어둔 글이 사라진 것처럼 보이는데, 사용자는
    프로젝트 연결만 정리했다고 생각한다.
  */
  const usePanelProjects = [
    ...linkedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      linked: true,
    })),
    ...allProjects
      .filter(
        (project) =>
          !linkedIds.has(project.id) &&
          paperUses.some((use) => use.projectId === project.id),
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        linked: false,
      })),
  ];

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

      {/*
        논문 정보. 논문 유형일 때만 보여준다. (설계 문서 8.1절)
        다른 유형에서는 자리조차 만들지 않는다. 적을 수 없는 칸을 보여주면
        "여기는 왜 안 되지"를 묻게 된다.
      */}
      {source.type === "paper" ? (
        <PaperSummary
          sourceId={source.id}
          profile={paperProfile}
          citation={citation}
          analysisFilled={countFilled(paperAnalysis?.values ?? {})}
          analysisTotal={ANALYSIS_FIELDS.length}
        />
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

      {/*
        프로젝트별 활용 계획. 논문 유형일 때만 보여준다. (설계 문서 8.3절)

        프로젝트 영역 바로 아래에 둔다. 계획은 연결된 프로젝트에 딸린 것이고,
        연결이 없으면 적을 자리도 없다. 떨어뜨려 놓으면 "프로젝트를 연결하라"는
        안내와 연결하는 자리가 멀어진다.
      */}
      {source.type === "paper" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            프로젝트별 활용 계획
          </h2>
          <p className="text-xs leading-5 text-zinc-500">
            이 논문을 각 프로젝트에서 어떻게 쓸지 적습니다. 논문이 무엇을
            말하는지는 논문 분석에, 내 원고의 어디에 넣을지는 여기에 적습니다.
          </p>
          <ProjectUsePanel
            sourceId={source.id}
            projects={usePanelProjects}
            uses={paperUses}
          />
        </section>
      ) : null}

      {/*
        자료끼리의 관계. (설계 문서 8.4절)

        논문 유형으로 제한하지 않는다. 이 표는 자료 일반의 것이고, 책이나
        웹사이트가 논문을 인용하는 일도 있다. 13.1절은 같은 표로 음악의
        여러 버전을 잇는다. 그 관계 종류는 15단계에서 더한다.

        방향을 화살표로 그대로 보여준다. `인용함`과 `인용됨`이 둘 다 있어서,
        어느 쪽에서 적었는지에 따라 같은 사실이 다른 말로 남는다.
        화살표가 없으면 목록에서 그 둘을 구별할 수 없다.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          관련 자료
        </h2>

        {relations.outgoing.length > 0 || relations.incoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {relations.outgoing.map((related) => (
              <li
                key={related.relationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="text-zinc-500">이 자료</span>
                  <span aria-hidden="true" className="text-zinc-400">
                    →
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                    {getSourceRelationLabel(related.relationType)}
                  </span>
                  <span aria-hidden="true" className="text-zinc-400">
                    →
                  </span>
                  <Link
                    href={`/sources/${related.id}`}
                    className="text-black hover:underline dark:text-zinc-50"
                  >
                    {related.title}
                  </Link>
                </div>

                <form action={unlinkSourceRelation}>
                  <input
                    type="hidden"
                    name="relationId"
                    value={related.relationId}
                  />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="text-sm text-zinc-500 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    관계 끊기
                  </button>
                </form>
              </li>
            ))}

            {relations.incoming.map((related) => (
              <li
                key={related.relationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/sources/${related.id}`}
                    className="text-black hover:underline dark:text-zinc-50"
                  >
                    {related.title}
                  </Link>
                  <span aria-hidden="true" className="text-zinc-400">
                    →
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                    {getSourceRelationLabel(related.relationType)}
                  </span>
                  <span aria-hidden="true" className="text-zinc-400">
                    →
                  </span>
                  <span className="text-zinc-500">이 자료</span>
                </div>

                <form action={unlinkSourceRelation}>
                  <input
                    type="hidden"
                    name="relationId"
                    value={related.relationId}
                  />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="text-sm text-zinc-500 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    관계 끊기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">아직 이어둔 자료가 없습니다.</p>
        )}

        {relatableSources.length > 0 ? (
          <form
            action={linkSourceRelation}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="fromSourceId" value={source.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <label htmlFor="relationType" className="sr-only">
              관계
            </label>
            {/*
              고를 때 방향을 함께 보여준다. 이름만으로는 `인용함`과 `인용됨`
              가운데 무엇을 골라야 할지 알 수 없다.
            */}
            <select
              id="relationType"
              name="relationType"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {SOURCE_RELATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.hint}
                </option>
              ))}
            </select>

            <label htmlFor="toSourceId" className="sr-only">
              이을 자료
            </label>
            <select
              id="toSourceId"
              name="toSourceId"
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            >
              {relatableSources.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.title}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="h-10 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              자료 잇기
            </button>
          </form>
        ) : (
          <p className="text-xs leading-5 text-zinc-500">
            이을 다른 자료가 없습니다. 자료를 하나 더 등록하면 여기서 이을 수
            있습니다.
          </p>
        )}
      </section>

      {/*
        파일 영역. 설계 문서 10.3절.

        Drive에 연결되지 않아도 이 자료의 나머지 기능은 그대로 쓸 수 있다.
        그래서 화면을 막지 않고 안내만 보여준다. (설계 문서 10.4절 마지막 줄)
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          파일
        </h2>

        <FileList sourceId={source.id} files={files} />

        {driveConnection?.status === "connected" ? (
          <>
            <FileUpload sourceId={source.id} />
            {/*
              이미 Drive에 있는 파일을 붙이는 길. (설계 문서 10.2절)
              올리기와 나란히 둔다. 사용자에게는 "파일을 붙인다"는 한 가지 일이고,
              그 파일이 내 컴퓨터에 있느냐 Drive에 있느냐가 다를 뿐이다.
            */}
            <DrivePickerButton sourceId={source.id} />
          </>
        ) : (
          <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
            {driveConnection
              ? "Google Drive 연결을 다시 확인해야 파일을 올릴 수 있습니다. "
              : "파일을 보관하려면 먼저 Google Drive를 연결해 주세요. "}
            <Link
              href="/settings/integrations"
              className="underline underline-offset-2"
            >
              연결 설정으로 가기
            </Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-black/[.08] pt-8 dark:border-white/[.145]">
        <h2 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          기록 {captures.length}건
        </h2>
        <CaptureList
          captures={captures}
          returnTo={returnTo}
          projects={allProjects}
          /*
            기록에 적힌 checksum과 지금 파일의 checksum을 견주어
            "위치가 달라졌을 수 있음"을 표시한다. (설계 문서 9.2절)
          */
          fileChecksums={Object.fromEntries(
            files.map((file) => [file.id, file.checksum]),
          )}
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
