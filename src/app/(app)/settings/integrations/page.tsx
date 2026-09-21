import type { Metadata } from "next";

import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import { describeOAuthError } from "@/lib/drive/oauth";
import { CHILD_FOLDER_NAMES, ROOT_FOLDER_NAME } from "@/lib/drive/folders";

import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  repairDriveFolders,
} from "./actions";

export const metadata: Metadata = {
  title: "연결 설정 · ThreadMark",
  description: "외부 서비스 연결을 관리합니다.",
};

const NOTICES: Record<string, string> = {
  connected: "Google Drive를 연결했습니다.",
  disconnected: "Google Drive 연결을 끊었습니다.",
  folders_ready: "ThreadMark 폴더를 준비했습니다.",
};

const LOCAL_ERRORS: Record<string, string> = {
  not_signed_in: "로그인이 필요합니다.",
  not_configured: "Google 연결 설정이 완료되지 않았습니다.",
  unknown_origin: "요청 주소를 확인하지 못했습니다.",
  token_unavailable: "Google 접근 권한을 확인하지 못했습니다. 다시 연결해 주세요.",
  folder_failed: "ThreadMark 폴더를 준비하지 못했습니다.",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "연결됨",
  revoked: "권한이 해제됨",
  error: "확인 필요",
};

export default async function IntegrationsPage({
  searchParams,
}: PageProps<"/settings/integrations">) {
  const account = await requireActiveAccount("/settings/integrations");

  const params = await searchParams;
  const connection = await getDriveConnectionSummary(account.userId);

  const errorKey = firstValue(params.error);
  const noticeKey = firstValue(params.notice);

  // 로컬에서 판단한 오류와 Google이 돌려준 오류를 같은 자리에 보여준다.
  const errorMessage = errorKey
    ? (LOCAL_ERRORS[errorKey] ?? describeOAuthError(errorKey))
    : null;
  const noticeMessage = noticeKey ? (NOTICES[noticeKey] ?? null) : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          연결 설정
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          ThreadMark가 다른 서비스와 주고받는 권한을 관리합니다.
        </p>
      </header>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      {noticeMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {noticeMessage}
        </p>
      ) : null}

      <section className="flex flex-col gap-5 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-black dark:text-zinc-50">
              Google Drive
            </h2>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              PDF와 이미지를 선생님의 Google Drive에 보관합니다. 파일은
              ThreadMark가 아니라 선생님 계정에 남습니다.
            </p>
          </div>

          {connection ? (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
              {STATUS_LABELS[connection.status] ?? connection.status}
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-white/[.08]">
              연결 안 됨
            </span>
          )}
        </div>

        {/*
          설계 문서 10.2절과 15절: 권한을 요청하기 전에 무엇에 접근하는지 알린다.
        */}
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:bg-white/[.04] dark:text-zinc-300">
          <p className="font-medium text-black dark:text-zinc-50">
            요청하는 권한
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>ThreadMark가 만든 파일과, 선생님이 직접 고른 파일에만 접근합니다.</li>
            <li>Drive 전체를 읽을 수 있는 권한은 요청하지 않습니다.</li>
            <li>
              My Drive에 <code>{ROOT_FOLDER_NAME}</code> 폴더와 하위 폴더
              {` (${CHILD_FOLDER_NAMES.join(", ")})`}를 만듭니다.
            </li>
            <li>연결을 끊으면 저장된 접근 권한을 폐기합니다. 파일은 그대로 남습니다.</li>
          </ul>
        </div>

        {connection ? (
          <>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <dt className="text-zinc-500">연결 시각</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {formatDateTime(connection.connectedAt)}
                </dd>
              </div>

              <div className="flex flex-wrap gap-2">
                <dt className="text-zinc-500">ThreadMark 폴더</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {connection.rootFolderId
                    ? `준비됨 (하위 ${connection.folderNames.length}개)`
                    : "아직 준비되지 않음"}
                </dd>
              </div>
            </dl>

            {connection.lastError ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {connection.lastError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <form action={repairDriveFolders}>
                <button
                  type="submit"
                  className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                >
                  폴더 다시 준비
                </button>
              </form>

              <form action={connectGoogleDrive}>
                <button
                  type="submit"
                  className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                >
                  다시 연결
                </button>
              </form>

              <form action={disconnectGoogleDrive}>
                <button
                  type="submit"
                  className="h-11 rounded-full border border-red-300 px-5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  연결 끊기
                </button>
              </form>
            </div>
          </>
        ) : (
          <form action={connectGoogleDrive}>
            <button
              type="submit"
              className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
            >
              Google Drive 연결
            </button>
          </form>
        )}

        <p className="text-xs leading-5 text-zinc-500">
          Drive를 연결하지 않아도 웹사이트 주소와 텍스트 기록은 그대로 쓸 수
          있습니다. 연결은 파일을 보관할 때만 필요합니다.
        </p>
      </section>
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
