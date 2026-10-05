import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CaptureList } from "@/app/(app)/captures/capture-list";
import { parseAudioTimeParam } from "@/lib/captures/audio-locator";
import { parseRegionParam } from "@/lib/captures/image-locator";
import { StarFilter } from "@/app/(app)/star-filter";
import { requireActiveAccount } from "@/lib/auth/account";
import {
  countCaptureStars,
  listCapturesForSource,
} from "@/lib/captures/queries";
import { getPaperAnalysis } from "@/lib/papers/analysis-queries";
import {
  listProjectChips,
  listProjectsForCaptures,
  listProjectsForSource,
} from "@/lib/projects/queries";
import { shouldVerify } from "@/lib/drive/file-check";
import { formatByteSize } from "@/lib/drive/upload";
import {
  isAudioFile,
  isImageFile,
  isReadable,
  listSourceFiles,
} from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";
import { STARRED_ON, STARRED_PARAM, readStarredOnly } from "@/lib/stars";
import { listTags, listTagsForCaptures } from "@/lib/tags/queries";
import { isTranslationConfigured } from "@/lib/translation/anthropic";

import { AudioReaderView } from "./audio-reader-view";
import { FileStatusNotice } from "./file-status-notice";
import { ImageReaderView } from "./image-reader-view";
import { ReaderView, type PanelTab } from "./reader-view";

export const metadata: Metadata = {
  title: "읽기",
};

/**
 * 자료를 읽는 화면. (설계 문서 9.1절·16절, 경로는 21절)
 *
 * 한 자료에 파일이 여럿일 수 있어서 `?file=`로 고른다.
 * 지정하지 않으면 읽을 수 있는 첫 파일을 연다.
 *
 * **PDF와 그림이 갈린다.** (2026-10-04)
 *
 *   PDF   파일 하나에 쪽이 여럿이다. 파일을 고르고 그 안에서 쪽을 넘긴다.
 *   그림  파일 하나가 곧 한 장이다. **붙은 그림을 한 묶음으로 보고 장을
 *         넘긴다.** `?file=`은 처음 열 장을 가리킨다.
 *
 * 그래서 고른 파일이 그림이면 그림 묶음을 통째로 넘긴다. 섞여 붙어 있으면
 * 둘 다 쓸 수 있다. 위의 파일 고르는 줄에서 PDF를 누르면 PDF 작업대가,
 * 그림을 누르면 그림 작업대가 열린다.
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

  /*
    주소를 먼저 읽는다. 기록 탭을 별로 거를지가 여기서 정해지고,
    그 값이 있어야 기록 조회를 시작할 수 있다. (설계 문서 6.2-1절)
  */
  const query = await searchParams;
  const starredOnly = readStarredOnly(firstValue(query[STARRED_PARAM]));

  const [
    files,
    captures,
    captureCounts,
    analysis,
    projects,
    projectChips,
    allTags,
  ] = await Promise.all([
    listSourceFiles(source.id),
    listCapturesForSource(source.id, starredOnly),
    countCaptureStars(source.id),
    // 논문이 아닌 자료에는 분석 탭이 없다. 있을 수 없는 행을 찾지 않는다.
    isPaper ? getPaperAnalysis(source.id) : null,
    isPaper ? listProjectsForSource(source.id) : [],
    listProjectChips(),
    listTags(),
  ]);

  /*
    읽는 중에도 태그를 달 수 있게 한다. (설계 문서 20-1절)

    방금 남긴 인용에 "이건 수업 준비용"을 붙이는 일은 읽는 흐름 안에서
    일어난다. 여기서 못 달면 나중에 자료 화면으로 돌아가 다시 찾아야 하고,
    그러면 대개 달지 않게 된다.
  */
  const [captureTags, captureProjects] = await Promise.all([
    listTagsForCaptures(captures.map((capture) => capture.id)),
    listProjectsForCaptures(captures.map((capture) => capture.id)),
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

  /*
    그림은 **붙은 것 전부가 한 묶음**이다. (설계 문서 16절)

    PDF는 고른 파일 하나만 넘기면 되는데, 그림은 장을 넘겨야 해서 묶음을
    통째로 넘긴다. `selected`는 그중 **처음 열 장**을 가리킨다.

    차례는 `listSourceFiles`가 정한 대로(올린 순서) 둔다. 그 차례가 곧
    `1장`, `2장`이 되므로 **여기서 다시 정렬하지 않는다.** 두 곳에서 정렬하면
    기록에 적힌 장 번호와 화면의 번호가 어긋난다.
  */
  const imageFiles = readable.filter(isImageFile);
  const showImages = selected !== null && isImageFile(selected);
  const imageIndex = showImages
    ? Math.max(
        0,
        imageFiles.findIndex((file) => file.id === selected.id),
      )
    : 0;

  /*
    음성은 **고른 파일 하나**다. (17-V 2차례)

    그림처럼 묶지 않는다. 그림을 묶은 까닭은 "파일 하나가 곧 한 장"이라
    장을 넘겨야 하기 때문인데, 녹음은 **한 파일이 곧 하나의 이야기**다.
    둘을 이어 틀어줄 이유가 없고, 이어 틀면 지금 어느 파일을 듣고 있는지를
    또 관리해야 한다.
  */
  const showAudio = selected !== null && isAudioFile(selected);

  return (
    /*
      data-wide가 본문의 너비 제한을 푼다. (globals.css)
      앱의 기본 너비(896px)를 좌우로 나누면 PDF에 350px쯤밖에 남지 않는다.

      머리말도 한 줄로 줄인다. 작업대는 창 높이를 기준으로 크기를 잡는데,
      위에 줄이 늘수록 PDF가 그만큼 작아진다.

      **음성에는 붙이지 않는다.** (2026-10-04, 사용자가 찾음)

      `data-wide`는 넓게 쓰는 일만 하지 않는다. globals.css가 그 표시를
      보고 **넓은 화면에서 `body`의 스크롤을 잠근다.** PDF와 그림은 안쪽
      두 칸이 각자 스크롤해서 괜찮지만, **음성 화면은 위에서 아래로 쌓이는
      보통 화면이다.** 잠그면 재생기 아래의 메모와 기록 목록에 닿을 수
      없다.

      오류가 나지 않는 고장이다. 화면은 멀쩡히 그려지고 아래쪽이 그냥
      없는 것처럼 보인다. **좁은 화면에서는 그 잠금이 걸리지 않아** 거기서
      눌러봤다면 찾지 못했다.

      그래서 `showAudio`일 때만 뺀다. `false`를 넣으면 안 된다.
      `data-wide="false"`도 `[data-wide]`에 걸린다. 값이 아니라 **칸 자체가
      없어야** 한다.
    */
    <div data-wide={showAudio ? undefined : true} className="flex flex-col gap-3">
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

          {/*
            그림은 사라진 장이 있어도 작업대를 연다. **다른 장은 멀쩡하다.**
            PDF는 파일 하나가 통째로 안 열리는 것이라 그 자리에서 멈춘다.
          */}
          {selected.status === "missing" && !showImages ? (
            <p className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
              Drive에 파일이 없어 열 수 없습니다. 이 자료에 남긴 기록은 그대로
              있습니다.
            </p>
          ) : showAudio ? (
            /*
              음성은 들으면서 그 자리에 메모한다. (17-4절, 사용자 요청)

              **2차례에서는 메모 칸에 `CaptureForm`을 썼다.** 자리를 가리키는
              길이 없어 자료에 그냥 붙이는 메모였다. 4차례에서 `locator`를
              정하면서 **PDF·그림이 쓰는 `PageMemoPanel`로 바꿨다.** 세 화면이
              같은 칸을 쓰고 자리를 부르는 말만 다르다.
            */
            <AudioReaderView
              key={selected.id}
              sourceId={source.id}
              fileId={selected.id}
              fileChecksum={selected.checksum}
              src={`/api/source-files/${selected.id}/content`}
              /*
                기록을 눌러 들어왔을 때 갈 자리. **모양이 어긋나면 null이다.**
                주소는 사람이 손으로 고칠 수 있는 자리다. (16-2와 같은 생각)
              */
              initial={parseAudioTimeParam(firstValue(query.t))}
              capturesSlot={
                <div className="flex flex-col gap-3">
                  <StarFilter
                    allHref={readerHref(source.id, selected.id, startPage, false)}
                    starredHref={readerHref(source.id, selected.id, startPage, true)}
                    total={captureCounts.total}
                    starred={captureCounts.starred}
                    starredOnly={starredOnly}
                  />

                  <CaptureList
                    captures={captures}
                    returnTo={readerHref(
                      source.id,
                      selected.id,
                      startPage,
                      starredOnly,
                    )}
                    emptyText={
                      starredOnly
                        ? "별을 단 기록이 없습니다."
                        : "아직 이 자료에 남긴 기록이 없습니다."
                    }
                    projects={projectChips}
                    captureTags={captureTags}
                    captureProjects={captureProjects}
                    allTags={allTags}
                    fileChecksums={Object.fromEntries(
                      files.map((file) => [file.id, file.checksum]),
                    )}
                  />
                </div>
              }
            />
          ) : showImages ? (
            <ImageReaderView
              key={selected.id}
              sourceId={source.id}
              images={imageFiles.map((file) => ({
                id: file.id,
                fileName: file.fileName,
                /*
                  Drive에서 흘러나오는 주소. **공개 링크가 아니다.**
                  이 경로가 세션을 보고 본인 것만 내보낸다. (설계 문서 2.3절)
                */
                src: `/api/source-files/${file.id}/content`,
                missing: file.status === "missing",
              }))}
              initialIndex={imageIndex}
              checksums={Object.fromEntries(
                imageFiles.map((file) => [file.id, file.checksum]),
              )}
              /*
                기록을 눌러 들어왔을 때 보여줄 상자. (16-2)

                **모양이 어긋나면 `null`이다.** 주소는 사람이 손으로 고칠
                수 있는 자리라, 잘못된 값으로 상자를 그리면 엉뚱한 곳을
                가리키면서 그것이 틀렸다는 것을 알릴 길이 없다.
              */
              highlight={parseRegionParam(firstValue(query.region))}
              capturesSlot={
                <div className="flex flex-col gap-3">
                  <StarFilter
                    allHref={readerHref(source.id, selected.id, startPage, false)}
                    starredHref={readerHref(source.id, selected.id, startPage, true)}
                    total={captureCounts.total}
                    starred={captureCounts.starred}
                    starredOnly={starredOnly}
                  />

                  <CaptureList
                    captures={captures}
                    returnTo={readerHref(
                      source.id,
                      selected.id,
                      startPage,
                      starredOnly,
                    )}
                    emptyText={
                      starredOnly
                        ? "별을 단 기록이 없습니다."
                        : "아직 이 자료에 남긴 기록이 없습니다."
                    }
                    projects={projectChips}
                    captureTags={captureTags}
                    captureProjects={captureProjects}
                    allTags={allTags}
                    fileChecksums={Object.fromEntries(
                      files.map((file) => [file.id, file.checksum]),
                    )}
                    /*
                      몇 번째 장인지는 담겨 있지 않다. 이 차례로 센다.
                      넘기지 않으면 `2장으로` 단추가 그려지지 않는다.
                    */
                    imageFileIds={imageFiles.map((file) => file.id)}
                  />
                </div>
              }
            />
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
                <div className="flex flex-col gap-3">
                  {/*
                    별로 거르는 줄. (설계 문서 6.2-1절)

                    주소에 담는다. 이 화면에서 주소가 바뀌어도 PDF는 다시
                    열리지 않는다. 뷰어를 품은 ReaderView의 key가 그대로라
                    React가 같은 것으로 보고, 바뀌는 것은 서버가 그려 보낸
                    이 목록뿐이다. 기록을 저장한 뒤 화면을 새로 받아오는
                    길(router.refresh)이 이미 같은 방식으로 돈다.

                    `file`과 `page`를 함께 들고 간다. 빠뜨리면 별을 거르는
                    순간 읽던 파일과 쪽이 처음으로 돌아간다.
                  */}
                  <StarFilter
                    allHref={readerHref(source.id, selected.id, startPage, false)}
                    starredHref={readerHref(source.id, selected.id, startPage, true)}
                    total={captureCounts.total}
                    starred={captureCounts.starred}
                    starredOnly={starredOnly}
                  />

                  <CaptureList
                    captures={captures}
                    returnTo={readerHref(
                      source.id,
                      selected.id,
                      startPage,
                      starredOnly,
                    )}
                    emptyText={
                      starredOnly
                        ? "별을 단 기록이 없습니다."
                        : "아직 이 자료에 남긴 기록이 없습니다."
                    }
                    projects={projectChips}
                    captureTags={captureTags}
                    captureProjects={captureProjects}
                    allTags={allTags}
                    fileChecksums={Object.fromEntries(
                      files.map((file) => [file.id, file.checksum]),
                    )}
                  />
                </div>
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
              ? "이 자료에 붙은 파일 중 열어볼 수 있는 것이 없습니다. 지금은 PDF와 그림(PNG·JPEG·WebP)을 열 수 있습니다."
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

/**
 * 이 화면의 주소. 읽던 파일과 쪽, 그리고 기록 탭을 그대로 들고 간다.
 *
 * `panel=captures`를 함께 넣는다. 별을 거르고 돌아왔는데 다른 탭이 열려
 * 있으면, 방금 무엇을 눌렀는지 알 수 없게 된다.
 */
function readerHref(
  sourceId: string,
  fileId: string,
  page: number,
  starredOnly: boolean,
): string {
  const query = new URLSearchParams({
    file: fileId,
    page: String(page),
    panel: "captures",
  });

  if (starredOnly) {
    query.set(STARRED_PARAM, STARRED_ON);
  }

  return `/sources/${sourceId}/reader?${query.toString()}`;
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
