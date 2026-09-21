import Link from "next/link";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TYPE_LENGTH,
} from "@/lib/projects/schema";

import { ColorField } from "./color-field";
import { DateField } from "./date-field";

export type ProjectFormValues = {
  id?: string;
  name: string;
  projectType: string;
  description: string;
  researchQuestion: string;
  targetOutput: string;
  startDate: string;
  endDate: string;
  color: string;
};

/**
 * 프로젝트 등록과 수정이 같은 폼을 쓴다.
 *
 * 이름만 필수다. 나머지는 프로젝트를 진행하면서 채워 넣는 값이라
 * 처음부터 모두 요구하면 시작 자체가 번거로워진다.
 */
export function ProjectForm({
  action,
  values,
  submitLabel,
  cancelHref,
  errorMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  values: ProjectFormValues;
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

      <Field label="프로젝트 이름" htmlFor="name" required>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={MAX_NAME_LENGTH}
          defaultValue={values.name}
          className={inputClass}
        />
      </Field>

      <Field
        label="유형"
        htmlFor="projectType"
        hint="논문, 수업, 연수처럼 자유롭게 적습니다."
      >
        <input
          id="projectType"
          name="projectType"
          type="text"
          maxLength={MAX_TYPE_LENGTH}
          defaultValue={values.projectType}
          className={inputClass}
        />
      </Field>

      <ColorField value={values.color} />

      <div className="grid gap-6 sm:grid-cols-2">
        <DateField
          id="startDate"
          name="startDate"
          label="시작일"
          defaultValue={values.startDate}
        />
        <DateField
          id="endDate"
          name="endDate"
          label="종료일"
          defaultValue={values.endDate}
        />
      </div>

      <Field label="설명" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={MAX_DESCRIPTION_LENGTH}
          defaultValue={values.description}
          className={textareaClass}
        />
      </Field>

      <Field
        label="연구 질문"
        htmlFor="researchQuestion"
        hint="이 프로젝트로 무엇을 밝히려 하는지 적습니다."
      >
        <textarea
          id="researchQuestion"
          name="researchQuestion"
          rows={3}
          maxLength={MAX_LONG_TEXT_LENGTH}
          defaultValue={values.researchQuestion}
          className={textareaClass}
        />
      </Field>

      <Field
        label="목표 산출물"
        htmlFor="targetOutput"
        hint="논문 초고, 수업 자료처럼 최종적으로 만들 것을 적습니다."
      >
        <textarea
          id="targetOutput"
          name="targetOutput"
          rows={3}
          maxLength={MAX_LONG_TEXT_LENGTH}
          defaultValue={values.targetOutput}
          className={textareaClass}
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

const inputClass =
  "h-11 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";

const textareaClass =
  "w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";

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
