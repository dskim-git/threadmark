"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createPdfPageCapture,
  createPdfSelectionCapture,
  createPdfTranslationCapture,
} from "../../../captures/actions";
import { translateSelection } from "../../../captures/translate-actions";
import { PDF_PAGE_KIND } from "@/lib/captures/pdf-locator";
import {
  getTranslationLanguageLabel,
  type TranslationLanguageCode,
} from "@/lib/translation/types";

import { AnalysisForm } from "../../analysis-form";
import { saveReadingPosition } from "../../file-actions";
import { PageMemoPanel } from "./page-memo-panel";
import { PdfReader } from "./pdf-reader";
import { readPdfSelection, type ReadSelection } from "./read-selection";
import { SelectionPanel, type TranslationSaveInput } from "./selection-panel";
import { FillViewport } from "./fill-viewport";
import { SplitPane } from "./split-pane";

/**
 * 읽기 작업대. (설계 문서 9.1절, 21절)
 *
 * 9.1절: "데스크톱에서는 좌측 PDF, 우측 Capture 패널의 분할 화면을 사용한다.
 * 모바일에서는 `PDF`와 `메모` 탭을 전환한다."
 *
 * 13-A는 이렇게 만들지 않았다. PDF를 넓게 펴놓고 고른 문장을 떠 있는 창으로
 * 받았다. 그 탓에 창이 화면 밖으로 넘치거나, 창 안을 누르면 브라우저가
 * 선택을 풀어 창이 사라지는 일을 따로 막아야 했다. 제자리에 놓으니 그런 일이
 * 없다. 14-E에서 9.1절대로 고쳤다.
 *
 * 오른쪽에 셋이 온다. 9.1절이 "Capture 패널"이라고만 한 것은 분석 서식이
 * 생기기 전이라서다.
 *
 *   분석  30칸짜리 서식 (8.2절)
 *   기록  이 자료에 남긴 인용과 메모
 *   메모  고른 문장 저장, 지금 쪽에 메모
 *
 * 문장을 드래그하면 `메모` 탭으로 저절로 넘어간다. 드래그는 "이 문장으로
 * 무언가 하겠다"는 뜻이라, 그때마다 탭을 손으로 고르게 하면 손이 두 번 간다.
 */

type SaveState = { phase: "idle" } | { phase: "saving" };

export type PanelTab = "analysis" | "captures" | "notes";

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: "analysis", label: "분석" },
  { id: "captures", label: "기록" },
  { id: "notes", label: "메모" },
];

export function ReaderView({
  sourceId,
  fileId,
  fileChecksum,
  initialPage,
  initialZoom,
  translationEnabled,
  initialTab,
  analysisInitial,
  analysisProjects,
  showAnalysis,
  capturesSlot,
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
  /** `?panel=`로 들어온 탭. 분석 화면에서 건너올 때 쓴다. */
  initialTab: PanelTab;
  analysisInitial: Record<string, string | null>;
  analysisProjects: readonly { id: string; name: string }[];
  /** 논문 유형일 때만 분석 탭을 보여준다. */
  showAnalysis: boolean;
  /**
   * 이 자료의 기록 목록.
   *
   * 서버에서 그려 넘겨받는다. 기록 목록은 삭제와 프로젝트 연결 같은
   * Server Action을 품고 있어서 브라우저 쪽에서 다시 만들 수 없다.
   */
  capturesSlot: React.ReactNode;
}) {
  const router = useRouter();

  const [selection, setSelection] = useState<ReadSelection | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<PanelTab>(() =>
    initialTab === "analysis" && !showAnalysis ? "notes" : initialTab,
  );

  /** 좁은 화면에서 PDF와 패널 중 무엇을 보여줄지. (9.1절) */
  const [mobileView, setMobileView] = useState<"pdf" | "panel">("pdf");

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

        /*
          드래그했다는 것은 이 문장으로 무언가 하겠다는 뜻이다.
          탭을 손으로 고르게 하면 손이 두 번 간다.
        */
        setTab("notes");
        setMobileView("panel");
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

    // 기록 탭과 자료 상세의 목록이 바로 반영되게 한다.
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

    afterSaved(`${currentPage}쪽에 메모를 남겼습니다.`);
  }

  const tabs = TABS.filter((entry) => entry.id !== "analysis" || showAnalysis);

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

      {/*
        좁은 화면에서는 PDF와 패널을 오간다. (9.1절, 21절)
        나란히 놓는 것을 억지로 줄이지 않는다.
      */}
      <div className="flex gap-2 lg:hidden">
        {(["pdf", "panel"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setMobileView(view)}
            aria-pressed={mobileView === view}
            className={`h-10 flex-1 rounded-full border px-4 text-sm transition-colors ${
              mobileView === view
                ? "border-transparent bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black"
                : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            }`}
          >
            {view === "pdf" ? "PDF" : "메모"}
          </button>
        ))}
      </div>

      {/*
        높이를 재서 맞춘다. 머리말이 몇 줄이든 창에 딱 맞고, 바깥 스크롤이
        생기지 않는다. 왜 CSS로 하지 않는지는 fill-viewport.tsx에 적었다.
      */}
      <FillViewport className="min-h-0">
        <SplitPane
          narrowView={mobileView === "pdf" ? "left" : "right"}
          className="h-full"
          left={
            <PdfReader
              fileId={fileId}
              initialPage={initialPage}
              initialZoom={initialZoom}
              onPositionChange={handlePositionChange}
              onSelectionChange={handleSelectionChange}
              onPageChange={handlePageChange}
            />
          }
          right={
            /*
            오른쪽: 패널

            data-reader-selection-panel 표시가 여기 붙어 있다. 이 안을 누르면
            브라우저가 문서의 선택을 푸는데, 뷰어가 그것을 "고른 글이
            없어졌다"로 읽어 선택을 지워버리기 때문이다. 표시가 없으면 분석
            칸에 타자를 치는 순간 고른 문장이 사라진다. (pdf-reader.tsx)
          */
            <aside
              data-reader-selection-panel=""
              className="flex min-h-0 flex-1 flex-col rounded-2xl border border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"
            >
              <div className="flex shrink-0 gap-1 border-b border-black/[.06] p-2 dark:border-white/[.1]">
                {tabs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTab(entry.id)}
                    aria-pressed={tab === entry.id}
                    className={`h-9 flex-1 rounded-full px-3 text-sm transition-colors ${
                      tab === entry.id
                        ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-black"
                        : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                    }`}
                  >
                    {entry.label}
                    {/* 다른 탭을 보는 중에도 고른 문장이 기다리고 있음을 알린다. */}
                    {entry.id === "notes" && selection ? " ●" : null}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {tab === "analysis" && showAnalysis ? (
                  <AnalysisForm
                    sourceId={sourceId}
                    initial={analysisInitial}
                    projects={analysisProjects}
                    compact
                  />
                ) : null}

                {tab === "captures" ? capturesSlot : null}

                {tab === "notes" ? (
                  <div className="flex flex-col gap-6">
                    {selection ? (
                      <SelectionPanel
                        /*
                      고른 글이 바뀌면 이 칸을 새로 만든다. 그래야 앞 문장에
                      쓰던 메모가 엉뚱한 문장에 붙지 않는다.
                    */
                        key={`${selection.locator.page}:${selection.locator.selectedText.slice(0, 60)}`}
                        locator={selection.locator}
                        busy={save.phase === "saving"}
                        translationEnabled={translationEnabled}
                        onTranslate={handleTranslate}
                        onSave={(memo) => void handleSaveQuote(memo)}
                        onSaveWithTranslation={(input) =>
                          void handleSaveTranslation(input)
                        }
                        onDismiss={() => {
                          setSelection(null);
                          window.getSelection()?.removeAllRanges();
                        }}
                      />
                    ) : (
                      <p className="rounded-lg bg-zinc-50 px-3 py-4 text-xs leading-5 text-zinc-500 dark:bg-white/[.04]">
                        PDF에서 문장을 드래그하면 여기에 인용과 번역을 남길 수
                        있습니다.
                      </p>
                    )}

                    {/*
                  고를 글자가 없는 스캔 PDF에서는 이것이 유일한 길이다.
                  글자가 있는 PDF에서도 쪽 전체에 대한 생각을 남길 때 쓴다.
                */}
                    <div className="border-t border-black/[.06] pt-6 dark:border-white/[.1]">
                      <PageMemoPanel
                        // 쪽이 바뀌면 칸을 새로 만든다. 앞 쪽에 쓰던 메모가 남으면 안 된다.
                        key={currentPage}
                        page={currentPage}
                        busy={save.phase === "saving"}
                        onSave={(memo) => void handleSaveMemo(memo)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          }
        />
      </FillViewport>
    </div>
  );
}
