"use client";

import { useState } from "react";

import {
  AVAILABLE_CAPTURE_TYPES,
  getCaptureTypeHint,
  getCaptureTypeLabel,
  requiresOriginalText,
  requiresTranslation,
} from "@/lib/captures/types";
import type { CaptureType } from "@/lib/captures/types";
import { MAX_LANGUAGE_LENGTH, MAX_TEXT_LENGTH } from "@/lib/captures/schema";

export type CaptureFormValues = {
  id?: string;
  sourceId: string | null;
  captureType: CaptureType;
  content: string;
  originalText: string;
  translatedText: string;
  translationLanguage: string;
};

/**
 * 기록 입력 폼.
 *
 * 유형에 따라 필요한 입력란이 달라지므로 Client Component로 만든다.
 * 메모를 적으려는 사람에게 원문과 번역문 칸까지 보여주면 무엇을 적어야 할지
 * 알기 어렵다.
 *
 * 다만 어떤 칸이 비어도 되는지는 화면이 정하지 않는다. 같은 규칙이
 * 검증 스키마와 데이터베이스 제약조건에도 있고, 그 둘이 실제로 막는다.
 */
export function CaptureForm({
  action,
  values,
  submitLabel,
  returnTo,
  errorMessage,
  compact = false,
}: {
  action: (formData: FormData) => Promise<void>;
  values: CaptureFormValues;
  submitLabel: string;
  returnTo: string;
  errorMessage?: string;
  /** 자료 상세 화면처럼 다른 내용과 함께 놓일 때 여백을 줄인다. */
  compact?: boolean;
}) {
  const [captureType, setCaptureType] = useState<CaptureType>(
    values.captureType,
  );

  const showOriginal = requiresOriginalText(captureType);
  const showTranslation = requiresTranslation(captureType);

  return (
    <form action={action} className={compact ? "flex flex-col gap-4" : "flex flex-col gap-6"}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {values.sourceId ? (
        <input type="hidden" name="sourceId" value={values.sourceId} />
      ) : null}
      <input type="hidden" name="returnTo" value={returnTo} />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="captureType"
          className="text-sm font-medium text-black dark:text-zinc-50"
        >
          기록 유형
        </label>
        <select
          id="captureType"
          name="captureType"
          value={captureType}
          onChange={(event) =>
            setCaptureType(event.target.value as CaptureType)
          }
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          {AVAILABLE_CAPTURE_TYPES.map((type) => (
            <option key={type} value={type}>
              {getCaptureTypeLabel(type)}
            </option>
          ))}
        </select>
        <p className="text-xs leading-5 text-zinc-500">
          {getCaptureTypeHint(captureType)}
        </p>
      </div>

      {showOriginal ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="originalText"
            className="text-sm font-medium text-black dark:text-zinc-50"
          >
            원문
            <span className="ml-1 text-red-600 dark:text-red-400">*</span>
          </label>
          <textarea
            id="originalText"
            name="originalText"
            rows={4}
            required
            maxLength={MAX_TEXT_LENGTH}
            defaultValue={values.originalText}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
          <p className="text-xs leading-5 text-zinc-500">
            원문은 고치지 않고 그대로 남깁니다. 내 생각은 아래 메모란에 적습니다.
          </p>
        </div>
      ) : (
        <input type="hidden" name="originalText" value="" />
      )}

      {showTranslation ? (
        <>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="translatedText"
              className="text-sm font-medium text-black dark:text-zinc-50"
            >
              옮긴 글
              <span className="ml-1 text-red-600 dark:text-red-400">*</span>
            </label>
            <textarea
              id="translatedText"
              name="translatedText"
              rows={4}
              required
              maxLength={MAX_TEXT_LENGTH}
              defaultValue={values.translatedText}
              className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="translationLanguage"
              className="text-sm font-medium text-black dark:text-zinc-50"
            >
              옮긴 언어
              <span className="ml-1 text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="translationLanguage"
              name="translationLanguage"
              type="text"
              required
              maxLength={MAX_LANGUAGE_LENGTH}
              placeholder="한국어"
              defaultValue={values.translationLanguage}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50 sm:max-w-xs"
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="translatedText" value="" />
          <input type="hidden" name="translationLanguage" value="" />
        </>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="content"
          className="text-sm font-medium text-black dark:text-zinc-50"
        >
          {showOriginal ? "내 메모" : "내용"}
          {showOriginal ? null : (
            <span className="ml-1 text-red-600 dark:text-red-400">*</span>
          )}
        </label>
        <textarea
          id="content"
          name="content"
          rows={compact ? 4 : 6}
          required={!showOriginal}
          maxLength={MAX_TEXT_LENGTH}
          defaultValue={values.content}
          className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        {showOriginal ? (
          <p className="text-xs leading-5 text-zinc-500">
            원문에 대한 내 생각입니다. 비워두어도 됩니다.
          </p>
        ) : null}
      </div>

      <div>
        <button
          type="submit"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
