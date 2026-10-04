"use client";

import { useState } from "react";

import type { PdfSelectionLocator } from "@/lib/captures/pdf-locator";
import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";
import { heavilyChanged } from "@/lib/captures/tidy-quote";
import {
  DEFAULT_TRANSLATION_LANGUAGE,
  MAX_TRANSLATION_INPUT_LENGTH,
  TRANSLATION_LANGUAGES,
  type TranslationLanguageCode,
} from "@/lib/translation/types";

/**
 * 고른 문장을 기록으로 남기는 자리. (설계 문서 9.3절, 9.4절)
 *
 * 설계 문서 2.4절대로 자리를 나눠 보여준다.
 *
 *   위쪽   PDF에서 고른 문장 — 자료가 한 말. 고칠 수 없다.
 *   가운데 옮긴 글 — 기계가 만든 것. 고칠 수 있다.
 *   아래쪽 내 메모 — 내가 한 말. 비워도 된다.
 *
 * 고른 문장은 **기본적으로 고칠 수 없다.** 인용은 원문 그대로여야 하고,
 * 마음대로 손댈 수 있으면 나중에 "이게 정말 논문에 있던 말인가"를 확인할
 * 수 없다. 다듬는 것과 바꾸어 쓰는 것은 다르고, 바꾸어 쓴 것은 메모란에
 * 적을 일이다.
 *
 * **다만 다듬는 길을 하나 열어 두었다.** (2026-10-04, 사용자 요청)
 *
 *   > 가끔 pdf에서 긁어온 원문을 약간 수정해서 저장해야 할 때가 있어.
 *   > (띄어쓰기가 이상하다던가 마침표까지 드래그가 안되었다던가)
 *
 *   그 둘은 **원문이 그런 것이 아니라 드래그가 그렇게 집은 것**이다.
 *   PDF의 글자는 보이지 않는 조각 수백 개라 줄이 바뀌는 자리에서 띄어쓰기가
 *   끼거나 끝의 마침표가 빠진다. 고치면 원문에서 멀어지는 것이 아니라
 *   **가까워진다.**
 *
 *   그리고 이 규칙은 이미 반쪽만 걸려 있었다. 저장한 뒤 `수정` 화면에서는
 *   원문 칸이 열려 있고 데이터베이스도 막지 않는다. **고치려면 일부러 한
 *   번 저장해야 하는 상태**였고, 그것이 더 나쁘다.
 *
 * 어떻게 뜻을 지키나
 *   - 기본은 읽기만 한다. **눌러야 열린다.** 열어두면 "다시 써도 되는 칸"이 된다.
 *   - 다듬어도 **집은 그대로는 `locator.selectedText`에 남는다.** 담기는
 *     값과 집은 값이 갈라져 있어 되짚어 볼 수 있다.
 *   - 고른 자리(`rects`, 앞뒤 문맥)는 건드리지 않는다. **그것이 안전망이다.**
 *     글자를 다듬어도 원문의 그 자리로 갈 수 있다.
 *   - 되돌리는 단추를 둔다.
 *
 * 반대로 옮긴 글은 고칠 수 있다. 9.4절이 "번역 결과는 사용자가 수정할 수
 * 있게 한다"고 하기 때문이다. 고쳤는지 여부는 저장할 때 함께 남는다.
 *
 * 떠 있는 창이 아니라 오른쪽 패널 안에 놓인다 (14-E). 설계 문서 9.1절이
 * 처음부터 "좌측 PDF, 우측 Capture 패널"을 요구했는데 13-A가 그렇게 만들지
 * 않았다. 떠 있던 동안에는 화면 밖으로 넘치거나, 창 안을 누르면 선택이
 * 풀려 창이 사라지는 문제를 따로 막아야 했다. 제자리에 놓으니 그 일이 없다.
 */

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
  /** 집은 글을 다듬었다면 그 글. 안 다듬었으면 없다. (2026-10-04) */
  tidiedText?: string;
  machineTranslatedText: string;
  translatedText: string;
  targetLanguage: TranslationLanguageCode;
  translatedAt: string;
};

export function SelectionPanel({
  locator,
  pendingPiece,
  joinedPreview,
  joinedTooLong,
  pieceCount,
  onAppendPiece,
  onReplaceWithPiece,
  onUndoPiece,
  busy,
  translationEnabled,
  onTranslate,
  onSave,
  onSaveWithTranslation,
  onDismiss,
}: {
  locator: PdfSelectionLocator;
  /**
   * 이어 붙일 후보. 다른 쪽에서 새로 고른 문장이다. (15-G)
   *
   * 없으면 보통의 창이다. 있으면 "이어지는 문장인가, 새로 고른 것인가"를
   * 묻는 칸이 하나 더 붙는다. 우리가 임의로 정하지 않는다.
   */
  pendingPiece: PdfSelectionLocator | null;
  /** 이어 붙였을 때의 글. 누르기 전에 보여준다. */
  joinedPreview: string | null;
  /** 이어 붙이면 길이 한도를 넘는가. */
  joinedTooLong: boolean;
  /** 지금 쌓인 조각 수. 둘 이상이면 되돌릴 수 있다. */
  pieceCount: number;
  onAppendPiece: () => void;
  onReplaceWithPiece: () => void;
  onUndoPiece: () => void;
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
  /**
   * 인용만 저장한다.
   *
   * 다듬은 글을 함께 넘긴다. **안 다듬었으면 넘기지 않는다.** 집은 것과
   * 같은 글을 굳이 보내면, 받는 쪽에서 "다듬었다"와 "그대로다"를 가릴 수
   * 없다.
   */
  onSave: (memo: string, tidiedText?: string) => void;
  onSaveWithTranslation: (input: TranslationSaveInput) => void;
  onDismiss: () => void;
}) {
  /*
    고른 글이 바뀌면 메모도 비워져야 한다. 앞 문장에 쓰던 메모가 남으면
    엉뚱한 문장에 붙는다.

    여기서 비우지 않고 부르는 쪽이 key를 바꿔 이 칸을 새로 만든다.
    effect로 상태를 되돌리면 한 번 그린 뒤에 다시 그리게 되고,
    그 사이에 예전 메모가 잠깐 보인다.
  */
  const [memo, setMemo] = useState("");

  /*
    집은 글을 다듬는 칸. (2026-10-04)

    **`null`이면 안 열린 것이다.** 빈 글자와 가려야 한다. 빈 글자로 두면
    "열었는데 다 지운 것"과 "안 열었다"를 구분할 수 없다.
  */
  const [tidied, setTidied] = useState<string | null>(null);
  const [language, setLanguage] = useState<TranslationLanguageCode>(
    DEFAULT_TRANSLATION_LANGUAGE,
  );
  const [translation, setTranslation] = useState<TranslationState>({
    phase: "none",
  });

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
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">
          {locator.endPage && locator.endPage !== locator.page
            ? `${locator.page}~${locator.endPage}쪽에 걸친 문장`
            : `${locator.page}쪽에서 고른 문장`}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          disabled={locked}
          className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-black disabled:opacity-50 dark:hover:text-zinc-50"
        >
          선택 지우기
        </button>
      </div>

      {/*
        고른 문장은 읽기만 한다. 인용은 원문 그대로여야 한다. (설계 문서 2.4절)
      */}
      {/*
        모양을 기록 목록의 원문 칸과 맞춘다. (2026-10-04)
        **고른 그 자리에서 보이는 모양과 저장된 뒤의 모양이 같아야 한다.**
        다르면 "내가 고른 게 저렇게 들어갔나"를 한 번 더 확인하게 된다.
      */}
      {tidied === null ? (
        <blockquote className="max-h-40 overflow-auto rounded-r-lg border-l-[3px] border-zinc-400 bg-zinc-100 px-3 py-2.5 font-serif text-sm leading-7 text-zinc-800 dark:border-zinc-600 dark:bg-white/[.07] dark:text-zinc-200">
          {locator.selectedText}
        </blockquote>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tidied-quote" className="sr-only">
            집은 문장 다듬기
          </label>
          {/*
            열렸을 때도 **원문 칸처럼 보이게** 둔다. 같은 글꼴과 같은 왼쪽
            선이다. 모양이 달라지면 "다른 칸에 옮겨 적는 것"처럼 느껴지고,
            그러면 다시 쓰고 싶어진다.
          */}
          <textarea
            id="tidied-quote"
            rows={5}
            maxLength={MAX_TEXT_LENGTH}
            value={tidied}
            disabled={locked}
            onChange={(event) => setTidied(event.target.value)}
            className="resize-none rounded-r-lg border-l-[3px] border-zinc-400 bg-zinc-100 px-3 py-2.5 font-serif text-sm leading-7 text-zinc-800 disabled:opacity-60 dark:border-zinc-600 dark:bg-white/[.07] dark:text-zinc-200"
          />

          {/*
            얼마나 지웠는지 알린다. **띄어쓰기를 고치는 것과 문장을 새로
            쓰는 것은 다르다.** 막지는 않는다. 무엇이 인용인지는 쓰는
            사람이 정할 일이고, 우리는 그 선을 넘고 있다는 것만 말한다.
          */}
          {heavilyChanged(locator.selectedText, tidied) ? (
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              집은 문장과 많이 달라졌습니다. 다듬는 것을 넘어 고쳐 쓰는
              것이라면 인용이 아니라 메모란에 적는 편이 맞습니다.
            </p>
          ) : null}
        </div>
      )}

      {/*
        다듬기를 켜고 끄는 줄. **기본은 꺼져 있다.**

        되돌리는 단추를 함께 둔다. 집은 그대로로 돌아갈 길이 없으면
        잘못 지웠을 때 처음부터 다시 골라야 한다.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() =>
            setTidied((value) => (value === null ? locator.selectedText : null))
          }
          disabled={locked}
          className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-black disabled:opacity-50 dark:hover:text-zinc-50"
        >
          {tidied === null ? "집은 문장 다듬기" : "다듬기 그만두기"}
        </button>

        {tidied !== null && tidied !== locator.selectedText ? (
          <button
            type="button"
            onClick={() => setTidied(locator.selectedText)}
            disabled={locked}
            className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-black disabled:opacity-50 dark:hover:text-zinc-50"
          >
            집은 그대로 되돌리기
          </button>
        ) : null}

        {tidied !== null ? (
          <span className="text-xs leading-5 text-zinc-500">
            띄어쓰기나 빠진 문장부호를 고치는 자리입니다. 고른 자리는 그대로
            남습니다.
          </span>
        ) : null}
      </div>

      {/*
        이어 붙인 것을 한 걸음 되돌린다. (15-G)

        인용 칸은 고칠 수 없으므로(2.4절) 잘못 이어 붙였을 때 손으로 고칠
        길이 없다. 되돌릴 수 없으면 처음부터 다시 골라야 한다.
      */}
      {pieceCount > 1 ? (
        <button
          type="button"
          onClick={onUndoPiece}
          disabled={locked}
          className="self-start text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-black disabled:opacity-50 dark:hover:text-zinc-50"
        >
          마지막으로 이어 붙인 것 되돌리기
        </button>
      ) : null}

      {/*
        다른 쪽에서 새로 고른 문장. (15-G)

        쪽을 넘어가는 문장의 뒷부분일 수도 있고, 아예 다른 문장을 새로
        고르려던 것일 수도 있다. 우리는 알 수 없으므로 **묻는다.**
        이어 붙였을 때의 글을 미리 보여주어, 누르기 전에 결과를 알 수 있게 한다.
      */}
      {pendingPiece ? (
        <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-soft/50 p-3 dark:border-accent-dark/40 dark:bg-accent-dark-soft/40">
          <span className="text-xs font-medium text-accent dark:text-accent-dark">
            {pendingPiece.page}쪽에서 새로 고른 문장
          </span>

          <blockquote className="max-h-24 overflow-auto text-xs leading-5 text-zinc-700 dark:text-zinc-300">
            {pendingPiece.selectedText}
          </blockquote>

          {joinedTooLong ? (
            <p className="text-xs leading-5 text-red-700 dark:text-red-400">
              이어 붙이면 한 기록에 담을 수 있는 길이를 넘습니다. 나눠서
              남겨 주세요.
            </p>
          ) : joinedPreview ? (
            <details className="text-xs text-zinc-600 dark:text-zinc-400">
              <summary className="cursor-pointer">이어 붙이면 이렇게 됩니다</summary>
              <p className="mt-1 max-h-24 overflow-auto leading-5">
                {joinedPreview}
              </p>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAppendPiece}
              disabled={locked || joinedTooLong}
              className="h-9 rounded-full bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
            >
              이어 붙이기
            </button>
            <button
              type="button"
              onClick={onReplaceWithPiece}
              disabled={locked}
              className="h-9 rounded-full border border-black/[.08] px-4 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              이것만 남기기
            </button>
          </div>
        </div>
      ) : null}

      {translationEnabled ? (
        <div className="flex flex-col gap-2 rounded-lg border border-black/[.06] p-3 dark:border-white/[.1]">
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
              한 번에 {MAX_TRANSLATION_INPUT_LENGTH}자까지 옮길 수 있습니다. 더
              짧게 골라 주세요.
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

      <div className="flex flex-col gap-1">
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

      {/*
        번역이 있으면 저장이 두 갈래가 된다.
        번역이 마음에 들지 않으면 원문만 인용으로 남길 수 있어야 한다.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(memo, tidiedForSave(locator.selectedText, tidied))}
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
                tidiedText: tidiedForSave(locator.selectedText, tidied),
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

/**
 * 저장할 때 함께 보낼 다듬은 글.
 *
 * **안 다듬었거나 집은 것과 같으면 보내지 않는다.** 보내면 받는 쪽에서
 * 다듬었는지 아닌지를 가릴 수 없다. 담기는 값은 어차피 같지만, 기록을
 * 나중에 읽을 때 `다듬음`이라고 표시할지가 거기서 갈린다.
 */
function tidiedForSave(picked: string, tidied: string | null): string | undefined {
  const trimmed = tidied?.trim() ?? "";

  if (trimmed.length === 0 || trimmed === picked) {
    return undefined;
  }

  return trimmed;
}
