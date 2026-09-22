"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { describeFileCheck, type FileCheck } from "@/lib/drive/file-check";

import { verifySourceFile } from "../../file-actions";

/** 지금 열어볼 수 없는 상태인가. 휴지통에 있는 것도 못 쓰는 것은 같다. */
function isUnusable(outcome: FileCheck["outcome"]): boolean {
  return outcome === "missing" || outcome === "trashed";
}

/**
 * 파일이 그대로인지 확인하고, 아니면 알린다. (설계 문서 9.2절, 10.4절)
 *
 * 화면이 뜨고 나서 확인한다. 서버에서 먼저 물어보면 PDF가 뜨는 것까지 그만큼
 * 늦어진다. 파일이 바뀐 것을 1초 늦게 아는 것보다, 읽기 시작이 1초 늦는 쪽이
 * 더 거슬린다.
 *
 * 자동 확인은 자주 하지 않는다. (VERIFY_INTERVAL_MINUTES)
 * 그래서 **직접 확인하는 버튼을 늘 둔다.** 처음에는 문제가 있을 때만 버튼을
 * 보여줬는데, 그러면 "멀쩡해 보이는데 방금 Drive에서 지웠다" 같은 경우에
 * 확인할 길이 없었다. 확인하는 수단은 결과와 무관하게 있어야 한다.
 *
 * 결과도 보여준다. 눌렀는데 아무 일도 안 일어나면 눌린 것인지조차 알 수 없다.
 */
export function FileStatusNotice({
  fileId,
  shouldVerify,
  initialOutcome,
  lastVerifiedAt,
}: {
  fileId: string;
  /** 서버가 "지금 물어볼 때가 되었다"고 판단했는가. */
  shouldVerify: boolean;
  /**
   * 물어보기 전에 이미 알고 있는 것.
   *
   * 표에 적힌 상태가 missing이면 화면을 여는 순간부터 알린다.
   * 확인이 끝날 때까지 아무 말 없이 두면, 열리지 않는 이유를 모른 채 기다린다.
   */
  initialOutcome: FileCheck["outcome"];
  lastVerifiedAt: string | null;
}) {
  const router = useRouter();

  const [outcome, setOutcome] = useState<FileCheck["outcome"]>(initialOutcome);
  const [busy, setBusy] = useState(false);
  /** 직접 눌러 확인했고 결과가 "그대로"였는가. 눌린 것을 알려주려고 둔다. */
  const [confirmedFine, setConfirmedFine] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setConfirmedFine(false);

    const result = await verifySourceFile(fileId);

    setBusy(false);

    if (!result.ok) {
      return;
    }

    setOutcome(result.outcome);
    setConfirmedFine(result.outcome === "unchanged");

    /*
      쓸 수 있는지 여부가 바뀌었으면 화면을 새로 받는다.

      두 방향 모두 필요하다.
        쓸 수 있었는데 → 못 쓰게 됨   뷰어를 닫아야 한다
        못 썼는데      → 쓸 수 있게 됨 뷰어를 열어야 한다
    */
    if (isUnusable(result.outcome) !== isUnusable(initialOutcome)) {
      router.refresh();
    }
  }

  useEffect(() => {
    if (!shouldVerify) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await verifySourceFile(fileId);

      if (cancelled || !result.ok) {
        return;
      }

      setOutcome(result.outcome);

      if (isUnusable(result.outcome) !== isUnusable(initialOutcome)) {
        router.refresh();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, shouldVerify, initialOutcome, router]);

  const message = describeFileCheck(outcome);
  const gone = isUnusable(outcome);

  return (
    <div className="flex flex-col gap-2">
      {message ? (
        <div
          role="status"
          className={
            gone
              ? "flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              : "flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          }
        >
          <p>{message}</p>

          {gone ? (
            <p className="text-xs leading-5">
              휴지통에서 복원했거나 파일을 되살렸다면 아래 `파일 확인`을 눌러
              주세요. 다른 파일로 바꾸려면 자료 화면에서 새로 올리거나
              Drive에서 고르면 됩니다. 그대로 두셔도 자료와 기록은 사라지지
              않습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        확인하는 수단은 결과와 무관하게 늘 있어야 한다.
        문제가 있을 때만 버튼을 두면, 방금 Drive에서 지운 경우처럼
        "아직 멀쩡해 보이는" 상태에서 확인할 길이 없다.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy}
          className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {busy ? "확인하는 중…" : "파일 확인"}
        </button>

        {confirmedFine ? (
          <span className="text-xs text-zinc-500">
            Drive의 파일이 그대로입니다.
          </span>
        ) : (
          <span className="text-xs text-zinc-500">
            {lastVerifiedAt
              ? `마지막 확인 ${formatDateTime(lastVerifiedAt)}`
              : "아직 확인한 적이 없습니다."}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
