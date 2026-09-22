import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { shouldVerify } from "@/lib/drive/file-check";
import { formatByteSize } from "@/lib/drive/upload";
import { isReadable, listSourceFiles } from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";

import { FileStatusNotice } from "./file-status-notice";
import { ReaderView } from "./reader-view";

export const metadata: Metadata = {
  title: "읽기 · ThreadMark",
};

/**
 * PDF를 읽는 화면. (설계 문서 9.1절, 경로는 21절)
 *
 * 한 자료에 파일이 여럿일 수 있어서 `?file=`로 고른다.
 * 지정하지 않으면 읽을 수 있는 첫 파일을 연다.
 *
 * 13-A에서는 읽기만 한다. 텍스트를 골라 기록으로 남기는 것은 13-B다.
 */
export default async function ReaderPage({
  params,
  searchParams,
}: PageProps<"/sources/[id]/reader">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다. (보안 원칙 9)
  if (!source) {
    notFound();
  }

  const [files, query] = await Promise.all([
    listSourceFiles(source.id),
    searchParams,
  ]);

  const readable = files.filter(isReadable);
  const requested = firstValue(query.file);

  // 요청한 파일이 이 자료의 읽을 수 있는 파일 목록에 있을 때만 쓴다.
  // 목록에서 고르므로, 남의 파일 id를 넣어도 여기서 걸러진다.
  const selected =
    readable.find((file) => file.id === requested) ?? readable[0] ?? null;

  /*
    기록 목록에서 "17쪽으로"를 누르고 들어온 경우다. (설계 문서 9.3절)
    그 쪽에서 시작한다. 없으면 마지막으로 보던 자리에서 시작한다. (9.1절)

    주소로 들어온 값이라 범위를 확인한다. 문서 쪽수는 열어봐야 알 수 있어서
    상한은 뷰어가 열린 뒤에 다시 맞춘다.
  */
  const requestedPage = Number.parseInt(firstValue(query.page) ?? "", 10);
  const startPage =
    Number.isInteger(requestedPage) && requestedPage >= 1
      ? requestedPage
      : (selected?.lastPage ?? 1);

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

      {selected ? (
        <>
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
              {selected.fileName}
            </h1>
            <span className="text-xs text-zinc-500">
              {formatByteSize(selected.byteSize)}
            </span>
          </header>

          {/* 파일이 여럿이면 고를 수 있게 한다. */}
          {readable.length > 1 ? (
            <nav className="flex flex-wrap gap-2">
              {readable.map((file) => {
                const active = file.id === selected.id;

                return (
                  <Link
                    key={file.id}
                    href={`/sources/${source.id}/reader?file=${file.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`max-w-xs truncate rounded-full border px-3 py-1 text-sm transition-colors ${
                      active
                        ? "border-transparent bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                        : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                    }`}
                  >
                    {file.fileName}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          {/*
            파일이 그대로인지 확인하고 아니면 알린다. (설계 문서 9.2절, 10.4절)
            멀쩡할 때는 아무것도 보여주지 않는다.
          */}
          <FileStatusNotice
            key={`notice-${selected.id}`}
            fileId={selected.id}
            shouldVerify={shouldVerify(selected.lastVerifiedAt, new Date())}
            initialOutcome={
              selected.status === "missing" ? "missing" : "unchanged"
            }
            lastVerifiedAt={selected.lastVerifiedAt}
          />

          {selected.status === "missing" ? (
            <p className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
              Drive에 파일이 없어 열 수 없습니다. 이 자료에 남긴 기록은 그대로
              있습니다.
            </p>
          ) : (
            <ReaderView
              // 다른 파일을 고르면 뷰어를 새로 만든다.
              // 같은 컴포넌트를 재사용하면 앞 파일의 페이지 번호가 남는다.
              key={selected.id}
              sourceId={source.id}
              fileId={selected.id}
              fileChecksum={selected.checksum}
              initialPage={startPage}
              initialZoom={selected.lastZoom}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h1 className="text-base font-medium text-black dark:text-zinc-50">
            읽을 수 있는 파일이 없습니다
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {files.length > 0
              ? "이 자료에 붙은 파일 중 PDF가 없습니다. 지금은 PDF만 열어볼 수 있습니다."
              : "이 자료에 아직 파일이 붙어 있지 않습니다."}
          </p>
          <Link
            href={`/sources/${source.id}`}
            className="h-11 w-fit rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            자료로 돌아가기
          </Link>
        </div>
      )}
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
