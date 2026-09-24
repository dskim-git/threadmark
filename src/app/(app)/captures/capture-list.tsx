import Link from "next/link";

import { linkCaptureToProject } from "@/app/(app)/projects/actions";
import { NodePicker } from "@/app/(app)/projects/node-picker";
import { PlacedWhere } from "@/app/(app)/projects/placed-where";
import type { Capture } from "@/lib/captures/queries";
import { describeMusicTime } from "@/lib/captures/music-locator";
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
 */
export function CaptureList({
  captures,
  returnTo,
  emptyText,
  projects = [],
  fileChecksums,
  captureTags,
  allTags,
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
  /** 비어 있지 않으면 기록마다 프로젝트 연결 선택을 보여준다. */
  projects?: ProjectChip[];
  /**
   * 기록마다 달린 태그. 기록 id로 찾는다. (설계 문서 20-1절)
   *
   * 넘기지 않으면 태그 칸을 그리지 않는다. 읽기 화면처럼 자리가 좁은 곳에서
   * 빼기 위해서다. 넘기려면 allTags도 함께 넘겨야 쓰던 태그를 눌러서 달 수 있다.
   */
  captureTags?: Record<string, Tag[]>;
  /** 내가 쓴 태그 전부. */
  allTags?: readonly Tag[];
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
        <li
          key={capture.id}
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

          {capture.originalText ? (
            <figure className="flex flex-col gap-1">
              <figcaption className="text-xs font-medium text-zinc-500">
                원문
              </figcaption>
              <blockquote className="border-l-2 border-zinc-300 bg-zinc-50 py-2 pl-4 text-sm leading-7 text-zinc-800 dark:border-zinc-700 dark:bg-white/[.04] dark:text-zinc-200">
                <p className="whitespace-pre-wrap">{capture.originalText}</p>
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
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
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

          {capture.content ? (
            <div className="flex flex-col gap-1">
              {capture.originalText ? (
                <p className="text-xs font-medium text-zinc-500">내 메모</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-7 text-black dark:text-zinc-100">
                {capture.content}
              </p>
            </div>
          ) : null}

          {/*
            태그. (설계 문서 20-1절)

            본문 아래, 고치기·삭제 줄 위에 둔다. 기록을 읽고 나서 "이게
            무엇에 대한 것이었지"를 붙이는 순서가 자연스럽다.
          */}
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

            {projects.length > 0 ? (
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
            ) : null}
          </div>
        </li>
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
