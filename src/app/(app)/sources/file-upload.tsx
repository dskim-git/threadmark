"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { sendFileToDrive } from "@/lib/drive/send-to-drive";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  describeUnacceptableFile,
} from "@/lib/drive/upload";

import { finishFileUpload, startFileUpload } from "./file-actions";

/**
 * 이미 만들어진 자료에 파일 하나를 붙인다.
 *
 * 파일 자체는 우리 서버를 거치지 않고 브라우저에서 Drive로 바로 간다.
 * 이 컴포넌트가 브라우저에서 도는 이유가 그것이다. (설계 문서 10.3절)
 *
 * 브라우저가 받는 것은 토큰이 아니라 "자리 주소"뿐이다. 서버는 그 주소를
 * 만들어주기만 하고, 다 올라간 뒤에 Drive에 직접 물어서 확인한다.
 * 이 화면이 "다 됐다"고 말하는 것만으로는 완료 처리되지 않는다.
 *
 * 자료를 만들면서 함께 올리는 경로는 new-source-form.tsx에 있다.
 * 두 화면이 같은 순서를 밟으며, 공통 부분은 lib/drive에 두었다.
 */

type UploadState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "sending"; percent: number }
  | { phase: "verifying" };

const MAX_MEGABYTES = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

export function FileUpload({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);

  const busy = state.phase !== "idle";

  async function handleFile(file: File) {
    setError(null);

    // 서버도 같은 것을 확인한다. 여기서 먼저 보는 이유는, 올릴 수 없는 파일을
    // 고른 사용자가 왕복을 기다리지 않고 바로 알 수 있게 하기 위해서다.
    const unacceptable = describeUnacceptableFile(file);

    if (unacceptable) {
      setError(unacceptable);

      return;
    }

    setState({ phase: "preparing" });

    const started = await startFileUpload({
      sourceId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });

    if (!started.ok) {
      setError(started.message);
      setState({ phase: "idle" });

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
      setError(
        "파일을 보내지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
      );
      setState({ phase: "idle" });

      return;
    }

    setState({ phase: "verifying" });

    const finished = await finishFileUpload({
      fileId: started.fileId,
      driveFileId,
    });

    setState({ phase: "idle" });

    if (!finished.ok) {
      setError(finished.message);

      return;
    }

    // 같은 파일을 다시 고를 수 있게 입력란을 비운다.
    // 비우지 않으면 브라우저가 "값이 그대로"라며 change를 알리지 않는다.
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`h-11 cursor-pointer rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors dark:border-white/[.145] dark:text-zinc-50 ${
            busy
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          }`}
        >
          파일 올리기
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={ALLOWED_UPLOAD_MIME_TYPES.join(",")}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void handleFile(file);
              }
            }}
          />
        </label>

        {state.phase === "preparing" ? (
          <span className="text-sm text-zinc-500">자리를 잡는 중…</span>
        ) : null}

        {state.phase === "verifying" ? (
          <span className="text-sm text-zinc-500">Drive에서 확인하는 중…</span>
        ) : null}

        {state.phase === "sending" ? (
          <span className="text-sm text-zinc-500">
            보내는 중 {state.percent}%
          </span>
        ) : null}
      </div>

      {state.phase === "sending" ? <ProgressBar percent={state.percent} /> : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        PDF와 이미지(PNG, JPEG, WebP)를 한 개당 {MAX_MEGABYTES}MB까지 올릴 수
        있습니다. 파일은 ThreadMark가 아니라 선생님의 Google Drive에 저장됩니다.
      </p>
    </div>
  );
}

/** 자료 등록 화면과 같은 모양을 쓰려고 따로 두었다. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="업로드 진행률"
      className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[.12]"
    >
      <div
        className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-100"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
