import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { getSourceById } from "@/lib/sources/queries";

import { updateSource } from "../../actions";
import { SourceForm } from "../../source-form";

export const metadata: Metadata = {
  title: "자료 수정 · ThreadMark",
};

export default async function EditSourcePage({
  params,
  searchParams,
}: PageProps<"/sources/[id]/edit">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  if (!source) {
    notFound();
  }

  const query = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={`/sources/${source.id}`}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 자료로 돌아가기
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          자료 수정
        </h1>
      </header>

      <SourceForm
        action={updateSource}
        submitLabel="저장"
        cancelHref={`/sources/${source.id}`}
        errorMessage={firstValue(query.error)}
        values={{
          id: source.id,
          type: source.type,
          title: source.title,
          subtitle: source.subtitle ?? "",
          description: source.description ?? "",
          originalUrl: source.originalUrl ?? "",
        }}
      />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
