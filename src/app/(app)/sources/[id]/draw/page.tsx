import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import { isStrokeFileName } from "@/lib/drawing/scene";
import { listSourceFiles } from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";

import { DrawingWorkbench } from "./drawing-workbench";

export const metadata: Metadata = {
  title: "그림판",
};

/**
 * 그림판. (설계 문서 16절 `그림판`, 16-3)
 *
 * > 독립 캔버스와 자료 위 필기 모드를 제공한다.
 *
 * **지금은 독립 캔버스다.** 자료 위에 겹쳐 그리는 길은 아직 없다.
 * (`drawing-canvas.tsx`의 `아직 안 한 것`에 까닭을 적었다)
 *
 * 왜 자료에 붙는가
 *   그린 것이 **파일로 Drive에 담기고**, 파일은 자료에 붙는다. 그래서
 *   그림판도 자료 아래에 있다. 자료 없이 그리는 길을 따로 두면 그린 것을
 *   둘 자리가 없다.
 *
 *   `drawing` 유형으로 자료를 만들면 그 자료가 그림 묶음이 된다. 다른
 *   유형에서도 열린다. 수업 준비 중에 도형 하나를 그려 붙이는 일이 있고,
 *   그때 자료를 새로 만들게 하면 손이 늘어난다.
 *
 * 고치러 들어오는 길
 *   `?file=<획 파일 번호>`로 들어오면 그 획을 받아 캔버스에 올린다.
 *   **보이는 PNG가 아니라 획 파일을 가리킨다.** PNG에는 점이 없다.
 *   자료 화면의 파일 목록이 그 링크를 만든다.
 */
export default async function DrawPage({
  params,
  searchParams,
}: PageProps<"/sources/[id]/draw">) {
  const account = await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다. (보안 원칙 9)
  if (!source) {
    notFound();
  }

  const [files, driveConnection, query] = await Promise.all([
    listSourceFiles(id),
    getDriveConnectionSummary(account.userId),
    searchParams,
  ]);

  const requested = firstValue(query.file);

  /*
    고치러 들어왔는가.

    **획 파일이어야 한다.** PNG 번호로 들어오면 점이 없으므로 아무것도
    올릴 수 없다. 그때는 새로 그리는 것으로 다룬다. **둘러대지 않는다.**
  */
  const editingFile =
    requested === null
      ? null
      : (files.find(
          (file) =>
            file.id === requested &&
            file.status === "ready" &&
            isStrokeFileName(file.fileName),
        ) ?? null);

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm">
        <Link
          href={`/sources/${source.id}`}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {source.title}
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {editingFile ? "그림 고치기" : "그림판"}
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {editingFile
            ? "담긴 획을 올려 이어 그립니다. 저장하면 새 파일로 쌓입니다."
            : "그린 것은 이 자료에 파일로 붙습니다. 보이는 그림과 다시 고칠 수 있는 자료가 함께 저장됩니다."}
        </p>
      </header>

      {/*
        **Drive가 연결되어 있지 않으면 캔버스를 띄우지 않는다.**

        그려 놓고 저장을 눌렀을 때 "연결되지 않았습니다"가 뜨면, 연결하러
        나갔다 오는 동안 **그린 것을 잃는다.** 아직 자동 저장이 없어서
        돌아와도 빈 캔버스다.

        자료 화면의 `파일` 칸과 같은 말을 쓴다. 같은 일을 가리키는 안내가
        화면마다 다르면 읽는 사람이 둘을 다른 것으로 여긴다.
      */}
      {driveConnection?.status === "connected" ? (
        <DrawingWorkbench
          sourceId={source.id}
          sourceTitle={source.title}
          editing={
            editingFile
              ? {
                  fileId: editingFile.id,
                  baseName: baseNameOf(editingFile.fileName),
                }
              : null
          }
        />
      ) : (
        <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
          {driveConnection
            ? "Google Drive 연결을 다시 확인해야 그림을 저장할 수 있습니다. "
            : "그린 것을 보관하려면 먼저 Google Drive를 연결해 주세요. "}
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

/** 주소에 같은 이름이 여러 번 올 수 있다. 첫 값만 쓴다. */
function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/** 획 파일 이름에서 그림 이름을. `수업.strokes.json` → `수업` */
function baseNameOf(fileName: string): string {
  return fileName.replace(/\.strokes\.json$/, "");
}
