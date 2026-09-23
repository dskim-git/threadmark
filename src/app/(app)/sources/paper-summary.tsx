import Link from "next/link";

import { toDoiUrl } from "@/lib/papers/apa";
import type { PaperProfile } from "@/lib/papers/queries";

/**
 * 자료 상세에 보여주는 논문 정보. (설계 문서 8.1절)
 *
 * 참고문헌을 맨 위에 크게 둔다. 논문을 다시 찾아올 때 가장 자주 쓰는 것이
 * 그것이기 때문이다. 나머지 조각은 아래에 작게 둔다.
 *
 * 만들어진 것인지 고쳐 쓴 것인지를 밝힌다. 밝히지 않으면 나중에 조각을
 * 고쳤는데 참고문헌이 안 바뀌는 것을 보고 고장인 줄 알게 된다.
 */
export function PaperSummary({
  sourceId,
  profile,
  citation,
}: {
  sourceId: string;
  /** 아직 적지 않았으면 null. */
  profile: PaperProfile | null;
  citation: { text: string; edited: boolean } | null;
}) {
  const editHref = `/sources/${sourceId}/paper`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          논문 정보
        </h2>
        <Link
          href={editHref}
          className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {profile ? "고치기" : "적기"}
        </Link>
      </div>

      {profile && citation ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-zinc-500">
              참고문헌 · APA 7판
              {citation.edited ? " · 직접 고친 것" : ""}
            </p>
            {/*
              고를 수 있게 둔다. 이 글을 논문에 붙여넣는 것이 이 자리의 쓰임이다.
              기울임은 붙여넣은 곳에서 해야 한다. 서식까지 담으면 붙여넣는 곳마다
              다르게 깨진다.
            */}
            <p className="select-all text-sm leading-7 text-zinc-800 dark:text-zinc-200">
              {citation.text}
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="저자" value={authorSummary(profile)} />
            <Row
              label="발행 연도"
              value={profile.publicationYear?.toString() ?? null}
            />
            <Row label="학술지" value={profile.journalName} />
            <Row label="권·호·쪽" value={volumeSummary(profile)} />
            <Row label="ISSN" value={profile.issn} />
            {profile.doi ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-zinc-500">DOI</dt>
                <dd>
                  {/*
                    DOI는 우리가 10.으로 시작하는 알맹이만 담아둔 값이다.
                    주소는 여기서 만든다. 밖으로 나가는 링크라 referrer와
                    opener를 넘기지 않는다.
                  */}
                  <a
                    href={toDoiUrl(profile.doi)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                  >
                    {profile.doi}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>

          {profile.keywords.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {profile.keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full border border-black/[.08] px-3 py-1 text-xs text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          ) : null}

          {profile.abstract ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-zinc-500">
                초록
              </summary>
              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700 dark:text-zinc-300">
                {profile.abstract}
              </p>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-5 py-6 text-sm leading-6 text-zinc-500 dark:bg-white/[.04]">
          저자와 학술지를 적어두면 참고문헌이 만들어집니다. 나중에 표기를
          바꾸거나 오타를 고칠 때 조각만 고치면 됩니다.
        </p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

/**
 * 저자를 짧게 적는다.
 *
 * 참고문헌에 이미 전부 적혀 있으므로 여기서는 셋까지만 보여준다.
 * 같은 목록을 두 번 길게 보여주면 정작 봐야 할 것이 묻힌다.
 */
function authorSummary(profile: PaperProfile): string | null {
  if (profile.authors.length === 0) {
    return null;
  }

  const names = profile.authors.map((author) =>
    author.given ? `${author.family} ${author.given}` : author.family,
  );

  if (names.length <= 3) {
    return names.join(", ");
  }

  return `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}명`;
}

function volumeSummary(profile: PaperProfile): string | null {
  const parts: string[] = [];

  if (profile.volume) {
    parts.push(profile.issue ? `${profile.volume}(${profile.issue})` : profile.volume);
  } else if (profile.issue) {
    parts.push(`(${profile.issue})`);
  }

  if (profile.pageRange) {
    parts.push(profile.pageRange);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}
