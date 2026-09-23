import type { Metadata } from "next";
import Link from "next/link";

import { requireActiveAccount } from "@/lib/auth/account";
import { countCaptures } from "@/lib/captures/queries";
import { getDriveConnectionSummary } from "@/lib/drive/connection";
import { countProjects } from "@/lib/projects/queries";
import { listSources } from "@/lib/sources/queries";
import { getSourceTypeLabel, isReadingCandidate } from "@/lib/sources/types";

export const metadata: Metadata = {
  title: "홈 · ThreadMark",
  description: "담아둔 것과 이어서 할 일을 봅니다.",
};

/**
 * 보호된 앱 영역의 첫 화면.
 *
 * 레이아웃이 이미 확인했더라도 페이지에서 다시 확인한다.
 * 레이아웃의 실행 시점에 의존하지 않기 위해서다. (보안 원칙 5)
 *
 * 8단계에서 만든 그대로 "Source와 Capture 기능은 아직 구현 중입니다"가 오래
 * 남아 있었다. 14단계까지 만들어 놓고 로그인해서 처음 보는 화면이 그 말을
 * 하고 있었다. 자료가 있을 때는 목록으로 바로 넘어가니 덜 보였는데,
 * 비어 있을 때는 여기 머무르게 된다.
 *
 * 이 화면이 답해야 하는 것은 둘이다.
 *   무엇이 담겨 있는가
 *   지금 무엇을 하면 되는가
 *
 * 비어 있을 때 두 번째가 특히 중요하다. 빈 화면 앞에서 무엇부터 할지
 * 모르면 그대로 닫게 된다.
 */
export default async function HomePage() {
  const account = await requireActiveAccount("/home");

  const [sources, captureCount, projectCount, drive] = await Promise.all([
    listSources(),
    countCaptures(),
    countProjects(),
    getDriveConnectionSummary(account.userId),
  ]);

  const recent = sources.slice(0, 5);
  const empty = sources.length === 0 && captureCount === 0;
  const driveConnected = drive?.status === "connected";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-black dark:text-zinc-50">
          {account.displayName
            ? `${account.displayName}님, 오늘은 무엇을 읽으셨나요`
            : "오늘은 무엇을 읽으셨나요"}
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          읽은 것과 그때 떠오른 생각을 남겨 두면, 나중에 출처와 함께 다시
          꺼내 쓸 수 있습니다.
        </p>
      </header>

      {/* 담긴 것. 숫자만 보여주고 각각 그 목록으로 간다. */}
      <section className="grid grid-cols-3 gap-3">
        <CountCard href="/library" label="자료" count={sources.length} />
        <CountCard href="/inbox" label="기록" count={captureCount} />
        <CountCard href="/projects" label="프로젝트" count={projectCount} />
      </section>

      {empty ? (
        /*
          비어 있을 때. 순서대로 하면 되는 세 가지를 보여준다.
          Drive 연결은 이미 되어 있으면 지운다. 끝난 일을 할 일로 두면
          목록 전체를 믿지 않게 된다.
        */
        <section className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            무엇부터 하면 되나요
          </h2>

          <ol className="flex flex-col gap-4">
            {driveConnected ? null : (
              <Step
                n={1}
                href="/settings/integrations"
                title="Google Drive를 연결합니다"
                description="PDF는 선생님의 Drive에 보관됩니다. 연결하지 않아도 주소와 메모는 남길 수 있습니다."
              />
            )}
            <Step
              n={driveConnected ? 1 : 2}
              href="/sources/new"
              title="자료를 하나 담습니다"
              description="논문이라면 PDF를 함께 올리면 앱 안에서 바로 읽을 수 있습니다."
            />
            <Step
              n={driveConnected ? 2 : 3}
              href="/inbox"
              title="떠오른 것을 적습니다"
              description="자료에 붙이지 않은 생각도 그대로 남길 수 있습니다."
            />
          </ol>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              최근에 담은 것
            </h2>
            <Link
              href="/library"
              className="text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
            >
              모두 보기
            </Link>
          </div>

          <ul className="flex flex-col">
            {recent.map((source) => (
              <li
                key={source.id}
                className="border-b border-black/[.06] last:border-b-0 dark:border-white/[.08]"
              >
                <Link
                  href={`/sources/${source.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 transition-colors hover:text-accent dark:hover:text-accent-dark"
                >
                  <span className="text-xs text-zinc-500">
                    {getSourceTypeLabel(source.type)}
                  </span>
                  <span className="text-sm text-black dark:text-zinc-50">
                    {source.title}
                  </span>
                  {isReadingCandidate(source.status) ? (
                    <span className="text-xs text-accent dark:text-accent-dark">
                      읽을 후보
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!empty && !driveConnected ? (
        <p className="rounded-2xl border border-black/[.08] bg-white px-5 py-4 text-sm leading-6 text-zinc-600 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-400">
          Google Drive를 연결하면 PDF를 올리고 앱 안에서 읽을 수 있습니다.{" "}
          <Link
            href="/settings/integrations"
            className="text-accent underline underline-offset-2 dark:text-accent-dark"
          >
            연결하기
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function CountCard({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl border border-black/[.08] bg-white px-5 py-4 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
    >
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-serif text-2xl text-black dark:text-zinc-50">
        {count}
      </span>
    </Link>
  );
}

function Step({
  n,
  href,
  title,
  description,
}: {
  n: number;
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-xs text-accent dark:bg-accent-dark-soft dark:text-accent-dark"
      >
        {n}
      </span>
      <span className="flex flex-col gap-1">
        <Link
          href={href}
          className="w-fit text-sm font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
        >
          {title}
        </Link>
        <span className="text-xs leading-5 text-zinc-500">{description}</span>
      </span>
    </li>
  );
}
