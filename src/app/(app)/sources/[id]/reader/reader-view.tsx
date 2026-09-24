"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createPdfPageCapture,
  createPdfSelectionCapture,
  createPdfTranslationCapture,
} from "../../../captures/actions";
import { translateSelection } from "../../../captures/translate-actions";
import {
  PDF_PAGE_KIND,
  describeLocatorPages,
  joinSelectedText,
} from "@/lib/captures/pdf-locator";
import {
  getTranslationLanguageLabel,
  type TranslationLanguageCode,
} from "@/lib/translation/types";

import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";
import { NOTICE_CLASS_NAME, NOTICE_HIDE_MS } from "../../../auto-notice";
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

  /*
    쌓아둔 인용 조각. (15-G)

    한 조각이 보통이다. 쪽을 넘어가는 문장은 조각이 둘 이상이 된다.
    조각을 그대로 들고 있는 이유는 **되돌릴 수 있게** 하기 위해서다. 합친
    글만 들고 있으면 잘못 이어 붙였을 때 손으로 고쳐야 하는데, 인용은 고칠
    수 없는 칸이라(2.4절) 처음부터 다시 골라야 한다.
  */
  const [pieces, setPieces] = useState<ReadSelection[]>([]);

  /*
    이어 붙일 후보. 쌓아둔 것이 있는데 **다른 쪽에서** 새로 골랐을 때 여기 온다.

    바로 이어 붙이지 않고 후보로 두는 이유가 있다. 다음 쪽에서 고른 것이
    이어지는 문장일 수도 있고, 아예 다른 문장을 새로 고르려던 것일 수도
    있다. 우리는 그것을 알 수 없으므로 물어본다.
  */
  const [piece, setPiece] = useState<ReadSelection | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<PanelTab>(() =>
    initialTab === "analysis" && !showAnalysis ? "notes" : initialTab,
  );

  /** 좁은 화면에서 PDF와 패널 중 무엇을 보여줄지. (9.1절) */
  const [mobileView, setMobileView] = useState<"pdf" | "panel">("pdf");

  /*
    잘 되었다는 안내는 잠깐 보이고 스스로 사라진다. (auto-notice.tsx)

    이 화면에서는 특히 그래야 한다. 안내문 한 줄이 붙으면 작업대가 딱 그만큼
    줄어든다. 창 높이를 재서 남는 만큼을 PDF에 주기 때문이다. (fill-viewport)
    "9쪽에서 인용을 남겼습니다"는 읽고 나면 할 일이 끝나는 글인데, 그 글이
    읽는 자리를 계속 가져가고 있었다.

    오류(error)는 건드리지 않는다. 못 본 오류는 아무 일도 없었던 것과
    구분되지 않는다.

    다른 화면은 주소에서 지우는데 여기는 화면이 들고 있는 값이라 그냥 비운다.
    사라진 뒤 FillViewport가 다시 재어 PDF가 그 한 줄을 되받는다.
  */
  useEffect(() => {
    if (notice === null) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), NOTICE_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [notice]);

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
        /*
          브라우저의 선택만 풀렸다. **쌓아둔 인용은 그대로 둔다.** (15-G)

          쪽을 넘기면 여기로 온다. 예전에는 이때 창을 닫았다. 그래서 쪽을
          넘어가는 문장은 뒷부분을 고르러 넘기는 순간 앞부분이 사라져,
          한 인용으로 남길 방법이 아예 없었다.

          이어 붙일 후보만 비운다. 다음 쪽에서 다시 고르면 새 후보가 온다.
          창을 닫는 것은 사용자가 X나 Esc로 정한다.
        */
        setPiece(null);

        return;
      }

      // 화면에서 고른 것을 읽어 설계 문서 6.3절의 모양으로 바꾼다.
      const read = readPdfSelection({
        pageElement: picked.pageElement,
        sourceFileId: fileId,
        page: picked.page,
        fileChecksum,
      });

      if (!read) {
        return;
      }

      setError(null);
      setNotice(null);

      /*
        드래그했다는 것은 이 문장으로 무언가 하겠다는 뜻이다.
        탭을 손으로 고르게 하면 손이 두 번 간다.
      */
      setTab("notes");
      setMobileView("panel");

      setPieces((current) => {
        const last = current[current.length - 1];

        /*
          **같은 쪽에서 다시 골랐으면 그것으로 새로 시작한다.**
          같은 쪽을 다시 고르는 것은 "잘못 골랐다"는 뜻이다. 거기서
          물어보면 인용 하나 고칠 때마다 단추를 눌러야 한다.

          다른 쪽에서 골랐으면 아래에서 후보로 둔다. 문장이 이어지는
          경우가 그것이고, 우리가 임의로 이어 붙이지 않는다.
        */
        if (!last || last.locator.page === picked.page) {
          setPiece(null);

          return [read];
        }

        setPiece(read);

        return current;
      });
    },
    [fileId, fileChecksum],
  );

  /**
   * 쌓아둔 조각을 한 인용으로 합친다. (15-G)
   *
   * 시작한 쪽과 그 쪽의 좌표는 **첫 조각**의 것을 쓴다. 되짚어 갈 자리는
   * 문장이 시작하는 곳이고, 좌표는 쪽 안의 비율이라 여러 쪽을 한 묶음에
   * 담을 방법이 없다.
   *
   * 뒤 문맥(contextAfter)은 **마지막 조각**의 것을 쓴다. 문장이 끝난 뒤에
   * 무엇이 오는지가 되짚을 때 쓸모 있는 값이다.
   */
  const quote = mergePieces(pieces);

  /** 이어 붙였을 때의 글. 미리 보여주고 길이도 여기서 잰다. */
  const joinedPreview =
    quote && piece
      ? joinSelectedText(
          quote.locator.selectedText,
          piece.locator.selectedText,
        )
      : null;

  const joinedTooLong =
    joinedPreview !== null && joinedPreview.length > MAX_TEXT_LENGTH;

  function handleAppendPiece() {
    if (!piece || joinedTooLong) {
      return;
    }

    setPieces((current) => [...current, piece]);
    setPiece(null);
  }

  /** 후보를 새 인용으로 삼는다. 이어지는 문장이 아니었을 때다. */
  function handleReplaceWithPiece() {
    if (!piece) {
      return;
    }

    setPieces([piece]);
    setPiece(null);
  }

  /** 마지막으로 이어 붙인 조각을 떼어낸다. */
  function handleUndoPiece() {
    setPieces((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }

  function clearQuote() {
    setPieces([]);
    setPiece(null);
  }

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
    if (!quote) {
      return;
    }

    setSave({ phase: "saving" });

    const result = await createPdfSelectionCapture({
      sourceId,
      memo,
      locator: quote.locator,
    });

    setSave({ phase: "idle" });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    const where = describeLocatorPages(quote.locator);

    clearQuote();
    afterSaved(`${where}에서 인용을 남겼습니다.`);
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
    if (!quote) {
      return;
    }

    setSave({ phase: "saving" });

    const result = await createPdfTranslationCapture({
      sourceId,
      memo: input.memo,
      locator: quote.locator,
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

    const where = describeLocatorPages(quote.locator);
    const languageLabel = getTranslationLanguageLabel(input.targetLanguage);

    clearQuote();
    afterSaved(`${where} 문장을 ${languageLabel} 번역과 함께 남겼습니다.`);
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
        <p role="status" className={NOTICE_CLASS_NAME}>
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
                    {entry.id === "notes" && quote ? " ●" : null}
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
                    {quote ? (
                      <SelectionPanel
                        /*
                          고른 글이 바뀌면 이 칸을 새로 만든다. 그래야 앞 문장에
                          쓰던 메모가 엉뚱한 문장에 붙지 않는다.

                          **첫 조각만 보고 정한다.** 이어 붙일 때마다 새로
                          만들면 적어둔 메모가 사라진다. 쪽을 넘어가는 문장을
                          이어 붙이는 것은 같은 인용을 계속 다루는 일이다.
                        */
                        key={`${pieces[0].locator.page}:${pieces[0].locator.selectedText.slice(0, 60)}`}
                        locator={quote.locator}
                        pendingPiece={piece?.locator ?? null}
                        joinedPreview={joinedPreview}
                        joinedTooLong={joinedTooLong}
                        pieceCount={pieces.length}
                        onAppendPiece={handleAppendPiece}
                        onReplaceWithPiece={handleReplaceWithPiece}
                        onUndoPiece={handleUndoPiece}
                        busy={save.phase === "saving"}
                        translationEnabled={translationEnabled}
                        onTranslate={handleTranslate}
                        onSave={(memo) => void handleSaveQuote(memo)}
                        onSaveWithTranslation={(input) =>
                          void handleSaveTranslation(input)
                        }
                        onDismiss={() => {
                          clearQuote();
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

/**
 * 쌓아둔 조각을 한 인용으로 합친다. (15-G)
 *
 * 화면 밖으로 꺼내 둔 이유는 순수한 계산이라 검사하기 쉽고, 이 파일에서
 * 상태를 다루는 코드와 섞이지 않게 하려는 것이다.
 */
function mergePieces(pieces: readonly ReadSelection[]): ReadSelection | null {
  const first = pieces[0];

  if (!first) {
    return null;
  }

  if (pieces.length === 1) {
    return first;
  }

  const last = pieces[pieces.length - 1];

  return {
    // 창을 놓을 자리는 마지막으로 고른 곳이 자연스럽다.
    anchor: last.anchor,
    locator: {
      ...first.locator,
      selectedText: pieces.reduce(
        (text, next, index) =>
          index === 0 ? next.locator.selectedText : joinSelectedText(text, next.locator.selectedText),
        "",
      ),
      // 문장이 끝난 뒤에 무엇이 오는지. 마지막 조각의 것이다.
      contextAfter: last.locator.contextAfter,
      endPage: last.locator.page,
    },
  };
}
