import type { Metadata } from "next";

import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import { isSourceType } from "@/lib/sources/types";

import { NewSourceForm } from "../new-source-form";

export const metadata: Metadata = {
  title: "자료 등록 · ThreadMark",
  description: "새 자료를 등록합니다.",
};

export default async function NewSourcePage({
  searchParams,
}: PageProps<"/sources/new">) {
  const account = await requireActiveAccount("/sources/new");

  const params = await searchParams;
  const requestedType = firstValue(params.type);

  // Drive가 연결되어 있을 때만 파일 고르기를 보여준다.
  // 연결되지 않았으면 안내만 두고, 자료 등록 자체는 그대로 할 수 있게 한다.
  // (설계 문서 10.4절: Drive가 없어도 URL과 텍스트 메모는 쓸 수 있다)
  const driveConnection = await getDriveConnectionSummary(account.userId);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            자료 등록
          </h1>
          <HelpButton topic="source-new" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          논문, 책, 웹사이트처럼 나중에 다시 찾아볼 자료를 등록합니다. PDF나
          이미지가 있다면 함께 올릴 수 있습니다.
        </p>
      </header>

      <NewSourceForm
        driveConnected={driveConnection?.status === "connected"}
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
