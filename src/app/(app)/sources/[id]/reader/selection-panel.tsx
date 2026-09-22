"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PdfSelectionLocator } from "@/lib/captures/pdf-locator";
import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";
import {
  DEFAULT_TRANSLATION_LANGUAGE,
  MAX_TRANSLATION_INPUT_LENGTH,
  TRANSLATION_LANGUAGES,
  type TranslationLanguageCode,
} from "@/lib/translation/types";

/**
 * 고른 문장을 기록으로 남기는 작은 창. (설계 문서 9.4절)
 *
 * 설계 문서 2.4절대로 자리를 나눠 보여준다.
 *
 *   위쪽   PDF에서 고른 문장 — 자료가 한 말. 고칠 수 없다.
 *   가운데 옮긴 글 — 기계가 만든 것. 고칠 수 있다.
 *   아래쪽 내 메모 — 내가 한 말. 비워도 된다.
 *
 * 고른 문장을 고칠 수 없게 둔 것이 중요하다. 인용은 원문 그대로여야 하고,
 * 여기서 손댈 수 있으면 나중에 "이게 정말 논문에 있던 말인가"를 확인할 수 없다.
 * 다듬고 싶다면 그것은 인용이 아니라 바꾸어 쓰기이며, 메모란에 적을 일이다.
 *
 * 반대로 옮긴 글은 고칠 수 있다. 9.4절이 "번역 결과는 사용자가 수정할 수
 * 있게 한다"고 하기 때문이다. 고쳤는지 여부는 저장할 때 함께 남는다.
 *
 * 창의 뼈대는 세 칸이다.
 *
 *   머리   몇 쪽에서 골랐는지와 닫기 — 늘 보인다
 *   몸통   고른 문장·옮긴 글·내 메모 — 길면 이 안에서만 스크롤된다
 *   발     취소와 저장 버튼 — 늘 보인다
 *
 * 몸통만 스크롤되게 한 것이 핵심이다. 창 전체가 늘어나게 두면 내용이 길 때
 * 저장 버튼이 화면 밖으로 밀려나 누를 수가 없다.
 */

/** 화면 가장자리에서 이만큼 띄운다. */
const VIEWPORT_MARGIN = 12;

/** 고른 글과 창 사이 간격. 이만큼은 띄워야 무엇을 고른 건지 보인다. */
const ANCHOR_GAP = 12;

/** 아무리 좁아도 이보다 작게는 만들지 않는다. 더 작으면 쓸 수가 없다. */
const MIN_PANEL_HEIGHT = 200;

/** 고른 자리의 화면 좌표. */
type Anchor = { left: number; top: number; bottom: number };

/**
 * 창을 화면 안에 들어오게 놓는다.
 *
 * 예전에는 "고른 글이 화면 위쪽이면 아래에, 아래쪽이면 위에" 하는 규칙만
 * 있었다. 창이 작을 때는 그것으로 충분했는데, 번역 칸이 생기면서 창이
 * 두 배 가까이 커지자 화면 밖으로 넘쳐 버튼이 보이지 않게 됐다.
 *
 * 그래서 이제 세 가지를 실제로 재서 정한다.
 *   1. 위아래 중 어느 쪽이 더 넓은가
 *   2. 그 쪽에 창을 놓으면 높이가 얼마나 허락되는가
 *   3. 그 높이로 그렸을 때 창이 실제로 몇 픽셀인가
 *
 * 3번이 필요한 이유는 창을 위쪽에 놓을 때다. 위에 놓으려면 창의 높이를
 * 알아야 시작 지점을 정할 수 있는데, 높이는 그려봐야 안다.
 *
 * React 상태가 아니라 DOM을 직접 고친다. 상태로 하면 "재고 → 다시 그리고 →
 * 또 재고"가 반복되어 창이 한 번 깜빡인다.
 */
function placePanel(panel: HTMLElement, anchor: Anchor): void {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow = viewportHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;

  /*
    더 넓은 쪽에 놓는다. 어느 쪽도 넉넉하지 않을 때 덜 답답한 쪽을 고르는
    것이고, 넉넉할 때는 어느 쪽이든 다 들어가므로 결과가 같다.
  */
  const below = spaceBelow >= spaceAbove;
  const room = Math.max(below ? spaceBelow : spaceAbove, MIN_PANEL_HEIGHT);

  const maxHeight = Math.min(room, viewportHeight - VIEWPORT_MARGIN * 2);

  // 높이를 먼저 정해야 실제 크기를 잴 수 있다.
  setStyle(panel, "maxHeight", `${maxHeight}px`);

  const width = panel.offsetWidth;
  const height = panel.offsetHeight;

  const left = clamp(
    anchor.left - width / 2,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - width),
  );

  const preferredTop = below
    ? anchor.bottom + ANCHOR_GAP
    : anchor.top - ANCHOR_GAP - height;

  const top = clamp(
    preferredTop,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - height),
  );

  setStyle(panel, "left", `${Math.round(left)}px`);
  setStyle(panel, "top", `${Math.round(top)}px`);
}

/**
 * 값이 달라졌을 때만 쓴다.
 *
 * 크기를 지켜보는 쪽(ResizeObserver)이 이 함수를 부르는데, 같은 값을 다시
 * 쓰면 크기가 바뀐 것으로 잡혀 다시 불리고, 그것이 끝없이 이어진다.
 */
function setStyle(
  element: HTMLElement,
  property: "left" | "top" | "maxHeight",
  value: string,
): void {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 번역 칸의 상태. */
type TranslationState =
  | { phase: "none" }
  | { phase: "working" }
  | { phase: "failed"; message: string }
  | {
      phase: "done";
      /** 번역기가 내놓은 그대로. 사람이 손댔는지 비교하는 데 쓴다. */
      machineText: string;
      /** 지금 화면에 있는 글. 사용자가 고치면 이것만 바뀐다. */
      text: string;
      language: TranslationLanguageCode;
      translatedAt: string;
    };

export type TranslationSaveInput = {
  memo: string;
  machineTranslatedText: string;
  translatedText: string;
  targetLanguage: TranslationLanguageCode;
  translatedAt: string;
};

export function SelectionPanel({
  locator,
  anchor,
  busy,
  translationEnabled,
  onTranslate,
  onSave,
  onSaveWithTranslation,
  onDismiss,
}: {
  locator: PdfSelectionLocator;
  /** 고른 자리의 화면 좌표. 이 근처에 창을 띄운다. */
  anchor: Anchor;
  busy: boolean;
  /**
   * 번역을 쓸 수 있는지.
   *
   * 설정이 없으면 버튼 자체를 보여주지 않는다. 눌러야만 안 된다는 것을
   * 알게 되는 버튼은 없느니만 못하다. Drive가 연결되지 않았을 때와 같다.
   */
  translationEnabled: boolean;
  onTranslate: (
    text: string,
    language: TranslationLanguageCode,
  ) => Promise<
    | { ok: true; translatedText: string; translatedAt: string }
    | { ok: false; message: string }
  >;
  onSave: (memo: string) => void;
  onSaveWithTranslation: (input: TranslationSaveInput) => void;
  onDismiss: () => void;
}) {
  /*
    고른 글이 바뀌면 메모도 비워져야 한다. 앞 문장에 쓰던 메모가 남으면
    엉뚱한 문장에 붙는다.

    여기서 비우지 않고 부르는 쪽이 key를 바꿔 이 창을 새로 만든다.
    effect로 상태를 되돌리면 한 번 그린 뒤에 다시 그리게 되고,
    그 사이에 예전 메모가 잠깐 보인다.
  */
  const [memo, setMemo] = useState("");
  const [language, setLanguage] = useState<TranslationLanguageCode>(
    DEFAULT_TRANSLATION_LANGUAGE,
  );
  const [translation, setTranslation] = useState<TranslationState>({
    phase: "none",
  });

  const panelRef = useRef<HTMLDivElement>(null);

  /*
    자리를 잡는다. 그리기 전에 끝내야 창이 엉뚱한 곳에 잠깐 보이지 않는다.

    창 크기가 바뀔 때마다 다시 잡는다. 번역 결과가 도착하면 창이 갑자기
    길어지는데, 그때 다시 잡지 않으면 아래쪽이 화면 밖으로 나간다.
  */
  useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const reposition = () => placePanel(panel, anchor);

    reposition();

    const observer = new ResizeObserver(reposition);

    observer.observe(panel);
    window.addEventListener("resize", reposition);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [anchor]);

  // Esc로 닫는다. 읽는 중에 창이 걸리적거릴 때 손이 먼저 가는 키다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  /*
    고른 글이 길면 번역 버튼을 잠근다. 눌러서 거절당하는 것보다 누르기 전에
    왜 안 되는지 보이는 편이 낫다.
    (설계 문서 9.4절: 논문 전체를 자동 전송하지 않는다)
  */
  const tooLongToTranslate =
    locator.selectedText.length > MAX_TRANSLATION_INPUT_LENGTH;

  const working = translation.phase === "working";
  const locked = busy || working;

  async function handleTranslate() {
    setTranslation({ phase: "working" });

    const result = await onTranslate(locator.selectedText, language);

    if (!result.ok) {
      setTranslation({ phase: "failed", message: result.message });

      return;
    }

    setTranslation({
      phase: "done",
      machineText: result.translatedText,
      text: result.translatedText,
      language,
      translatedAt: result.translatedAt,
    });
  }

  const translated = translation.phase === "done" ? translation : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="고른 문장 저장"
      /*
        창 안을 눌러도 닫히지 않게 하는 표시다. (pdf-reader.tsx)
        이 표시가 없으면 글상자를 누르는 순간 선택이 풀려 창이 사라진다.
      */
      data-reader-selection-panel=""
      /*
        자리는 placePanel이 정한다. 여기서는 화면 밖에서 시작하게만 해 둔다.
        그려지기 전에 layout effect가 제자리로 옮긴다.
      */
      style={{ left: -9999, top: 0 }}
      className="fixed z-50 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-lg dark:border-white/[.145] dark:bg-zinc-950"
    >
      {/* 머리. 늘 보인다. */}
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-4 pt-4">
        <span className="text-xs font-medium text-zinc-500">
          {locator.page}쪽에서 고른 문장
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="text-sm text-zinc-400 transition-colors hover:text-black dark:hover:text-zinc-50"
        >
          ×
        </button>
      </div>

      {/* 몸통. 길어지면 여기 안에서만 스크롤된다. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {/*
          고른 문장은 읽기만 한다. 인용은 원문 그대로여야 한다. (설계 문서 2.4절)
        */}
        <blockquote className="max-h-28 shrink-0 overflow-auto rounded-lg border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-800 dark:border-zinc-600 dark:bg-white/[.04] dark:text-zinc-200">
          {locator.selectedText}
        </blockquote>

        {translationEnabled ? (
          <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-black/[.06] p-3 dark:border-white/[.1]">
            <div className="flex items-center gap-2">
              <label htmlFor="selection-language" className="sr-only">
                옮길 언어
              </label>
              <select
                id="selection-language"
                value={language}
                disabled={locked}
                onChange={(event) =>
                  setLanguage(event.target.value as TranslationLanguageCode)
                }
                className="h-9 rounded-lg border border-black/[.08] bg-white px-2 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              >
                {TRANSLATION_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void handleTranslate()}
                disabled={locked || tooLongToTranslate}
                className="h-9 flex-1 rounded-full border border-black/[.08] px-3 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                {working ? "옮기는 중…" : translated ? "다시 옮기기" : "번역"}
              </button>
            </div>

            {tooLongToTranslate ? (
              <p className="text-xs leading-5 text-zinc-500">
                한 번에 {MAX_TRANSLATION_INPUT_LENGTH}자까지 옮길 수 있습니다.
                더 짧게 골라 주세요.
              </p>
            ) : null}

            {translation.phase === "failed" ? (
              <p
                role="alert"
                className="text-xs leading-5 text-red-700 dark:text-red-300"
              >
                {translation.message}
              </p>
            ) : null}

            {translated ? (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="selection-translation"
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  옮긴 글 — 기계 번역입니다. 고칠 수 있습니다
                </label>
                <textarea
                  id="selection-translation"
                  rows={4}
                  maxLength={MAX_TEXT_LENGTH}
                  value={translated.text}
                  disabled={busy}
                  onChange={(event) =>
                    setTranslation({ ...translated, text: event.target.value })
                  }
                  className="resize-none rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                />
                {translated.text.trim() !== translated.machineText.trim() ? (
                  <p className="text-xs leading-5 text-zinc-500">
                    고친 번역으로 저장됩니다.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-col gap-1">
          <label
            htmlFor="selection-memo"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            내 메모 (선택)
          </label>
          <textarea
            id="selection-memo"
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            value={memo}
            disabled={locked}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="이 문장을 어떻게 읽었는지 적어둘 수 있습니다."
            className="resize-none rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </div>
      </div>

      {/*
        발. 늘 보인다.

        여기를 몸통 안에 두면, 내용이 길 때 저장 버튼이 스크롤 아래로 숨는다.
        무엇을 저장하는지 보는 것보다 저장할 수 있는 것이 먼저다.
      */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-black/[.06] px-4 py-3 dark:border-white/[.1]">
        <button
          type="button"
          onClick={onDismiss}
          disabled={locked}
          className="h-9 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          취소
        </button>

        {/*
          번역이 있으면 저장이 두 갈래가 된다.
          번역이 마음에 들지 않으면 원문만 인용으로 남길 수 있어야 한다.
        */}
        <button
          type="button"
          onClick={() => onSave(memo)}
          disabled={locked}
          className={
            translated
              ? "h-9 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              : "h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          }
        >
          {busy && !translated ? "저장하는 중…" : "인용 저장"}
        </button>

        {translated ? (
          <button
            type="button"
            onClick={() =>
              onSaveWithTranslation({
                memo,
                machineTranslatedText: translated.machineText,
                translatedText: translated.text,
                targetLanguage: translated.language,
                translatedAt: translated.translatedAt,
              })
            }
            disabled={locked || translated.text.trim().length === 0}
            className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {busy ? "저장하는 중…" : "번역과 함께 저장"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
