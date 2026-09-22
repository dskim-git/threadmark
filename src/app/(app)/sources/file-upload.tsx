"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  formatByteSize,
} from "@/lib/drive/upload";

import { finishFileUpload, startFileUpload } from "./file-actions";

/**
 * 파일 하나를 Google Drive에 올린다.
 *
 * 파일 자체는 우리 서버를 거치지 않고 브라우저에서 Drive로 바로 간다.
 * 이 컴포넌트가 브라우저에서 도는 이유가 그것이다. (설계 문서 10.3절)
 *
 * 브라우저가 받는 것은 토큰이 아니라 "자리 주소"뿐이다. 그 주소는 이 파일
 * 하나에만 쓰이고 만료된다. 서버는 그 주소를 만들어주기만 하고, 다 올라간 뒤에
 * Drive에 직접 물어서 확인한다. 이 화면이 "다 됐다"고 말하는 것만으로는
 * 완료 처리되지 않는다.
 *
 * 진행률을 위해 fetch 대신 XMLHttpRequest를 쓴다.
 * fetch는 보내는 쪽 진행 상황을 알려주지 않는다. 100MB 파일을 올리는 동안
 * 아무 표시가 없으면 사용자는 멈춘 것으로 본다.
 */

type UploadState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "sending"; percent: number }
  | { phase: "verifying" };

const MAX_MEGABYTES = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * 파일을 자리 주소로 보낸다.
 *
 * 성공하면 Drive가 정한 파일 식별자를 돌려준다. 이 값은 서버로 보내지만,
 * 서버는 이것을 믿지 않고 이 식별자로 Drive에 다시 물어본다.
 */
function sendToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();

    request.open("PUT", uploadUrl, true);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      // 자리를 다 채우면 200 또는 201과 함께 파일 정보가 온다.
      if (request.status !== 200 && request.status !== 201) {
        resolve(null);

        return;
      }

      try {
        const body: unknown = JSON.parse(request.responseText);
        const id =
          typeof body === "object" && body !== null
            ? (body as { id?: unknown }).id
            : null;

        resolve(typeof id === "string" && id.length > 0 ? id : null);
      } catch {
        resolve(null);
      }
    };

    request.onerror = () => resolve(null);
    request.onabort = () => resolve(null);
    request.ontimeout = () => resolve(null);

    request.send(file);
  });
}

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
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `파일이 ${MAX_MEGABYTES}MB를 넘습니다. 지금 고른 파일은 ${formatByteSize(file.size)}입니다.`,
      );

      return;
    }

    if (file.size === 0) {
      setError("빈 파일은 올릴 수 없습니다.");

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

    const driveFileId = await sendToDrive(started.uploadUrl, file, (percent) => {
      setState({ phase: "sending", percent });
    });

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
          <span className="text-sm text-zinc-500">
            Drive에서 확인하는 중…
          </span>
        ) : null}

        {state.phase === "sending" ? (
          <span className="text-sm text-zinc-500">
            보내는 중 {state.percent}%
          </span>
        ) : null}
      </div>

      {state.phase === "sending" ? (
        <div
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="업로드 진행률"
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[.12]"
        >
          <div
            className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-100"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      ) : null}

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
