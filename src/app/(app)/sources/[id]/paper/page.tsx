import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account";
import { buildCitation, getPaperProfile } from "@/lib/papers/queries";
import { formatAuthorsInput } from "@/lib/papers/schema";
import {
  MAX_ABSTRACT_LENGTH,
  MAX_CITATION_LENGTH,
  MAX_DOI_LENGTH,
  MAX_JOURNAL_NAME_LENGTH,
  MAX_PUBLICATION_YEAR,
  MIN_PUBLICATION_YEAR,
  PAPER_LANGUAGES,
} from "@/lib/papers/types";
import { getSourceById } from "@/lib/sources/queries";

import { savePaperProfile } from "../../paper-actions";
import { Field } from "../../source-fields";

export const metadata: Metadata = {
  title: "논문 정보 · ThreadMark",
};

/**
 * 논문 서지 정보를 적는 화면. (설계 문서 8.1절)
 *
 * 제목과 원본 주소는 여기에 없다. 자료 수정 화면에 이미 있고, 두 곳에서
 * 고칠 수 있으면 어느 쪽이 맞는지 알 수 없게 된다. 여기에는 논문에만 있는 것만 둔다.
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

  const [profile, query] = await Promise.all([
    getPaperProfile(source.id),
    searchParams,
  ]);

  const error = firstValue(query.error);

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

      <form action={savePaperProfile} className="flex flex-col gap-6">
        <input type="hidden" name="sourceId" value={source.id} />

        <Field
          label="저자"
          htmlFor="authors"
          hint="한 줄에 한 사람. 쉼표가 있으면 앞이 성, 뒤가 이름입니다. 예: Kim, Daesoo / 김대수 / 한국교육과정평가원"
        >
          <textarea
            id="authors"
            name="authors"
            rows={4}
            defaultValue={profile ? formatAuthorsInput(profile.authors) : ""}
            placeholder={"Kim, Daesoo\n이서연"}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field
          label="원문 언어"
          htmlFor="originalLanguage"
          hint="참고문헌 표기가 달라집니다. 한국어는 이름을 그대로 적고, 영어는 Kim, D. 처럼 줄입니다."
        >
          <select
            id="originalLanguage"
            name="originalLanguage"
            defaultValue={profile?.originalLanguage ?? ""}
            className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          >
            <option value="">고르지 않음</option>
            {PAPER_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="발행 연도"
            htmlFor="publicationYear"
            hint="모르면 비워둡니다. 참고문헌에 n.d.로 적힙니다."
          >
            <input
              id="publicationYear"
              name="publicationYear"
              type="number"
              inputMode="numeric"
              min={MIN_PUBLICATION_YEAR}
              max={MAX_PUBLICATION_YEAR}
              defaultValue={profile?.publicationYear ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="학술지명" htmlFor="journalName">
            <input
              id="journalName"
              name="journalName"
              type="text"
              maxLength={MAX_JOURNAL_NAME_LENGTH}
              defaultValue={profile?.journalName ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="권" htmlFor="volume">
            <input
              id="volume"
              name="volume"
              type="text"
              maxLength={50}
              defaultValue={profile?.volume ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="호" htmlFor="issue">
            <input
              id="issue"
              name="issue"
              type="text"
              maxLength={50}
              defaultValue={profile?.issue ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="쪽" htmlFor="pageRange" hint="예: 45-67">
            <input
              id="pageRange"
              name="pageRange"
              type="text"
              maxLength={50}
              defaultValue={profile?.pageRange ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="DOI"
            htmlFor="doi"
            hint="주소째 붙여넣어도 됩니다. 10.으로 시작하는 부분만 담습니다."
          >
            <input
              id="doi"
              name="doi"
              type="text"
              maxLength={MAX_DOI_LENGTH}
              placeholder="10.1234/abcd"
              defaultValue={profile?.doi ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="ISSN" htmlFor="issn">
            <input
              id="issn"
              name="issn"
              type="text"
              maxLength={20}
              defaultValue={profile?.issn ?? ""}
              className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <Field
          label="키워드"
          htmlFor="keywords"
          hint="쉼표로 나눕니다. 초록에서 그대로 복사해 붙여도 됩니다."
        >
          <input
            id="keywords"
            name="keywords"
            type="text"
            defaultValue={profile?.keywords.join(", ") ?? ""}
            className="h-11 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field label="초록" htmlFor="abstract">
          <textarea
            id="abstract"
            name="abstract"
            rows={6}
            maxLength={MAX_ABSTRACT_LENGTH}
            defaultValue={profile?.abstract ?? ""}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field
          label="참고문헌 직접 쓰기"
          htmlFor="citationOverride"
          hint="비워두면 위의 조각으로 만듭니다. 만들어진 것이 어색할 때만 적습니다. 여기에 적으면 조각을 고쳐도 이 글이 그대로 쓰입니다."
        >
          <textarea
            id="citationOverride"
            name="citationOverride"
            rows={3}
            maxLength={MAX_CITATION_LENGTH}
            defaultValue={profile?.citationOverride ?? ""}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>
          <Link
            href={`/sources/${source.id}`}
            className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
