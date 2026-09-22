"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { openDrivePicker, type PickedFile } from "@/lib/drive/open-picker";
import { sendFileToDrive } from "@/lib/drive/send-to-drive";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  PICKER_MIME_TYPES,
  describeUnacceptableFile,
  fileNameToTitle,
  formatByteSize,
} from "@/lib/drive/upload";

import { createSourceReturningId } from "./actions";
import {
  attachPickedFile,
  createPickerSession,
  finishFileUpload,
  startFileUpload,
} from "./file-actions";
import { ProgressBar } from "./file-upload";
import { SourceFields, type SourceFieldValues } from "./source-fields";

/**
 * 자료를 만들면서 파일도 함께 붙인다.
 *
 * 왜 브라우저가 순서를 맡는가
 *   파일은 반드시 어떤 자료에 속해야 한다. 그런데 이 화면에서는 저장을 누르기
 *   전까지 자료가 없다. 그래서 저장 한 번에 세 가지가 순서대로 일어난다.
 *
 *     1. 자료를 만든다
 *     2. 방금 만든 자료에 파일을 붙인다
 *     3. 자료 상세로 옮긴다
 *
 *   서버가 이걸 한 번에 처리할 수는 없다. 파일이 서버를 거치지 않기 때문이다.
 *   (설계 문서 10.3절) 자료를 만든 뒤에야 받을 수 있는 id를 들고, 브라우저가
 *   Drive와 직접 주고받아야 한다.
 *
 * 파일을 붙이는 길은 둘이다
 *   내 컴퓨터에서 올리거나(10.3절), 이미 Drive에 있는 것을 고르거나(10.2절).
 *   한 번에 하나만 고르게 한다. 둘 다 고를 수 있게 하면 "어느 쪽이 붙는 거지"를
 *   사용자가 추측해야 한다. 새로 고르면 앞의 것은 물러난다.
 *
 * 자료는 만들어졌는데 파일만 실패하면
 *   자료를 지우지 않는다. 제목과 설명을 다시 입력하게 만드는 편이 더 나쁘다.
 *   대신 자료 상세로 옮기면서 무엇이 안 됐는지 알린다. 거기서 다시 하면 된다.
 */

type Attachment =
  | { kind: "upload"; file: File }
  | { kind: "picked"; picked: PickedFile };

type SubmitState =
  | { phase: "idle" }
  | { phase: "picking" }
  | { phase: "creating" }
  | { phase: "preparing" }
  | { phase: "sending"; percent: number }
  | { phase: "verifying" };

const MAX_MEGABYTES = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

export function NewSourceForm({
  values,
  driveConnected,
}: {
  values: SourceFieldValues;
  driveConnected: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [state, setState] = useState<SubmitState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);

  const busy = state.phase !== "idle";

  /**
   * 제목이 비어 있을 때만 파일 이름으로 채운다.
   * 이미 적어둔 것은 건드리지 않는다. 사용자가 쓴 것이 파일 이름보다 낫다.
   */
  function suggestTitle(fileName: string | null) {
    if (!fileName) {
      return;
    }

    const titleInput = formRef.current?.elements.namedItem("title");

    if (!(titleInput instanceof HTMLInputElement)) {
      return;
    }

    if (titleInput.value.trim() !== "") {
      return;
    }

    const suggested = fileNameToTitle(fileName);

    if (suggested) {
      titleInput.value = suggested;
    }
  }

  function clearFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFilePick(picked: File | null) {
    setError(null);

    if (!picked) {
      return;
    }

    const unacceptable = describeUnacceptableFile(picked);

    if (unacceptable) {
      setError(unacceptable);
      setAttachment(null);

      // 받아들이지 않은 파일은 입력란에도 남기지 않는다.
      // 남아 있으면 화면에는 오류가 떠 있는데 파일 이름은 보이는 상태가 된다.
      clearFileInput();

      return;
    }

    setAttachment({ kind: "upload", file: picked });
    suggestTitle(picked.name);
  }

  async function handleDrivePick() {
    setError(null);
    setState({ phase: "picking" });

    const session = await createPickerSession();

    if (!session.ok) {
      setError(session.message);
      setState({ phase: "idle" });

      return;
    }

    let picked: PickedFile | null;

    try {
      picked = await openDrivePicker({
        accessToken: session.accessToken,
        apiKey: session.apiKey,
        appId: session.appId,
        mimeTypes: PICKER_MIME_TYPES,
      });
    } catch {
      setError("Drive 파일 목록을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setState({ phase: "idle" });

      return;
    }

    setState({ phase: "idle" });

    // 취소했다. 앞서 고른 것이 있으면 그대로 둔다.
    if (!picked) {
      return;
    }

    setAttachment({ kind: "picked", picked });
    clearFileInput();
    suggestTitle(picked.displayName);
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    // 올릴 수 없는 파일이면 자료를 만들기 전에 멈춘다.
    // 순서가 반대면 "자료만 덩그러니 생기고 파일은 못 붙이는" 상태가 된다.
    if (attachment?.kind === "upload") {
      const unacceptable = describeUnacceptableFile(attachment.file);

      if (unacceptable) {
        setError(unacceptable);

        return;
      }
    }

    setState({ phase: "creating" });

    const created = await createSourceReturningId(formData);

    if (!created.ok) {
      setError(created.message);
      setState({ phase: "idle" });

      return;
    }

    if (!attachment) {
      router.push(`/sources/${created.id}`);

      return;
    }

    // 여기서부터는 자료가 이미 만들어져 있다.
    // 무엇이 실패하든 자료 상세로 옮기고, 거기서 다시 붙이게 한다.
    const goToSource = (message?: string) => {
      router.push(
        message
          ? `/sources/${created.id}?error=${encodeURIComponent(message)}`
          : `/sources/${created.id}`,
      );
    };

    if (attachment.kind === "picked") {
      setState({ phase: "verifying" });

      const attached = await attachPickedFile({
        sourceId: created.id,
        driveFileId: attachment.picked.driveFileId,
      });

      goToSource(attached.ok ? undefined : `자료는 저장했습니다. ${attached.message}`);

      return;
    }

    const file = attachment.file;

    setState({ phase: "preparing" });

    const started = await startFileUpload({
      sourceId: created.id,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });

    if (!started.ok) {
      goToSource(`자료는 저장했습니다. ${started.message}`);

      return;
    }

    setState({ phase: "sending", percent: 0 });

    const driveFileId = await sendFileToDrive(
      started.uploadUrl,
      file,
      (percent) => {
        setState({ phase: "sending", percent });
      },
    );

    if (!driveFileId) {
      goToSource(
        "자료는 저장했습니다. 파일을 보내지 못했으니 아래에서 다시 올려 주세요.",
      );

      return;
    }

    setState({ phase: "verifying" });

    const finished = await finishFileUpload({
      fileId: started.fileId,
      driveFileId,
    });

    goToSource(finished.ok ? undefined : `자료는 저장했습니다. ${finished.message}`);
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <SourceFields values={values} disabled={busy} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          파일
        </span>

        {driveConnected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {/*
                파일 입력란에는 name을 주지 않는다.
                name이 있으면 파일이 FormData에 담겨 서버로 전송되는데, 우리는
                파일이 서버를 거치지 않게 하려는 것이다. (설계 문서 10.3절)
                고른 파일은 name 대신 이 컴포넌트의 상태로 들고 있는다.
              */}
              <label
                className={`h-11 cursor-pointer rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors dark:border-white/[.145] dark:text-zinc-50 ${
                  busy
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                }`}
              >
                내 컴퓨터에서 고르기
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_UPLOAD_MIME_TYPES.join(",")}
                  disabled={busy}
                  onChange={(event) => {
                    handleFilePick(event.target.files?.[0] ?? null);
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => void handleDrivePick()}
                disabled={busy}
                className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Drive에서 고르기
              </button>

              {state.phase === "picking" ? (
                <span className="text-sm text-zinc-500">Drive를 여는 중…</span>
              ) : null}
            </div>

            {attachment ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-white/[.04]">
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-white/[.1] dark:text-zinc-300">
                  {attachment.kind === "upload" ? "올릴 파일" : "Drive 파일"}
                </span>
                <span className="max-w-xs truncate text-zinc-800 dark:text-zinc-200">
                  {attachment.kind === "upload"
                    ? attachment.file.name
                    : (attachment.picked.displayName ?? "고른 파일")}
                </span>
                <span className="text-zinc-500">
                  {attachmentSizeText(attachment)}
                </span>
                {!busy ? (
                  <button
                    type="button"
                    aria-label="고른 파일 빼기"
                    onClick={() => {
                      setAttachment(null);
                      clearFileInput();
                    }}
                    className="text-zinc-400 transition-colors hover:text-red-700 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs leading-5 text-zinc-500">
              선택 사항입니다. PDF와 이미지(PNG, JPEG, WebP)를 붙일 수 있습니다.
              내 컴퓨터에서 올리는 파일은 한 개당 {MAX_MEGABYTES}MB까지이고, 이미
              Drive에 있는 파일은 크기 제한이 없습니다. 파일은 ThreadMark가 아니라
              선생님의 Google Drive에 있습니다.
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
            파일을 함께 붙이려면 먼저 Google Drive를 연결해 주세요.{" "}
            <Link
              href="/settings/integrations"
              className="underline underline-offset-2"
            >
              연결 설정으로 가기
            </Link>
            . 연결하지 않아도 자료는 지금 등록할 수 있습니다.
          </p>
        )}
      </div>

      {state.phase === "sending" ? <ProgressBar percent={state.percent} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          등록
        </button>
        <Link
          href="/library"
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          취소
        </Link>

        {busy && state.phase !== "picking" ? (
          <span className="text-sm text-zinc-500">{progressText(state)}</span>
        ) : null}
      </div>
    </form>
  );
}

function attachmentSizeText(attachment: Attachment): string {
  if (attachment.kind === "upload") {
    return formatByteSize(attachment.file.size);
  }

  const size = attachment.picked.displaySize;

  return size === null ? "" : formatByteSize(size);
}

function progressText(state: SubmitState): string {
  switch (state.phase) {
    case "creating":
      return "자료를 저장하는 중…";
    case "preparing":
      return "업로드 자리를 잡는 중…";
    case "sending":
      return `파일을 보내는 중 ${state.percent}%`;
    case "verifying":
      return "Drive에서 확인하는 중…";
    case "picking":
    case "idle":
      return "";
  }
}
