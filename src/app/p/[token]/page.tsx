import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicProject } from "@/lib/sharing/queries";
import {
  WITHHELD_NOTICE,
  type PublicSource,
} from "@/lib/sharing/public-payload";

export const metadata: Metadata = {
  title: "공개된 프로젝트 · ThreadMark",
  /*
    **검색에 걸리지 않게 한다.**

    16-B.5절은 "링크를 아는 사람이면 누구나"라고 정했다. 그것은 **링크를
    받은 사람**이고, 검색으로 찾아오는 사람이 아니다. 열쇠를 따로 만든
    뜻이 검색 결과에 실리면 사라진다.

    끈 뒤에도 문제가 된다. 껐는데 검색 결과에 남아 있으면 끈 사람은
    닫혔다고 믿는데 제목과 요약이 계속 보인다.
  */
  robots: { index: false, follow: false },
};

/**
 * 링크로 공개된 프로젝트. (설계 문서 16-B절)
 *
 * **로그인하지 않아도 열린다.** 그래서 `(app)` 레이아웃 밖에 있다. 그
 * 레이아웃은 승인된 사용자만 통과시키므로, 안에 두면 링크를 받은 사람이
 * 로그인 화면으로 튕긴다.
 *
 * 무엇이 나오는가
 *   **내가 쓴 글과 서지 정보뿐이다.** 인용한 원문·번역문·초록과 올린
 *   파일은 나오지 않는다. 그 목록은 `src/lib/sharing/public-fields.ts`
 *   한 곳에 있고, 읽는 문(`public_project`)이 그 목록대로 칸을 고른다.
 *
 * 이 화면이 하는 일은 **그리는 것뿐이다.** 무엇을 보여줄지 고르지 않는다.
 * 화면이 고르기 시작하면 화면이 하나 늘 때 빠뜨린다. (16-B.8 2차례)
 */
export default async function PublicProjectPage({
  params,
}: PageProps<"/p/[token]">) {
  const { token } = await params;
  const project = await getPublicProject(token);

  /*
    **틀린 열쇠와 끈 열쇠와 지운 프로젝트를 구분하지 않는다.** 전부 404다.
    구분해 알리면 열쇠를 맞혀 보는 사람에게 "거의 맞았다"를 알려주는 셈이
    된다. (보안 원칙 9)
  */
  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
          >
            ThreadMark
          </Link>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            링크로 공개된 글
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {project.name}
        </h1>

        {project.description ? (
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {project.description}
          </p>
        ) : null}
      </header>

      {/*
        **무엇이 빠져 있는지 먼저 말한다.**

        보는 사람이 "자료는 있는데 왜 본문이 없지"를 묻기 전에 알려준다.
        그리고 올린 사람에게도 **무엇이 나갔는지**를 다시 보여주는 자리다.
      */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          이 글에는 공개한 사람이 직접 쓴 메모와 자료의 서지 정보만 담겨
          있습니다.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {WITHHELD_NOTICE.map((line) => (
            <li
              key={line}
              className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
            >
              {line}
            </li>
          ))}
        </ul>
      </section>

      {project.outline.length > 0 ? (
        <section className="mt-10 flex flex-col gap-6">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            뼈대와 원고
          </h2>

          {project.outline.map((node, index) => (
            <article
              /*
                **번호가 없어서 자리로 열쇠를 만든다.** 문이 번호를 돌려주지
                않는 것이 뜻한 바다. 목록의 순서와 깊이가 모양을 말한다.
              */
              key={`${index}-${node.depth}`}
              /* 깊이는 들여쓰기로 보인다. 지나치게 깊어도 읽히게 가둔다. */
              style={{ marginLeft: `${Math.min(node.depth, 6) * 16}px` }}
              className="flex flex-col gap-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800"
            >
              {node.title ? (
                <h3 className="text-sm font-medium text-black dark:text-zinc-50">
                  {node.title}
                </h3>
              ) : null}

              {node.body ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {node.body}
                </p>
              ) : null}

              {node.items.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {node.items.map((item, itemIndex) => (
                    <li
                      key={itemIndex}
                      className="rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900/40"
                    >
                      {item.sourceTitle ? (
                        <p className="font-medium text-zinc-700 dark:text-zinc-200">
                          {item.sourceTitle}
                        </p>
                      ) : null}
                      {item.captureContent ? (
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {item.captureContent}
                        </p>
                      ) : null}
                      {item.note ? (
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {item.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {project.sources.length > 0 ? (
        <section className="mt-10 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            담아둔 자료와 메모
          </h2>

          {project.sources.map((source, index) => (
            <SourceCard key={index} source={source} />
          ))}
        </section>
      ) : null}

      {project.notes.length > 0 ? (
        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            자료 없이 남긴 메모
          </h2>

          {project.notes.map((note, index) => (
            <p
              key={index}
              className="whitespace-pre-wrap rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
            >
              {note.content}
            </p>
          ))}
        </section>
      ) : null}

      <footer className="mt-12 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          이 페이지는 공개한 사람이 링크를 끄면 더 이상 열리지 않습니다.{" "}
          <Link href="/terms" className="underline">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline">
            개인정보 처리방침
          </Link>
          을 함께 보실 수 있습니다.
        </p>
      </footer>
    </div>
  );
}

/**
 * 자료 하나와 그에 붙인 메모.
 *
 * **서지는 있는 것만 보여준다.** 유형마다 담기는 칸이 달라서 빈 줄이 쉽게
 * 생기고, 빈 줄이 늘면 "담긴 것이 없다"처럼 보인다.
 */
function SourceCard({ source }: { source: PublicSource }) {
  const facts = Object.values(source.profiles)
    .filter((profile): profile is Record<string, unknown> => profile !== null)
    .flatMap((profile) => Object.entries(profile))
    .map(([, value]) => formatFact(value))
    .filter((value): value is string => value !== null);

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium text-black dark:text-zinc-50">
        {source.title ?? "제목 없는 자료"}
      </h3>

      {source.subtitle ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {source.subtitle}
        </p>
      ) : null}

      {facts.length > 0 ? (
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {facts.join(" · ")}
        </p>
      ) : null}

      {source.description ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {source.description}
        </p>
      ) : null}

      {source.captures.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2">
          {source.captures.map((note, index) => (
            <li
              key={index}
              className="whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200"
            >
              {note.content}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * 서지 값 하나를 사람이 읽을 한 조각으로.
 *
 * **지어내지 않는다.** 글자와 숫자와 글자 배열만 보여주고, 모양을 모르는
 * 것(객체 같은 것)은 버린다. 저자 목록은 `[{family, given}]` 모양이라
 * 여기서 다루지 않고 버린다. 그 모양을 아는 곳이 따로 있다.
 */
function formatFact(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();

    return text.length > 0 ? text : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return parts.length > 0 ? parts.join(", ") : null;
  }

  return null;
}
