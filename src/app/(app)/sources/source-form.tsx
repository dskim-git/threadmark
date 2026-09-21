import Link from "next/link";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/sources/schema";
import { SOURCE_TYPES, getSourceTypeLabel } from "@/lib/sources/types";
import type { SourceType } from "@/lib/sources/types";

export type SourceFormValues = {
  id?: string;
  type: SourceType;
  title: string;
  subtitle: string;
  description: string;
  originalUrl: string;
};

/**
 * 자료 등록과 수정이 같은 폼을 쓴다.
 *
 * 입력 한계는 검증 스키마의 상수를 그대로 가져온다. 화면과 서버가 다른 숫자를
 * 쓰면 사용자는 입력이 되는데 저장이 안 되는 상황을 겪는다.
 */
export function SourceForm({
  action,
  values,
  submitLabel,
  cancelHref,
  errorMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  values: SourceFormValues;
  submitLabel: string;
  cancelHref: string;
  errorMessage?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <Field label="자료 유형" htmlFor="type">
        <select
          id="type"
          name="type"
          defaultValue={values.type}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          {SOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {getSourceTypeLabel(type)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="제목" htmlFor="title" required>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={MAX_TITLE_LENGTH}
          defaultValue={values.title}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <Field label="부제" htmlFor="subtitle">
        <input
          id="subtitle"
          name="subtitle"
          type="text"
          maxLength={MAX_SUBTITLE_LENGTH}
          defaultValue={values.subtitle}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <Field
        label="원본 주소"
        htmlFor="originalUrl"
        hint="http 또는 https로 시작하는 주소만 저장됩니다."
      >
        <input
          id="originalUrl"
          name="originalUrl"
          type="url"
          inputMode="url"
          maxLength={MAX_URL_LENGTH}
          placeholder="https://"
          defaultValue={values.originalUrl}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <Field label="설명" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={MAX_DESCRIPTION_LENGTH}
          defaultValue={values.description}
          className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          취소
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-black dark:text-zinc-50"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red-600 dark:text-red-400">*</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
