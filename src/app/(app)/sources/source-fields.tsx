import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/sources/schema";
import { SOURCE_TYPES, getSourceTypeLabel } from "@/lib/sources/types";
import type { SourceType } from "@/lib/sources/types";

/**
 * 자료의 입력 칸들.
 *
 * 세 화면이 같은 칸을 쓴다. 등록, 수정, 그리고 파일과 함께 등록하는 화면이다.
 * 한 곳에 두지 않으면 칸 하나를 고칠 때 세 군데를 고쳐야 하고,
 * 그중 하나를 빠뜨리면 화면마다 저장되는 값이 달라진다.
 *
 * 이 컴포넌트는 form 태그를 만들지 않는다. 감싸는 쪽이 정한다.
 * 등록·수정은 Server Action에 그대로 넘기고, 파일과 함께 등록하는 화면은
 * 브라우저에서 순서를 직접 다뤄야 하기 때문이다.
 *
 * 입력 한계는 검증 스키마의 상수를 그대로 가져온다. 화면과 서버가 다른 숫자를
 * 쓰면 사용자는 입력이 되는데 저장이 안 되는 상황을 겪는다.
 */

export type SourceFieldValues = {
  type: SourceType;
  title: string;
  subtitle: string;
  description: string;
  originalUrl: string;
};

export function SourceFields({
  values,
  disabled,
}: {
  values: SourceFieldValues;
  disabled?: boolean;
}) {
  return (
    <>
      <Field label="자료 유형" htmlFor="type">
        <select
          id="type"
          name="type"
          defaultValue={values.type}
          disabled={disabled}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
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
          disabled={disabled}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <Field label="부제" htmlFor="subtitle">
        <input
          id="subtitle"
          name="subtitle"
          type="text"
          maxLength={MAX_SUBTITLE_LENGTH}
          defaultValue={values.subtitle}
          disabled={disabled}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
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
          disabled={disabled}
          className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>

      <Field label="설명" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={MAX_DESCRIPTION_LENGTH}
          defaultValue={values.description}
          disabled={disabled}
          className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
      </Field>
    </>
  );
}

export function Field({
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
