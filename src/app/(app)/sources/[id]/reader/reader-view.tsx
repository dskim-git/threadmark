"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createPdfPageCapture,
  createPdfSelectionCapture,
  createPdfTranslationCapture,
} from "../../../captures/actions";
import { translateSelection } from "../../../captures/translate-actions";
import {
  getTranslationLanguageLabel,
  type TranslationLanguageCode,
} from "@/lib/translation/types";
import { PDF_PAGE_KIND } from "@/lib/captures/pdf-locator";

import { saveReadingPosition } from "../../file-actions";
import { PageMemoPanel } from "./page-memo-panel";
import { PdfReader } from "./pdf-reader";
import { readPdfSelection, type ReadSelection } from "./read-selection";
import {
  SelectionPanel,
  type TranslationSaveInput,
} from "./selection-panel";

/**
 * 뷰어와 나머지를 잇는 껍데기.
 *
 * PdfReader는 PDF를 그리는 일만 한다. 무엇을 저장할지는 모른다.
 * 그 둘을 여기서 잇는다. 뷰어를 다른 곳에서 쓰거나 저장 방식이 바뀌어도
 * 그리는 쪽은 손대지 않아도 된다.
 *
 * 여기가 맡는 일은 넷이다.
 *   - 보던 자리 저장 (설계 문서 9.1절)
 *   - 고른 문장을 인용으로 남기기 (9.3절, 9.4절)
 *   - 고른 문장을 옮겨 번역과 함께 남기기 (9.4절)
 *   - 지금 쪽에 메모 남기기 (22절의 `페이지 메모`)
 *
 * 마지막 것이 스캔 이미지 PDF에서는 유일한 길이다. 고를 글자가 없기 때문이다.
 */

type SaveState = { phase: "idle" } | { phase: "saving" };

export function ReaderView({
  sourceId,
  fileId,
  fileChecksum,
  initialPage,
  initialZoom,
  translationEnabled,
}: {
  sourceId: string;
  fileId: string;
  fileChecksum: string | null;
  initialPage: number;
  initialZoom: number | null;
  /**
   * 번역 기능이 설정되어 있는지. 서버가 판단해 내려준다.
   *
   * API 키가 있는지를 브라우저가 알 방법은 없고, 알아야 할 이유도 없다.
   * 여기에 오는 것은 "쓸 수 있는가" 하나뿐이다.
   */
  translationEnabled: boolean;
}) {
  const router = useRouter();

  const [selection, setSelection] = useState<ReadSelection | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [memoOpen, setMemoOpen] = useState(false);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useCallback으로 감싸지 않으면 매번 새 함수가 되어, 뷰어 쪽의
  // "잠시 기다렸다 저장하기"가 계속 초기화된다.
  const handlePositionChange = useCallback(
    (page: number, zoom: number | null) => {
      // 저장 결과를 기다리지 않는다. 실패해도 읽기를 방해하지 않는다.
      void saveReadingPosition({ fileId, page, zoom });
    },
    [fileId],
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSelectionChange = useCallback(
    (picked: { pageElement: HTMLElement; page: number } | null) => {
      if (!picked) {
        setSelection(null);

        return;
      }

      // 화면에서 고른 것을 읽어 설계 문서 6.3절의 모양으로 바꾼다.
      const read = readPdfSelection({
        pageElement: picked.pageElement,
        sourceFileId: fileId,
        page: picked.page,
        fileChecksum,
      });

      setSelection(read);

      if (read) {
        setError(null);
        setNotice(null);
        // 인용 창과 메모 창이 함께 떠 있으면 무엇을 저장하는지 헷갈린다.
        setMemoOpen(false);
      }
    },
    [fileId, fileChecksum],
  );

  /** 저장이 끝난 뒤 공통으로 하는 일. */
  function afterSaved(message: string) {
    setNotice(message);
    setError(null);

    // 브라우저가 고른 표시를 지운다. 남겨두면 같은 문장을 또 저장하기 쉽다.
    window.getSelection()?.removeAllRanges();

    // 자료 상세의 기록 목록이 바로 반영되게 한다.
    router.refresh();
  }

  async function handleSaveQuote(memo: string) {
    if (!selection) {
      return;
    }

    setSave({ phase: "saving" });

    const result = await createPdfSelectionCapture({
      sourceId,
      memo,
      locator: selection.locator,
    });

    setSave({ phase: "idle" });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    const page = selection.locator.page;

    setSelection(null);
    afterSaved(`${page}쪽에서 인용을 남겼습니다.`);
  }

  /**
   * 고른 문장을 옮긴다. (설계 문서 9.4절 2~3번)
   *
   * 옮기기만 하고 저장하지 않는다. 결과를 보고 저장할지 정하는 것은
   * 다음 걸음이다. 그래서 여기서는 router.refresh()도 하지 않는다.
   */
  async function handleTranslate(
    text: string,
    language: TranslationLanguageCode,
  ) {
    const result = await translateSelection({ text, targetLanguage: language });

    if (!result.ok) {
      return { ok: false as const, message: result.message };
    }

    return {
      ok: true as const,
      translatedText: result.translatedText,
      translatedAt: result.translatedAt,
    };
  }

  /** 원문과 옮긴 글을 함께 기록으로 남긴다. (9.4절 4~5번) */
  async function handleSaveTranslation(input: TranslationSaveInput) {
    if (!selection) {
      return;
    }

    setSave({ phase: "saving" });

    const result = await createPdfTranslationCapture({
      sourceId,
      memo: input.memo,
      locator: selection.locator,
      targetLanguage: input.targetLanguage,
      machineTranslatedText: input.machineTranslatedText,
      translatedText: input.translatedText,
      translatedAt: input.translatedAt,
    });

    setSave({ phase: "idle" });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    const page = selection.locator.page;
    const languageLabel = getTranslationLanguageLabel(input.targetLanguage);

    setSelection(null);
    afterSaved(`${page}쪽 문장을 ${languageLabel} 번역과 함께 남겼습니다.`);
  }

  async function handleSaveMemo(memo: string) {
    setSave({ phase: "saving" });

    const result = await createPdfPageCapture({
      sourceId,
      memo,
      locator: {
        kind: PDF_PAGE_KIND,
        sourceFileId: fileId,
        page: currentPage,
        fileChecksum,
      },
    });

    setSave({ phase: "idle" });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    setMemoOpen(false);
    afterSaved(`${currentPage}쪽에 메모를 남겼습니다.`);
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
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      <PdfReader
        fileId={fileId}
        initialPage={initialPage}
        initialZoom={initialZoom}
        onPositionChange={handlePositionChange}
        onSelectionChange={handleSelectionChange}
        onPageChange={handlePageChange}
      />

      {/*
        고를 글자가 없는 스캔 PDF에서는 이것이 유일한 길이다.
        글자가 있는 PDF에서도 쪽 전체에 대한 생각을 남길 때 쓴다.
      */}
      {memoOpen ? (
        <PageMemoPanel
          // 쪽이 바뀌면 창을 새로 만든다. 앞 쪽에 쓰던 메모가 남으면 안 된다.
          key={currentPage}
          page={currentPage}
          busy={save.phase === "saving"}
          onSave={(memo) => void handleSaveMemo(memo)}
          onDismiss={() => setMemoOpen(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setMemoOpen(true);
              setNotice(null);
            }}
            className="h-10 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {currentPage}쪽에 메모
          </button>
        </div>
      )}

      {selection ? (
        <SelectionPanel
          /*
            고른 글이 바뀌면 창을 새로 만든다. 그래야 앞 문장에 쓰던 메모가
            엉뚱한 문장에 붙지 않는다. 글이 길 수 있어 앞부분만 쓴다.
          */
          key={`${selection.locator.page}:${selection.locator.selectedText.slice(0, 60)}`}
          locator={selection.locator}
          anchor={selection.anchor}
          busy={save.phase === "saving"}
          translationEnabled={translationEnabled}
          onTranslate={handleTranslate}
          onSave={(memo) => void handleSaveQuote(memo)}
          onSaveWithTranslation={(input) => void handleSaveTranslation(input)}
          onDismiss={() => {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      ) : null}
    </div>
  );
}
