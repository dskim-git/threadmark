import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CaptureList } from "@/app/(app)/captures/capture-list";
import { requireActiveAccount } from "@/lib/auth/account";
import { listCapturesForSource } from "@/lib/captures/queries";
import { getPaperAnalysis } from "@/lib/papers/analysis-queries";
import { listProjectChips, listProjectsForSource } from "@/lib/projects/queries";
import { shouldVerify } from "@/lib/drive/file-check";
import { formatByteSize } from "@/lib/drive/upload";
import { isReadable, listSourceFiles } from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";
import { isTranslationConfigured } from "@/lib/translation/anthropic";

import { FileStatusNotice } from "./file-status-notice";
import { ReaderView, type PanelTab } from "./reader-view";

export const metadata: Metadata = {
  title: "읽기 · ThreadMark",
};

/**
 * PDF를 읽는 화면. (설계 문서 9.1절, 경로는 21절)
 *
 * 한 자료에 파일이 여럿일 수 있어서 `?file=`로 고른다.
 * 지정하지 않으면 읽을 수 있는 첫 파일을 연다.
 *
 * 고른 문장을 기록으로 남기고(13-B) 옮기는 것(13-C)은 ReaderView가 맡는다.
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

  const isPaper = source.type === "paper";

  const [files, captures, analysis, projects, projectChips, query] =
    await Promise.all([
      listSourceFiles(source.id),
      listCapturesForSource(source.id),
      // 논문이 아닌 자료에는 분석 탭이 없다. 있을 수 없는 행을 찾지 않는다.
      isPaper ? getPaperAnalysis(source.id) : null,
      isPaper ? listProjectsForSource(source.id) : [],
      listProjectChips(),
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
    /*
      data-wide가 본문의 너비 제한을 푼다. (globals.css)
      앱의 기본 너비(896px)를 좌우로 나누면 PDF에 350px쯤밖에 남지 않는다.

      머리말도 한 줄로 줄인다. 작업대는 창 높이를 기준으로 크기를 잡는데,
      위에 줄이 늘수록 PDF가 그만큼 작아진다.
    */
    <div data-wide className="flex flex-col gap-3">
      {selected ? (
        <>
          {/*
            머리말을 한 줄로 모았다.

            예전에는 세 줄이었다. 제목 줄, 파일 고르는 줄, 파일 확인 줄이다.
            사용자가 "논문 화면의 세로가 작다"고 했고, 재어 보니 그 세 줄이
            100픽셀 가까이 먹고 있었다. 이 화면은 창 높이를 재서 남는 만큼을
            PDF에 주므로, 위에서 줄인 만큼이 그대로 읽는 자리가 된다.

            자료 제목과 파일 이름은 길다. 줄바꿈으로 흘려보내지 않고 잘라낸다.
            줄이 늘면 아래가 그만큼 줄어드는 화면이라, 길이를 예측할 수 있는
            편이 낫다. 전체 이름은 마우스를 올리면 보인다.
          */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Link
              href={`/sources/${source.id}`}
              title={source.title}
              className="max-w-[18rem] shrink truncate text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← {source.title}
            </Link>

            {readable.length > 1 ? (
              /* 파일이 여럿이면 고를 수 있게 한다. 이름은 여기에만 둔다. */
              <nav className="flex min-w-0 flex-wrap gap-1.5">
                {readable.map((file) => {
                  const active = file.id === selected.id;

                  return (
                    <Link
                      key={file.id}
                      href={`/sources/${source.id}/reader?file=${file.id}`}
                      aria-current={active ? "page" : undefined}
                      title={file.fileName}
                      className={`max-w-[16rem] truncate rounded-full border px-3 py-1 text-xs transition-colors ${
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
            ) : (
              /* 하나뿐이면 고를 것이 없다. 이름만 적는다. */
              <h1
                title={selected.fileName}
                className="max-w-[24rem] shrink truncate text-xs font-medium text-black dark:text-zinc-50"
              >
                {selected.fileName}
              </h1>
            )}

            <span className="ml-auto shrink-0 text-xs text-zinc-500">
              {formatByteSize(selected.byteSize)}
            </span>

            {/*
              파일이 그대로인지 확인하고 아니면 알린다. (설계 문서 9.2절, 10.4절)
              멀쩡할 때는 이 줄 안에 단추 하나로만 있고, 알릴 것이 있을 때만
              아래로 한 줄을 더 쓴다.
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
          </header>

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
              /*
                번역을 쓸 수 있는지는 서버만 안다. API 키가 있는지를
                브라우저에 내려보내지 않고, "쓸 수 있는가"만 내려보낸다.
              */
              translationEnabled={isTranslationConfigured()}
              /* 분석 화면에서 `논문을 옆에 두고 적기`로 건너올 때 쓴다. */
              initialTab={readPanelTab(firstValue(query.panel))}
              showAnalysis={isPaper}
              analysisInitial={analysis?.values ?? {}}
              analysisProjects={projects}
              /*
                기록 목록은 서버에서 그려 넘긴다. 삭제와 프로젝트 연결 같은
                Server Action을 품고 있어 브라우저 쪽에서 만들 수 없다.
              */
              capturesSlot={
                <CaptureList
                  captures={captures}
                  returnTo={`/sources/${source.id}/reader?file=${selected.id}`}
                  emptyText="아직 이 자료에 남긴 기록이 없습니다."
                  projects={projectChips}
                  fileChecksums={Object.fromEntries(
                    files.map((file) => [file.id, file.checksum]),
                  )}
                />
              }
            />
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <Link
            href={`/sources/${source.id}`}
            className="w-fit text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← {source.title}
          </Link>
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

/**
 * 어느 탭으로 열지. 모르는 값은 `메모`로 본다.
 *
 * 주소로 들어오는 값이라 확인한다. 기본이 `메모`인 이유는, 문장을 드래그해
 * 인용을 남기는 것이 이 화면에서 가장 잦은 일이기 때문이다.
 */
function readPanelTab(value: string | undefined): PanelTab {
  return value === "analysis" || value === "captures" ? value : "notes";
}
