import Link from "next/link";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TYPE_LENGTH,
} from "@/lib/projects/schema";

import { PROJECT_TEMPLATES } from "@/lib/projects/templates";

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
  showTemplates = false,
}: {
  action: (formData: FormData) => Promise<void>;
  values: ProjectFormValues;
  submitLabel: string;
  cancelHref: string;
  errorMessage?: string;
  /**
   * 시작 서식을 고르는 칸을 보여줄지.
   *
   * **만들 때만 보여준다.** 이미 만든 프로젝트에 서식을 얹는 길은 두지
   * 않았다. 있는 자리와 어떻게 섞을 것인가를 추측으로 정하게 된다.
   * (설계 문서 7.3-1절)
   */
  showTemplates?: boolean;
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

      {/*
        시작 서식.

        고르면 자리 몇 개가 미리 만들어진다. **시작점이지 울타리가 아니다.**
        만든 뒤에는 전부 고치고 지우고 더할 수 있고, 깊이에도 한계가 없다.

        고른 서식의 이름은 아래 `유형` 칸이 비어 있을 때만 그리로 들어간다.
        적어 넣은 값을 덮지 않는다. 그 판단은 서버가 한다.
      */}
      {showTemplates ? (
        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="pb-1 text-sm font-medium text-black dark:text-zinc-50">
            어떤 일인가요
          </legend>
          <p className="pb-2 text-xs leading-5 text-zinc-500">
            고르면 뼈대의 첫 자리들을 만들어 둡니다. 나중에 얼마든지 고치고
            더할 수 있습니다.
          </p>

          {PROJECT_TEMPLATES.map((template, index) => (
            <label
              key={template.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[.08] px-4 py-3 transition-colors hover:border-black/20 has-checked:border-accent dark:border-white/[.145] dark:hover:border-white/30 dark:has-checked:border-accent-dark"
            >
              <input
                type="radio"
                name="templateId"
                value={template.id}
                defaultChecked={index === 0}
                className="mt-1 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  {template.name}
                </span>
                <span className="text-xs leading-5 text-zinc-500">
                  {template.summary}
                </span>
                {template.outline.length > 0 ? (
                  <span className="text-xs leading-5 text-zinc-500">
                    {template.outline.map((seed) => seed.title).join(" · ")}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <Field
        label="유형"
        htmlFor="projectType"
        hint={
          showTemplates
            ? "비워 두면 위에서 고른 서식의 이름이 들어갑니다."
            : "논문, 수업, 연수처럼 자유롭게 적습니다."
        }
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
