import Link from "next/link";

import { linkCaptureToProject } from "@/app/(app)/projects/actions";
import type { Capture } from "@/lib/captures/queries";
import { getCaptureTypeLabel } from "@/lib/captures/types";
import type { ProjectChip } from "@/lib/projects/queries";

import { deleteCapture } from "./actions";

/**
 * 기록 목록.
 *
 * 설계 문서 2.4절의 구분을 화면에서도 유지한다.
 * 원문은 인용 표시와 함께 다른 배경에 놓고, 옮긴 글에는 기계 번역임을 밝히고,
 * 내가 쓴 내용은 일반 본문으로 보여준다.
 *
 * 세 가지가 같은 모양으로 나란히 놓이면, 나중에 이 기록을 다시 읽을 때
 * 어디까지가 원문이고 어디부터가 내 생각인지 구분할 수 없다.
 */
export function CaptureList({
  captures,
  returnTo,
  emptyText,
  projects = [],
}: {
  captures: Capture[];
  returnTo: string;
  emptyText: string;
  /** 비어 있지 않으면 기록마다 프로젝트 연결 선택을 보여준다. */
  projects?: ProjectChip[];
}) {
  if (captures.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-50 px-6 py-8 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {captures.map((capture) => (
        <li
          key={capture.id}
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                {getCaptureTypeLabel(capture.captureType)}
              </span>

              {/*
                PDF에서 고른 기록이면 어느 쪽인지 보여주고, 그 자리로 돌아갈
                길을 준다. 설계 문서 9.3절의 "해당 페이지 재이동"이다.
                인용만 있고 어디서 왔는지 모르면 나중에 확인할 수가 없다.
              */}
              {capture.pdfLocation && capture.sourceId ? (
                <Link
                  href={`/sources/${capture.sourceId}/reader?file=${capture.pdfLocation.sourceFileId}&page=${capture.pdfLocation.page}`}
                  className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                >
                  {capture.pdfLocation.page}쪽으로
                </Link>
              ) : null}
            </div>

            <span className="text-xs text-zinc-500">
              {formatDateTime(capture.createdAt)}
            </span>
          </div>

          {capture.originalText ? (
            <figure className="flex flex-col gap-1">
              <figcaption className="text-xs font-medium text-zinc-500">
                원문
              </figcaption>
              <blockquote className="border-l-2 border-zinc-300 bg-zinc-50 py-2 pl-4 text-sm leading-7 text-zinc-800 dark:border-zinc-700 dark:bg-white/[.04] dark:text-zinc-200">
                <p className="whitespace-pre-wrap">{capture.originalText}</p>
              </blockquote>
            </figure>
          ) : null}

          {capture.translatedText ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-zinc-500">
                옮긴 글
                {capture.translationLanguage
                  ? ` · ${capture.translationLanguage}`
                  : null}
                {capture.aiGenerated ? " · 기계 번역" : null}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
                {capture.translatedText}
              </p>
            </div>
          ) : null}

          {capture.content ? (
            <div className="flex flex-col gap-1">
              {capture.originalText ? (
                <p className="text-xs font-medium text-zinc-500">내 메모</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-7 text-black dark:text-zinc-100">
                {capture.content}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
            <Link
              href={`/captures/${capture.id}/edit`}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              수정
            </Link>

            <form action={deleteCapture}>
              <input type="hidden" name="id" value={capture.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="text-sm font-medium text-red-700 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                삭제
              </button>
            </form>

            {projects.length > 0 ? (
              <form
                action={linkCaptureToProject}
                className="ml-auto flex items-center gap-2"
              >
                <input type="hidden" name="targetId" value={capture.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label htmlFor={`project-${capture.id}`} className="sr-only">
                  연결할 프로젝트
                </label>
                <select
                  id={`project-${capture.id}`}
                  name="projectId"
                  className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-xs text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  프로젝트에 추가
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
