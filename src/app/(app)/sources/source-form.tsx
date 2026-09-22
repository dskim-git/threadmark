import Link from "next/link";

import { SourceFields, type SourceFieldValues } from "./source-fields";

export type SourceFormValues = SourceFieldValues & {
  id?: string;
};

/**
 * 자료 수정 폼.
 *
 * 입력 칸은 source-fields.tsx가 만든다. 여기서는 form과 버튼만 둔다.
 *
 * 자료 등록은 이 폼을 쓰지 않는다. 파일을 함께 올릴 수 있어야 하는데,
 * 그러려면 "자료를 만든 다음 그 자료에 파일을 붙이는" 순서를 브라우저가
 * 직접 다뤄야 한다. 그쪽은 new-source-form.tsx에 있다.
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

      <SourceFields values={values} />

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
