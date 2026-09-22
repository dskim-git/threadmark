"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { openDrivePicker } from "@/lib/drive/open-picker";
import { PICKER_MIME_TYPES } from "@/lib/drive/upload";

import { attachPickedFile, createPickerSession } from "./file-actions";

/**
 * 이미 Drive에 있는 파일을 골라 자료에 붙인다. (설계 문서 10.2절)
 *
 * 눌렀을 때만 토큰을 받아온다. 화면을 열 때가 아니다.
 * 받은 토큰은 이 함수 안에만 있다가 사라진다. 상태에도 담지 않는다.
 * 상태에 담으면 React가 들고 있게 되고, 화면이 남아 있는 동안 계속 살아 있다.
 */

type PickerState = "idle" | "opening" | "attaching";

export function DrivePickerButton({
  sourceId,
  onAttached,
  label = "Drive에서 고르기",
}: {
  sourceId: string;
  /** 붙인 뒤에 할 일. 넘기지 않으면 화면을 새로 고친다. */
  onAttached?: (fileName: string) => void;
  label?: string;
}) {
  const router = useRouter();

  const [state, setState] = useState<PickerState>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = state !== "idle";

  async function handleClick() {
    setError(null);
    setState("opening");

    const session = await createPickerSession();

    if (!session.ok) {
      setError(session.message);
      setState("idle");

      return;
    }

    let picked: { driveFileId: string } | null;

    try {
      picked = await openDrivePicker({
        accessToken: session.accessToken,
        apiKey: session.apiKey,
        appId: session.appId,
        mimeTypes: PICKER_MIME_TYPES,
      });
    } catch {
      // Google 스크립트를 불러오지 못한 경우다. 내부 사정을 그대로 보여주지 않는다.
      setError(
        "Drive 파일 목록을 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setState("idle");

      return;
    }

    // 사용자가 취소했다. 아무 일도 없었던 것으로 둔다.
    if (!picked) {
      setState("idle");

      return;
    }

    setState("attaching");

    const attached = await attachPickedFile({
      sourceId,
      driveFileId: picked.driveFileId,
    });

    setState("idle");

    if (!attached.ok) {
      setError(attached.message);

      return;
    }

    if (onAttached) {
      onAttached(attached.fileName);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={busy}
          className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {label}
        </button>

        {state === "opening" ? (
          <span className="text-sm text-zinc-500">Drive를 여는 중…</span>
        ) : null}

        {state === "attaching" ? (
          <span className="text-sm text-zinc-500">확인하고 붙이는 중…</span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
