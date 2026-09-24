import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getCaptureById } from "@/lib/captures/queries";

import { updateCapture } from "../../actions";
import { NodePicker } from "@/app/(app)/projects/node-picker";
import { PlacedWhere } from "@/app/(app)/projects/placed-where";

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

      {/*
        이 기록을 프로젝트의 어느 자리에 놓을지. (19-B 뒤)

        고치는 화면에 두는 이유는, **글을 다듬는 동안이 "이걸 어디에 쓸까"가
        떠오르는 때**이기 때문이다. 목록에서도 놓을 수 있지만 거기서는 글
        전체가 보이지 않는다.

        폼 밖에 둔다. 폼 안에 두면 자리를 고르는 단추가 기록 저장으로
        읽힐 수 있고, 아직 저장하지 않은 글이 사라진다.
      */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-black/[.12] px-5 py-4 dark:border-white/[.18]">
        <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          이 기록을 프로젝트의 어느 자리에 쓸지 정해둘 수 있습니다.
        </p>
        <PlacedWhere captureId={capture.id} />
        <NodePicker
          item={`capture:${capture.id}`}
          returnTo={`/captures/${capture.id}/edit`}
          label="자리에 놓기 →"
        />
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
