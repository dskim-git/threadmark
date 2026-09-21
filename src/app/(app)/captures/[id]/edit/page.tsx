import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getCaptureById } from "@/lib/captures/queries";

import { updateCapture } from "../../actions";
import { CaptureForm } from "../../capture-form";

export const metadata: Metadata = {
  title: "기록 수정 · ThreadMark",
};

export default async function EditCapturePage({
  params,
  searchParams,
}: PageProps<"/captures/[id]/edit">) {
  await requireActiveAccount();

  const { id } = await params;
  const capture = await getCaptureById(id);

  // 없는 기록과 남의 기록을 구분하지 않는다.
  if (!capture) {
    notFound();
  }

  const query = await searchParams;
  const backHref = capture.sourceId ? `/sources/${capture.sourceId}` : "/inbox";

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={backHref}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {capture.sourceId ? "자료로 돌아가기" : "빠른 기록으로 돌아가기"}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          기록 수정
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          연결된 자료는 바꿀 수 없습니다. 기록이 어디에 달렸는지는 만들 때
          정해집니다.
        </p>
      </header>

      <CaptureForm
        action={updateCapture}
        submitLabel="저장"
        returnTo={backHref}
        errorMessage={firstValue(query.error)}
        values={{
          id: capture.id,
          sourceId: capture.sourceId,
          captureType: capture.captureType,
          content: capture.content ?? "",
          originalText: capture.originalText ?? "",
          translatedText: capture.translatedText ?? "",
          translationLanguage: capture.translationLanguage ?? "",
        }}
      />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
