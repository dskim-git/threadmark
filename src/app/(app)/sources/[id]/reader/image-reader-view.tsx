"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createImagePageCapture } from "@/app/(app)/captures/actions";
import { IMAGE_PAGE_KIND } from "@/lib/captures/image-locator";

import { FillViewport } from "./fill-viewport";
import { ImageReader, type ReaderImage } from "./image-reader";
import { PageMemoPanel } from "./page-memo-panel";
import { SplitPane } from "./split-pane";

/**
 * 그림을 보며 메모를 남기는 작업대. (설계 문서 16절, 2026-10-04)
 *
 * **PDF 작업대와 같은 틀을 쓴다.** 좌우로 나누고(`SplitPane`), 창 높이를
 * 재서 채우고(`FillViewport`), 오른쪽 위에 메모 칸(`PageMemoPanel`)을
 * 두고 그 아래 남긴 기록을 늘어놓는다.
 *
 * **같은 앱에서 두 가지 작업대를 만들지 않는다.** 그림이라고 다른 모양으로
 * 두면, 읽는 사람이 자료 갈래마다 쓰는 법을 새로 배워야 한다.
 *
 * PDF 쪽(`reader-view.tsx`)과 나눠 둔 까닭
 *   하나로 묶으려면 그 안이 온통 "PDF면 이것, 그림이면 저것"이 된다.
 *   PDF 쪽은 문장 고르기·번역·논문 분석 탭을 품고 있어 덩치가 크고,
 *   **그림에는 그중 어느 것도 없다.** 고를 글자가 없기 때문이다.
 *
 *   같이 쓰는 조각(`SplitPane`, `FillViewport`, `PageMemoPanel`)만 나눠
 *   쓰고 화면은 따로 둔다. 겹치는 것은 조각이지 흐름이 아니다.
 *
 * 탭을 두지 않는다
 *   PDF 쪽은 `메모`·`기록`·`분석` 세 탭이 있다. 그림에는 메모와 기록
 *   둘뿐이라 탭으로 가릴 이유가 없다. **탭은 자리가 모자랄 때 쓰는 것이고,
 *   둘이면 그냥 위아래로 둔다.** 한 번 더 눌러야 보이는 것이 늘어난다.
 */
export function ImageReaderView({
  sourceId,
  images,
  initialIndex,
  checksums,
  capturesSlot,
}: {
  sourceId: string;
  images: readonly ReaderImage[];
  /** 처음 열 장. 주소의 `?file=`이 정한다. */
  initialIndex: number;
  /** 파일마다의 md5. 메모를 남길 때 그 시점 값을 함께 담는다. */
  checksums: Readonly<Record<string, string | null>>;
  /** 서버가 그려 넘긴 기록 목록. Server Action을 품고 있어 여기서 못 만든다. */
  capturesSlot: React.ReactNode;
}) {
  const router = useRouter();

  /*
    지금 보는 장을 여기서 들고 있는다. **주소를 고치지 않는다.**

    장을 넘길 때마다 주소를 바꾸면 서버가 화면을 다시 그리고 기록 목록까지
    새로 받아온다. 기록은 자료에 달린 것이라 장이 바뀌어도 그대로인데,
    넘길 때마다 왕복이 한 번씩 생긴다. PDF가 쪽을 넘길 때 하는 것과 같다.

    들어올 때의 주소는 그대로 쓸모가 있다. 기록 목록의 `2장으로`가 그
    주소로 들어오고, 그 값이 `initialIndex`가 된다.
  */
  const [index, setIndex] = useState(initialIndex);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const current = images[index];

  async function handleSaveMemo(memo: string) {
    if (!current) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await createImagePageCapture({
      sourceId,
      memo,
      locator: {
        kind: IMAGE_PAGE_KIND,
        sourceFileId: current.id,
        fileChecksum: checksums[current.id] ?? null,
      },
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);

      return;
    }

    setNotice(`${index + 1}장에 메모를 남겼습니다.`);

    /*
      목록을 서버에서 다시 받아온다. 방금 남긴 것이 아래에 바로 보여야
      한다. 보이지 않으면 저장됐는지 알 수 없어 한 번 더 누르게 된다.
    */
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg bg-zinc-50 px-4 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
          {notice}
        </p>
      ) : null}

      <FillViewport>
        <SplitPane
          narrowView="left"
          left={
            <ImageReader
              images={images}
              index={index}
              onIndexChange={(next) => {
                // 장이 바뀌면 안내문을 거둔다. 앞 장 이야기가 남으면 헷갈린다.
                setNotice(null);
                setIndex(next);
              }}
            />
          }
          right={
            <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
              <PageMemoPanel
                /*
                  장이 바뀌면 칸을 새로 만든다. 앞 장에 쓰던 메모가 남아
                  있으면 **다른 장의 것으로 저장된다.** 오류는 나지 않는다.
                */
                key={current?.id ?? "none"}
                where={`${index + 1}장`}
                busy={busy}
                onSave={handleSaveMemo}
              />

              <div className="border-t border-black/[.06] pt-4 dark:border-white/[.08]">
                {capturesSlot}
              </div>
            </div>
          }
        />
      </FillViewport>
    </div>
  );
}
