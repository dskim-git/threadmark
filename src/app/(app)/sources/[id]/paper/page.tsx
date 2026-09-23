import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { isAiExtractConfigured } from "@/lib/papers/ai-extract";
import { buildCitation, getPaperProfile } from "@/lib/papers/queries";
import { formatAuthorsInput } from "@/lib/papers/schema";
import { isReadable, listSourceFiles } from "@/lib/sources/files";
import { getSourceById } from "@/lib/sources/queries";

import { PaperForm } from "../../paper-form";

export const metadata: Metadata = {
  title: "논문 정보 · ThreadMark",
};

/**
 * 논문 서지 정보를 적는 화면. (설계 문서 8.1절, 8.5절)
 *
 * 제목과 원본 주소는 여기에 없다. 자료 수정 화면에 이미 있고, 두 곳에서
 * 고칠 수 있으면 어느 쪽이 맞는지 알 수 없게 된다. 여기에는 논문에만 있는 것만 둔다.
 *
 * 가져오기로 제목이 함께 와도 마찬가지다. 바로 바꾸지 않고 "제목도 바꿀까요"를
 * 눈에 보이게 묻는다. 그 물음에 답해야만 sources의 제목이 움직인다.
 *
 * 참고문헌 입력란을 맨 아래에 둔 이유가 있다. 비워두는 것이 기본이기
 * 때문이다. 위의 조각들을 적으면 참고문헌은 저절로 만들어진다.
 * 맨 위에 두면 "여기에 참고문헌을 적는 화면"으로 읽히고, 그러면 조각을
 * 적지 않게 된다. 조각이 없으면 나중에 표기를 고칠 방법도 없어진다.
 */
export default async function PaperProfilePage({
  params,
  searchParams,
}: PageProps<"/sources/[id]/paper">) {
  await requireActiveAccount();

  const { id } = await params;
  const source = await getSourceById(id);

  // 없는 자료와 남의 자료를 구분하지 않는다. (보안 원칙 9)
  if (!source) {
    notFound();
  }

  /*
    논문이 아닌 자료에는 이 화면을 열지 않는다.
    404로 처리하지 않는 이유는, 사용자의 자료가 맞기 때문이다.
    없는 것처럼 굴면 자기 자료를 잃은 줄 안다.
  */
  if (source.type !== "paper") {
    redirect(
      `/sources/${source.id}?notice=${encodeURIComponent(
        "논문 유형의 자료에만 서지 정보를 적을 수 있습니다.",
      )}`,
    );
  }

  const [profile, files, query] = await Promise.all([
    getPaperProfile(source.id),
    listSourceFiles(source.id),
    searchParams,
  ]);

  const error = firstValue(query.error);

  // 읽을 수 있는 PDF가 있을 때만 `PDF에서 찾기`를 보여준다.
  const pdf = files.find(isReadable) ?? null;

  const citation = profile
    ? buildCitation(profile, {
        title: source.title,
        originalUrl: source.originalUrl,
      })
    : null;

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-sm">
        <Link
          href={`/sources/${source.id}`}
          className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {source.title}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          논문 정보
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          적어둔 조각으로 참고문헌을 만듭니다. 나중에 표기를 바꾸거나 오타를
          고칠 때, 참고문헌을 하나씩 고치는 대신 조각만 고치면 됩니다.
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

      {citation ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-zinc-50 p-5 dark:border-white/[.145] dark:bg-white/[.04]">
          <h2 className="text-xs font-medium text-zinc-500">
            지금 만들어지는 참고문헌
            {citation.edited ? " · 직접 고친 것" : ""}
          </h2>
          <p className="text-sm leading-7 text-zinc-800 dark:text-zinc-200">
            {citation.text}
          </p>
        </section>
      ) : null}

      <PaperForm
        sourceId={source.id}
        currentTitle={source.title}
        pdfFileId={pdf?.id ?? null}
        /*
          AI를 쓸 수 있는지는 서버만 안다. API 키가 있는지를 브라우저에
          내려보내지 않고, "쓸 수 있는가"만 내려보낸다. (13-C와 같다)
        */
        aiEnabled={isAiExtractConfigured()}
        initial={{
          authors: profile ? formatAuthorsInput(profile.authors) : "",
          publicationYear: profile?.publicationYear?.toString() ?? "",
          journalName: profile?.journalName ?? "",
          volume: profile?.volume ?? "",
          issue: profile?.issue ?? "",
          pageRange: profile?.pageRange ?? "",
          doi: profile?.doi ?? "",
          issn: profile?.issn ?? "",
          abstract: profile?.abstract ?? "",
          keywords: profile?.keywords.join(", ") ?? "",
          originalLanguage: profile?.originalLanguage ?? "",
          citationOverride: profile?.citationOverride ?? "",
        }}
      />
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
