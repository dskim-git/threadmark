import type { Metadata } from "next";
import Link from "next/link";

import { AutoNotice } from "@/app/(app)/auto-notice";
import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";
import { listTagsWithCounts } from "@/lib/tags/queries";

import { deleteTag, renameTag } from "./actions";
import { TagName } from "./tag-name";

export const metadata: Metadata = {
  title: "태그 · ThreadMark",
  description: "붙여둔 태그를 모아 보고 이름을 고칩니다.",
};

/**
 * 태그 목록. (설계 문서 20-1절)
 *
 * 태그를 **다는** 곳은 자료와 기록 각각이다. 여기는 달아둔 것을 한눈에 보고
 * 정리하는 자리다. 둘을 갈라 둔 이유는, 다는 일은 읽는 흐름 안에서 일어나고
 * 정리하는 일은 어쩌다 한 번 마음먹고 하는 일이기 때문이다.
 *
 * 개수를 자료와 기록으로 나눠 보여준다. 합쳐서 세면 `수업 준비 3`을 자료
 * 목록에서 눌렀을 때 하나만 나오는 일이 생긴다. 무엇이 나올지 미리 알 수
 * 있어야 누를 마음이 든다.
 */
export default async function TagsPage({
  searchParams,
}: PageProps<"/tags">) {
  await requireActiveAccount("/tags");

  const params = await searchParams;
  const tags = await listTagsWithCounts();

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            태그
          </h1>
          <HelpButton topic="tags" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          자료와 기록에 붙인 이름표입니다. 태그는 자료 화면과 기록 카드에서
          답니다. 여기서는 모아 보고 이름을 고칩니다.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? <AutoNotice>{notice}</AutoNotice> : null}

      {tags.length > 0 ? (
        <ul className="flex flex-col">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-black/[.06] py-4 last:border-b-0 dark:border-white/[.08]"
            >
              {/*
                평소에는 글자로 보이고 `수정`을 눌러야 글상자가 된다.
                줄마다 글상자를 늘어놓으면 목록을 보러 온 사람에게
                "여기는 고치는 곳"이라고 말하는 화면이 된다. (tag-name.tsx)
              */}
              <TagName
                action={renameTag}
                tagId={tag.id}
                name={tag.name}
                returnTo="/tags"
              />

              <div className="flex shrink-0 items-center gap-3 text-xs">
                {/*
                  개수가 0이면 누를 수 없게 둔다. 눌러서 빈 목록을 보는 것은
                  얻는 것이 없다.
                */}
                {tag.sourceCount > 0 ? (
                  <Link
                    href={`/library?tag=${encodeURIComponent(tag.slug)}`}
                    className="text-accent underline underline-offset-4 dark:text-accent-dark"
                  >
                    자료 {tag.sourceCount}
                  </Link>
                ) : (
                  <span className="text-zinc-400">자료 0</span>
                )}

                {tag.captureCount > 0 ? (
                  <Link
                    href={`/inbox?tag=${encodeURIComponent(tag.slug)}`}
                    className="text-accent underline underline-offset-4 dark:text-accent-dark"
                  >
                    기록 {tag.captureCount}
                  </Link>
                ) : (
                  <span className="text-zinc-400">기록 0</span>
                )}

                {/*
                  지우면 달아둔 것이 함께 끊긴다. 무엇이 끊기는지 개수로
                  먼저 알린다. 되돌릴 수 없는 일이라 마우스를 올리면 한 번 더
                  말해준다.
                */}
                <form action={deleteTag}>
                  <input type="hidden" name="tagId" value={tag.id} />
                  <input type="hidden" name="returnTo" value="/tags" />
                  <button
                    type="submit"
                    title={
                      tag.sourceCount + tag.captureCount > 0
                        ? `자료 ${tag.sourceCount}건과 기록 ${tag.captureCount}건에서 이 태그가 떨어집니다. 자료와 기록 자체는 지워지지 않습니다.`
                        : "이 태그를 지웁니다."
                    }
                    className="font-medium text-red-700 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    지우기
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-6 py-12 text-center text-sm leading-6 text-zinc-500 dark:bg-white/[.04]">
          아직 붙인 태그가 없습니다. 자료를 열어 제목 아래에서, 또는 기록
          카드에서 달 수 있습니다.
        </p>
      )}
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
