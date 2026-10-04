import Link from "next/link";

import { linkCaptureToProject } from "@/app/(app)/projects/actions";
import { Reveal } from "@/app/(app)/panel";
import { NodePicker } from "@/app/(app)/projects/node-picker";
import { PlacedWhere } from "@/app/(app)/projects/placed-where";
import type { Capture } from "@/lib/captures/queries";
import {
  describeAudioTime,
  formatAudioTimeParam,
} from "@/lib/captures/audio-locator";
import { describeMediaTime } from "@/lib/captures/media-locator";
import { describeMusicTime } from "@/lib/captures/music-locator";
import { VideoTimeChip } from "./video-time-chip";
import {
  IMAGE_REGION_KIND,
  describeImageLocator,
  formatRegionParam,
} from "@/lib/captures/image-locator";
import { describeLocatorPages } from "@/lib/captures/pdf-locator";
import { locatorIsStale } from "@/lib/drive/file-check";
import {
  getCaptureTypeLabel,
  getVerificationLabel,
} from "@/lib/captures/types";
import {
  getTranslationLanguageLabel,
  isTranslationLanguage,
} from "@/lib/translation/types";
import type { ProjectChip } from "@/lib/projects/queries";

import type { Tag } from "@/lib/tags/queries";

import {
  CaptureEditButton,
  CaptureEditing,
  WhenEditing,
  WhenReading,
} from "./capture-editing";

import { StarButton } from "../star-button";
import { TagEditor } from "../tag-editor";
import { deleteCapture, toggleCaptureStar } from "./actions";

/**
 * 기록 목록.
 *
 * 설계 문서 2.4절의 구분을 화면에서도 유지한다.
 * 원문은 인용 표시와 함께 다른 배경에 놓고, 옮긴 글에는 기계 번역임을 밝히고,
 * 내가 쓴 내용은 일반 본문으로 보여준다.
 *
 * 세 가지가 같은 모양으로 나란히 놓이면, 나중에 이 기록을 다시 읽을 때
 * 어디까지가 원문이고 어디부터가 내 생각인지 구분할 수 없다.
 *
 * **읽는 모양과 고치는 모양을 가른다.** (2026-10-04, 사용자가 쓰다가 말함)
 *
 *   읽을 때   갈래·쪽·날짜 · 원문 · 내 메모 · 달린 태그 · 이어진 프로젝트
 *   고칠 때   위의 것 + 태그 칸 · 수정 · 삭제 · 자리에 놓기 · 프로젝트에 잇기
 *
 * 그전까지는 고치는 도구가 **늘 펼쳐져 있었다.** 기록 셋만 있어도 화면이
 * 도구로 뒤덮여 "한눈에 들어오지 않고 산만하다"는 말을 들었다.
 *
 * 도구는 하나씩 늘었다. 태그, 자리에 놓기, 프로젝트에 잇기. 더할 때마다
 * "하나쯤이야"였고 **다 모이고 나서야 보였다.** 한 번에 하나씩 더하는
 * 자리에서는 더한 뒤의 전체를 보기 어렵다.
 *
 * **이 칸 하나가 기록·자료·읽기 세 화면을 모두 그린다.** 그래서 여기만
 * 고치면 전체에 걸린다. 화면마다 따로 그렸다면 한 곳을 빠뜨렸을 것이다.
 */
export function CaptureList({
  captures,
  returnTo,
  emptyText,
  projects = [],
  fileChecksums,
  imageFileIds,
  captureTags,
  captureProjects,
  allTags,
  videoSeekable = false,
}: {
  captures: Capture[];
  returnTo: string;
  emptyText: string;
  /**
   * 이 자료에 붙은 파일의 지금 checksum. 파일 id로 찾는다.
   *
   * 기록에 적힌 checksum과 견주어 "이 기록의 위치가 달라졌을 수 있다"를
   * 가린다. (설계 문서 9.2절) 넘기지 않으면 그 표시를 하지 않는다.
   */
  fileChecksums?: Record<string, string | null>;
  /**
   * 이 자료에 붙은 그림 파일의 번호를 **보이는 차례대로.**
   * (설계 문서 16절, 2026-10-04)
   *
   * 그림 기록은 **몇 번째 장인지를 담아두지 않는다.** 파일을 떼거나 더하면
   * 번호가 밀리기 때문이다. 그래서 보여줄 때 이 목록에서 센다.
   *
   * 넘기지 않으면 `2장으로` 단추를 그리지 않는다. 셀 수 없으면 **엉뚱한
   * 장으로 보내느니 아무 데도 보내지 않는 편이 낫다.**
   */
  imageFileIds?: readonly string[];
  /** 비어 있지 않으면 기록마다 프로젝트 연결 선택을 보여준다. */
  projects?: ProjectChip[];
  /**
   * 기록마다 달린 태그. 기록 id로 찾는다. (설계 문서 20-1절)
   *
   * 넘기지 않으면 태그 칸을 그리지 않는다. 읽기 화면처럼 자리가 좁은 곳에서
   * 빼기 위해서다. 넘기려면 allTags도 함께 넘겨야 쓰던 태그를 눌러서 달 수 있다.
   */
  captureTags?: Record<string, Tag[]>;
  /**
   * 기록마다 이어진 프로젝트. 기록 번호로 찾는다. (2026-10-04)
   *
   * **읽는 상태에서 보여준다.** 고치는 칸을 접고 나니 "이 기록이 어디에
   * 묶여 있나"가 안 보였다. 그것은 읽을 때 알아야 하는 것이지 고칠 때만
   * 필요한 것이 아니다.
   *
   * 넘기지 않으면 그 줄을 그리지 않는다. 읽어오는 비용이 아까운 화면이
   * 있을 수 있고, **없는 것을 빈 줄로 그리지 않는다.**
   */
  captureProjects?: Record<string, ProjectChip[]>;
  /** 내가 쓴 태그 전부. */
  allTags?: readonly Tag[];
  /**
   * 영상 시점을 눌러 이동할 수 있는가. (설계 문서 14절)
   *
   * 같은 화면에 재생기가 떠 있을 때만 참이다. **없는데 누를 수 있게 해두면
   * 눌러야만 아무 일도 없다는 것을 알게 된다.** 음악의 시점 표시를 누를 수
   * 없게 둔 것과 같은 판단이다.
   */
  videoSeekable?: boolean;
}) {
  if (captures.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-50 px-6 py-8 text-center text-sm text-zinc-500 dark:bg-white/[.04]">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {captures.map((capture) => (
        <CaptureEditing key={capture.id}>
        <li
          className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300">
                {getCaptureTypeLabel(capture.captureType)}
              </span>

              {/*
                PDF에서 고른 기록이면 어느 쪽인지 보여주고, 그 자리로 돌아갈
                길을 준다. 설계 문서 9.3절의 "해당 페이지 재이동"이다.
                인용만 있고 어디서 왔는지 모르면 나중에 확인할 수가 없다.
              */}
              {capture.pdfLocation && capture.sourceId ? (
                <Link
                  href={`/sources/${capture.sourceId}/reader?file=${capture.pdfLocation.sourceFileId}&page=${capture.pdfLocation.page}`}
                  className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                >
                  {describeLocatorPages(capture.pdfLocation)}으로
                </Link>
              ) : null}

              {/*
                그림에서 남긴 기록이면 몇 번째 장인지 보여주고 그 자리로
                돌아갈 길을 준다. PDF의 `17쪽으로`와 같은 자리다.

                **셀 수 없으면 그리지 않는다.** 파일을 뗐거나 목록을 넘겨받지
                못한 경우인데, 그때 `1장으로`라고 둘러대면 눌러서 엉뚱한
                그림이 열린다. 없는 길을 보여주지 않는다.
              */}
              {capture.imageLocation && capture.sourceId && imageFileIds ? (
                (() => {
                  const where = describeImageLocator(
                    capture.imageLocation,
                    imageFileIds,
                  );

                  if (where === null) {
                    return null;
                  }

                  /*
                    한 부분을 가리키는 기록이면 **그 상자까지 주소에
                    싣는다.** (16-2) 장만 열어 주면 어디를 가리키는지
                    보이지 않고, 그러면 눌러도 알게 되는 것이 없다.
                  */
                  const region =
                    capture.imageLocation.kind === IMAGE_REGION_KIND
                      ? `&region=${formatRegionParam(capture.imageLocation)}`
                      : "";

                  return (
                    <Link
                      href={`/sources/${capture.sourceId}/reader?file=${capture.imageLocation.sourceFileId}${region}`}
                      className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                    >
                      {where}으로
                    </Link>
                  );
                })()
              ) : null}

              {/*
                음성의 자리. 시점이거나 구간이다. (설계 문서 17-4절)

                **음악과 달리 누를 수 있다.** 음악은 들려줄 파일이 우리에게
                없어서 글자만 보여주는데, 녹음은 Drive에 그 파일이 있고
                재생기도 있다. 눌러서 **그 자리로 가 있게** 한다.

                `?t=`에 자리를 싣는 까닭이 그것이다. 파일만 열어 주면 어디를
                가리키는지 알 수 없어 처음부터 다시 들으며 찾게 된다.
                16-2에서 상자를 주소에 실은 것과 같다.
              */}
              {capture.audioLocation && capture.sourceId ? (
                <Link
                  href={`/sources/${capture.sourceId}/reader?file=${capture.audioLocation.sourceFileId}&t=${formatAudioTimeParam(capture.audioLocation)}`}
                  className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.06]"
                >
                  {describeAudioTime(capture.audioLocation)}으로
                </Link>
              ) : null}

              {/*
                음악의 재생 시점. (설계 문서 13.4절)

                `01:08–01:34 / 2절 후렴`이 그대로 보인다. 시간을 본문에 섞어
                적지 않고 따로 담았기 때문에, 목록에서 한눈에 어느 대목인지
                알 수 있다.

                누를 수 있게 만들지 않았다. 13.4절은 "지원되는 플레이어에서
                해당 시점으로 이동한다"고 하는데, 그 플레이어를 붙이는 일은
                MVP 이후다. 지금 누를 수 있게 해두면 눌러야만 아무 일도
                없다는 것을 알게 된다.
              */}
              {capture.musicLocation ? (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                  {describeMusicTime(capture.musicLocation)}
                </span>
              ) : null}

              {/*
                영화·드라마의 자리. `시즌 2 · 3화 · 12:30`

                **음악과 같이 누를 수 없다.** OTT 영상을 우리가 틀 수 없어
                갈 곳이 없다. (설계 문서 15절) 생김새를 음악과 같게 두어
                "누를 수 있는 것"과 구분되게 한다.
              */}
              {capture.mediaLocation ? (
                <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                  {describeMediaTime(capture.mediaLocation)}
                </span>
              ) : null}

              {/*
                영상 시점. 음악과 달리 **누르면 그 시점으로 건너뛴다.**
                우리가 틀 수 있는 재생기가 같은 화면에 있기 때문이다.
                재생기가 없는 화면에서는 보여주기만 한다. (14절)
              */}
              {capture.videoLocation ? (
                <VideoTimeChip
                  location={capture.videoLocation}
                  seekable={videoSeekable}
                />
              ) : null}

              {/*
                설계 문서 9.2절: 파일이 교체된 경우 checksum을 비교하여
                기존 annotation 위치가 달라질 수 있음을 표시한다.

                기록은 그대로 둔다. 원문과 앞뒤 문맥이 함께 저장되어 있어서
                (6.3절) 쪽 번호가 틀려도 그 문장을 다시 찾을 수 있다.
                지우거나 고치는 것은 우리가 정할 일이 아니다.
              */}
              {capture.pdfLocation &&
              fileChecksums &&
              locatorIsStale({
                locatorChecksum: capture.pdfLocation.fileChecksum,
                fileChecksum:
                  fileChecksums[capture.pdfLocation.sourceFileId] ?? null,
              }) ? (
                <span
                  title="기록을 남긴 뒤 파일이 바뀌었습니다. 쪽 번호와 위치가 달라졌을 수 있습니다."
                  className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  위치가 달라졌을 수 있음
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              {/*
                고치기 단추. **날짜 왼쪽이다.** (2026-10-04, 사용자가 정함)

                오른쪽 끝 묶음은 기록마다 같은 자리에 있어서 목록을 훑을 때
                눈이 그 자리를 찾아간다. 별이 그 자리에 있는 것과 같은
                까닭으로 여기 둔다.
              */}
              <CaptureEditButton />

              <span className="text-xs text-zinc-500">
                {formatDateTime(capture.createdAt)}
              </span>
              {/*
                별은 날짜 옆에 둔다. 기록마다 같은 자리에 있어야 목록을
                훑으며 여러 개에 달 때 눈이 그 자리를 찾아가지 않는다.
              */}
              <StarButton
                action={toggleCaptureStar}
                id={capture.id}
                starred={capture.starred}
                returnTo={returnTo}
                title="이 기록"
                className="-my-2 -mr-2"
              />
            </div>
          </div>

          {/*
            원문. **자료가 한 말이다.** (설계 문서 2.4절)

            2026-10-04에 모양을 고쳤다. 사용자가 "원문과 내 메모가 모두
            동일한 색상이나 폰트라서 구분이 안 간다"고 했다. 맞는 말이었다.
            이 칸의 바탕은 `bg-zinc-50`이고 카드 바탕은 `bg-white`인데,
            그 둘의 차이가 **어두운 화면에서는 거의 보이지 않았다.**

            이 앱이 "가장 중요한 약속"이라고 적어둔 구분이다. 화면이 그것을
            못 지키면 담을 때 갈라 둔 뜻이 없어진다.

            **두 가지로 가른다. 하나만으로는 모자란다.**

              글꼴  원문은 `font-serif`. 인쇄된 글이라는 느낌이 그 자체로
                    "내가 쓴 것이 아니다"를 말한다.
              바탕  한 단 더 진하게. 왼쪽 선도 굵게.

            글꼴 하나로 두지 않는 까닭은, 글꼴 설정에서 `한 글꼴`을 고르면
            `--font-serif`와 `--font-sans`가 같은 값이 되기 때문이다.
            그때는 바탕과 선만 남는다. **둘 중 하나는 늘 살아 있어야 한다.**
          */}
          {capture.originalText ? (
            <figure className="flex flex-col gap-1.5">
              <figcaption className="flex flex-wrap items-baseline gap-2 text-xs font-medium tracking-wide text-zinc-500">
                원문
                {/*
                  집은 그대로가 아니면 밝힌다. (2026-10-04)

                  띄어쓰기나 빠진 마침표를 고친 것이 보통인데, **밝히지
                  않으면 이 글이 원문 그대로인지 알 수 없다.** 이 앱이
                  인용을 담는 까닭이 "나중에 확인할 수 있게"인데, 확인할 수
                  없으면 담은 뜻이 없다.

                  집은 그대로는 `locator`에 남아 있어서 마우스를 올리면
                  보인다. 지우지 않고 밝히는 쪽을 골랐다.
                */}
                {capture.pdfLocation &&
                "selectedText" in capture.pdfLocation &&
                capture.pdfLocation.selectedText !== capture.originalText ? (
                  <span
                    title={`집은 그대로: ${capture.pdfLocation.selectedText}`}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-normal text-zinc-500 dark:bg-white/[.08] dark:text-zinc-400"
                  >
                    다듬음
                  </span>
                ) : null}
              </figcaption>
              <blockquote className="rounded-r-lg border-l-[3px] border-zinc-400 bg-zinc-100 py-3 pl-4 pr-3 dark:border-zinc-600 dark:bg-white/[.07]">
                <p className="whitespace-pre-wrap font-serif text-[0.9375rem] leading-8 text-zinc-800 dark:text-zinc-200">
                  {capture.originalText}
                </p>
              </blockquote>
            </figure>
          ) : null}

          {capture.translatedText ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-zinc-500">
                {["옮긴 글", translationLanguageLabel(capture), verificationLabel(capture)]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </p>
              {/*
                옮긴 글은 **원문의 파생물**이라 원문 쪽 모양을 따른다.
                내 글과 같은 모양으로 두면 기계가 만든 글이 내 생각처럼
                읽힌다. 다만 원문 그 자체는 아니므로 바탕은 칠하지 않는다.
              */}
              <p className="whitespace-pre-wrap font-serif text-[0.9375rem] leading-8 text-zinc-700 dark:text-zinc-300">
                {capture.translatedText}
              </p>
              {/*
                설계 문서 9.4절: 번역 공급자, 모델, 언어, 생성 시각을 기록한다.
                기록만 하고 보여주지 않으면 "무엇이 이 번역을 만들었는가"를
                확인할 방법이 없다. 작게, 그러나 보이게 둔다.
              */}
              {capture.translationModel ? (
                <p className="text-xs text-zinc-400">
                  {capture.translationProvider
                    ? `${capture.translationProvider} · `
                    : null}
                  {capture.translationModel}
                  {capture.translatedAt
                    ? ` · ${formatDateTime(capture.translatedAt)}`
                    : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {/*
            내 메모. **내가 쓴 글이다.**

            원문과 반대로 간다. 바탕을 칠하지 않고 본문 글꼴 그대로 둔다.
            **이 카드에서 가장 평범하게 보이는 것이 내 글이어야 한다.**
            담아둔 것을 다시 읽을 때 눈이 머무는 곳이 여기다.

            원문이 함께 있을 때만 `내 메모` 딱지를 붙인다. 메모만 있으면
            가릴 것이 없어서 딱지가 하는 일이 없다.
          */}
          {capture.content ? (
            <div className="flex flex-col gap-1.5">
              {capture.originalText ? (
                <p className="text-xs font-medium tracking-wide text-accent dark:text-accent-dark">
                  내 메모
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-8 text-black dark:text-zinc-100">
                {capture.content}
              </p>
            </div>
          ) : null}

          {/*
            태그. (설계 문서 20-1절)

            본문 아래, 고치기·삭제 줄 위에 둔다. 기록을 읽고 나서 "이게
            무엇에 대한 것이었지"를 붙이는 순서가 자연스럽다.
          */}
          {/*
            읽는 동안 보여줄 것. **달린 태그와 이어진 프로젝트뿐이다.**

            고치는 칸을 숨기고 나니 "이 기록이 무엇에 묶여 있나"가 안
            보였다. 그것은 기록을 읽을 때 알아야 하는 것이지 고칠 때만
            필요한 것이 아니다.

            **하나도 없으면 줄 자체를 그리지 않는다.** 빈 줄이 있으면
            무언가 들어갈 자리가 비어 있는 것처럼 보인다.
          */}
          <WhenReading>
            {(captureTags?.[capture.id]?.length ?? 0) > 0 ||
            (captureProjects?.[capture.id]?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {(captureTags?.[capture.id] ?? []).map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 dark:bg-white/[.08] dark:text-zinc-300"
                  >
                    {tag.name}
                  </span>
                ))}

                {(captureProjects?.[capture.id] ?? []).map((project) => (
                  /*
                    프로젝트는 눌러서 갈 수 있게 둔다. 태그와 다른 점이다.
                    태그는 이름이고 프로젝트는 **갈 수 있는 자리**다.
                  */
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="rounded-full border border-black/[.08] px-2.5 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                  >
                    {project.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </WhenReading>

          <WhenEditing>
            {captureTags && allTags ? (
              <TagEditor
                target="capture"
                id={capture.id}
                tags={captureTags[capture.id] ?? []}
                allTags={allTags}
                returnTo={returnTo}
                compact
              />
            ) : null}
          </WhenEditing>

          {/*
            단추 줄.

            **좁은 칸에서 글자가 세로로 서지 않게 한다.** 읽기 화면에서
            왼쪽 논문을 넓히면 이 칸이 좁아지는데, 줄바꿈을 막지 않으면
            `수정`이 `수`/`정` 두 줄로 쪼개진다. 글자 수가 적을수록 더
            그렇다. 한 낱말은 붙어 있어야 읽힌다.

            `ml-auto`로 오른쪽 끝에 미는 것도 그만둔다. 좁아지면 밀 자리가
            없는데 밀어붙이느라 그 칸이 한 글자 너비까지 줄어든다.
            좁으면 **줄을 바꿔 아래로 내려가는 편**이 낫다.
          */}
          <WhenEditing>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
            <Link
              href={`/captures/${capture.id}/edit`}
              className="whitespace-nowrap text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              수정
            </Link>

            <form action={deleteCapture}>
              <input type="hidden" name="id" value={capture.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="whitespace-nowrap text-sm font-medium text-red-700 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                삭제
              </button>
            </form>

            {/*
              **자리에 놓기.** (19-B 뒤)

              프로젝트에 잇기만 하면 "이 프로젝트에 쓸 것"까지고, 자리에
              놓아야 "어디에 쓸 것"이 된다. **적어둔 직후가 그 판단이 가장
              또렷한 때다.** 나중에 프로젝트 화면에서 찾으려면 무엇을
              적었는지부터 다시 떠올려야 한다.

              프로젝트에 잇기도 그대로 둔다. 아직 뼈대를 만들지 않았거나,
              쓸 곳은 정했는데 어느 자리인지는 아직 모를 때가 있다.
            */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <PlacedWhere captureId={capture.id} />
              <NodePicker item={`capture:${capture.id}`} returnTo={returnTo} />
            </div>

            {/*
              프로젝트 고르는 칸은 눌러야 나온다.

              읽기 화면의 좁은 칸에서 **가장 넓은 것이 이 칸**이었다.
              프로젝트 이름이 길면 카드를 밀고 나간다. 그리고 기록 하나를
              적을 때마다 프로젝트를 고르는 것도 아니다. (panel.tsx의 기준)
            */}
            {projects.length > 0 ? (
              <Reveal label="프로젝트에 잇기">
              <form
                action={linkCaptureToProject}
                className="flex min-w-0 flex-wrap items-center gap-2"
              >
                <input type="hidden" name="targetId" value={capture.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label htmlFor={`project-${capture.id}`} className="sr-only">
                  연결할 프로젝트
                </label>
                <select
                  id={`project-${capture.id}`}
                  name="projectId"
                  /*
                    고르는 칸은 안에 든 이름만큼 넓어진다. 프로젝트 이름이
                    길면 칸 밖으로 삐져나간다. `min-w-0`과 `max-w-full`로
                    감싸는 칸 안에 머물게 한다.
                  */
                  className="h-9 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-2 text-xs text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="whitespace-nowrap text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  프로젝트에 추가
                </button>
              </form>
              </Reveal>
            ) : null}
          </div>
          </WhenEditing>
        </li>
        </CaptureEditing>
      ))}
    </ul>
  );
}

/**
 * 어느 언어로 옮겼는지.
 *
 * 저장된 값은 "ko" 같은 코드다. 우리가 아는 코드면 사람이 읽는 이름으로
 * 바꾸고, 모르는 값이면 저장된 그대로 보여준다. 예전에 손으로 적어 넣은
 * 기록이나 나중에 다른 번역기가 남긴 값이 있을 수 있다.
 */
function translationLanguageLabel(capture: Capture): string | null {
  const value = capture.translationLanguage;

  if (!value) {
    return null;
  }

  return isTranslationLanguage(value)
    ? getTranslationLanguageLabel(value)
    : value;
}

/** 기계가 만든 그대로인지, 사람이 손본 것인지. (설계 문서 9.4절) */
function verificationLabel(capture: Capture): string | null {
  return getVerificationLabel(capture.verificationStatus);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
