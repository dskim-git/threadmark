import Link from "next/link";

import { driveViewUrl, formatByteSize } from "@/lib/drive/upload";
import { isReadable, type SourceFileItem } from "@/lib/sources/files";

import { cleanupStaleUploads, detachSourceFile } from "./file-actions";

/**
 * 자료에 붙은 파일 목록.
 *
 * 상태를 그대로 보여준다. 설계 문서 10.4절이 요구한 대로, 무엇이 잘못되었고
 * 무엇을 하면 되는지 구분해서 알려주는 것이 목적이다.
 *
 *   보관됨   Drive에서 확인을 마쳤다. 열어볼 수 있다.
 *   올리는 중 아직 끝나지 않았다. 기다리면 된다.
 *   중단됨   오래 끝나지 않았다. 정리하거나 다시 올리면 된다.
 */

export function FileList({
  sourceId,
  files,
}: {
  sourceId: string;
  files: SourceFileItem[];
}) {
  if (files.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        아직 이 자료에 붙인 파일이 없습니다.
      </p>
    );
  }

  const staleCount = files.filter((file) => file.stale).length;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {/*
                  파일 이름은 사용자가 정한 값이다. React가 그대로 문자로 넣으므로
                  표시 자체는 안전하다. 링크로 만드는 것은 이름이 아니라
                  Drive 식별자로 만든 주소뿐이다.
                */}
                <span className="truncate text-sm font-medium text-black dark:text-zinc-50">
                  {file.fileName}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatByteSize(file.byteSize)}
                </span>
              </div>

              <span className="text-xs text-zinc-500">
                {statusText(file)}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {/*
                앱 안에서 읽는 길. (설계 문서 9.1절)
                Drive에서 여는 것보다 앞에 둔다. 이쪽이 기본 동작이고,
                페이지를 기억하고 앞으로 기록도 남길 수 있는 곳이다.
              */}
              {isReadable(file) ? (
                <Link
                  href={`/sources/${sourceId}/reader?file=${file.id}`}
                  className="text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                >
                  열기
                </Link>
              ) : null}

              {file.status === "ready" && file.driveFileId ? (
                /*
                  Drive에서 열어보는 링크다. 파일을 공개하지 않는다.
                  권한이 있는 사람에게만 열리며, 설계 문서 2.3절이 금지한
                  "공개 공유 링크로 바꾸는 것"과는 다른 이야기다.
                */
                <a
                  href={driveViewUrl(file.driveFileId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                >
                  Drive에서 열기
                </a>
              ) : null}

              <form action={detachSourceFile}>
                <input type="hidden" name="fileId" value={file.id} />
                <input type="hidden" name="sourceId" value={sourceId} />
                <button
                  type="submit"
                  aria-label={`${file.fileName} 첨부 해제`}
                  className="text-sm text-zinc-400 transition-colors hover:text-red-700 dark:hover:text-red-400"
                >
                  해제
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {staleCount > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
            끝나지 않은 업로드가 {staleCount}건 있습니다. 정리하면 이 기록만
            지워지고 Drive의 파일은 건드리지 않습니다.
          </p>
          <form action={cleanupStaleUploads}>
            <input type="hidden" name="sourceId" value={sourceId} />
            <button
              type="submit"
              className="h-10 rounded-full border border-amber-300 px-4 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-900/60 dark:text-amber-200 dark:hover:bg-amber-950/60"
            >
              기록 정리
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function statusText(file: SourceFileItem): string {
  if (file.status === "ready") {
    return "보관됨";
  }

  return file.stale ? "중단됨 — 정리하거나 다시 올려 주세요" : "올리는 중…";
}
