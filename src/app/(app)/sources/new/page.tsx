import type { Metadata } from "next";

import { requireActiveAccount } from "@/lib/auth/account";
import { isSourceType } from "@/lib/sources/types";

import { createSource } from "../actions";
import { SourceForm } from "../source-form";

export const metadata: Metadata = {
  title: "자료 등록 · ThreadMark",
  description: "새 자료를 등록합니다.",
};

export default async function NewSourcePage({
  searchParams,
}: PageProps<"/sources/new">) {
  await requireActiveAccount("/sources/new");

  const params = await searchParams;
  const requestedType = firstValue(params.type);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          자료 등록
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          논문, 책, 웹사이트처럼 나중에 다시 찾아볼 자료를 등록합니다.
        </p>
      </header>

      <SourceForm
        action={createSource}
        submitLabel="등록"
        cancelHref="/library"
        errorMessage={firstValue(params.error)}
        values={{
          // 목록에서 유형을 고르고 들어온 경우 그 유형을 미리 선택해 둔다.
          type: isSourceType(requestedType) ? requestedType : "paper",
          title: "",
          subtitle: "",
          description: "",
          originalUrl: "",
        }}
      />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
