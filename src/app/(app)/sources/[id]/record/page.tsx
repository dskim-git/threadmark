import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import { getSourceById } from "@/lib/sources/queries";

import { Recorder } from "./recorder";

export const metadata: Metadata = {
  title: "녹음",
};

/**
 * 브라우저로 녹음하는 화면. (설계 문서 17절, 17-V 3차례, 2026-10-04)
 *
 * > 브라우저 MediaRecorder 기반 녹음을 지원한다.
 * > 파일은 사용자의 Google Drive에 저장한다.
 *
 * 왜 자료에 붙는가
 *   그림판과 같은 자리다. 녹음한 것이 **파일로 Drive에 담기고**, 파일은
 *   자료에 붙는다. 자료 없이 녹음하는 길을 따로 두면 담긴 것을 둘 자리가
 *   없다.
 *
 *   `audio` 유형으로 자료를 만들면 그 자료가 녹음이 된다. 다른 유형에서도
 *   열린다. 논문을 읽다가 떠오른 말을 남기는 일이 있고, 그때 자료를 새로
 *   만들게 하면 손이 늘어난다.
 *
 * 들을 수 있어야 확인이 된다
 *   2차례(올리고 듣기)를 먼저 만든 까닭이다. 녹음만 되고 들을 길이 없으면
 *   **16-3에서 겪은 자리**가 된다. 그림판은 그리는 것은 확인했는데 담긴
 *   것을 확인하지 못했다.
 */
export default async function RecordPage({
  params,
}: PageProps<"/sources/[id]/record">) {
  const account = await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다. (보안 원칙 9)
  if (!source) {
    notFound();
  }

  const driveConnection = await getDriveConnectionSummary(account.userId);

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm">
        <Link
          href={`/sources/${source.id}`}
          className="text-zinc-600 underline underline-offset-2 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {source.title}
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
          녹음
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          녹음한 것은 이 자료에 파일로 붙습니다. 저장한 뒤 `열기`로 들으면서
          메모할 수 있습니다.
        </p>
      </header>

      {/*
        **Drive가 연결되어 있지 않으면 녹음기를 띄우지 않는다.**

        그림판과 같은 판단이고 **녹음은 더 무겁다.** 말해 놓고 저장을 눌렀을
        때 "연결되지 않았습니다"가 뜨면, 연결하러 나갔다 오는 동안 녹음한
        것을 잃는다. 그림은 다시 그릴 수 있지만 **한 번 한 말은 다시 할 수
        없다.** 수업이나 면담이면 그 자리가 끝나 있다.

        자료 화면의 `파일` 칸과 같은 말을 쓴다. 같은 일을 가리키는 안내가
        화면마다 다르면 읽는 사람이 둘을 다른 것으로 여긴다.
      */}
      {driveConnection?.status === "connected" ? (
        <Recorder sourceId={source.id} />
      ) : (
        <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
          {driveConnection
            ? "Google Drive 연결을 다시 확인해야 녹음을 저장할 수 있습니다. "
            : "녹음한 것을 보관하려면 먼저 Google Drive를 연결해 주세요. "}
          <Link
            href="/settings/integrations"
            className="underline underline-offset-2"
          >
            연결 설정으로 가기
          </Link>
        </p>
      )}
    </div>
  );
}
