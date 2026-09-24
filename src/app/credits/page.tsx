import type { Metadata } from "next";
import Link from "next/link";

import { getAccount } from "@/lib/auth/account";
import {
  ATTRIBUTIONS,
  ATTRIBUTION_LOGO_HEIGHT,
} from "@/lib/legal/attribution";

export const metadata: Metadata = {
  title: "출처 표기 · ThreadMark",
  description: "ThreadMark가 자료를 가져오는 곳과 그 표기입니다.",
};

/**
 * 출처 표기. (설계 문서 15.1절)
 *
 * **이 화면은 약속을 지키려고 있다.** TMDB API를 쓰는 조건이 로고와 링크와
 * 고지 문구를 함께 보여주는 것이고, 그것을 놓을 자리가 필요했다.
 *
 * **로그인하지 않아도 볼 수 있다.** `/guide`·`/privacy`와 같은 자리다.
 * 표기는 누구에게나 보여야 하는 것이지 회원에게만 보일 것이 아니다.
 * 데이터베이스에서 아무것도 읽지 않는다.
 *
 * 글과 주소는 `src/lib/legal/attribution.ts` 한 곳에 있고, 검사가 그것과
 * 이 화면을 함께 붙잡는다. (`tests/attribution-coverage.test.mjs`)
 */
export default async function CreditsPage() {
  const account = await getAccount();

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

          <Link
            href={account ? "/home" : "/login"}
            className="h-9 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-xs font-medium leading-9 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {account ? "앱으로 돌아가기" : "로그인"}
          </Link>
        </div>

        <h1 className="text-3xl leading-tight text-black dark:text-zinc-50">
          출처 표기
        </h1>
        <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-400">
          ThreadMark는 자료의 정보를 밖의 서비스에서 가져옵니다. 그중 표기를
          조건으로 하는 곳을 여기에 밝힙니다. 우리가 어떤 정보를 어디로
          보내는지는{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-black dark:hover:text-zinc-50"
          >
            개인정보 처리방침
          </Link>
          에 적어 두었습니다.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-6">
        {ATTRIBUTIONS.map((item) => (
          <section
            key={item.id}
            className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
          >
            {/*
              **로고를 우리 이름보다 덜 두드러지게 놓는다.** (15.1절)
              그래서 제목 자리가 아니라 본문 안에 작게 둔다. 색과 비율은
              건드리지 않는다. 공식 파일 그대로다.
            */}
            <a
              href={item.siteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="w-fit"
            >
              {/*
                `next/image`를 쓰지 않는다. 이 그림은 SVG이고, Next의 그림
                처리기는 SVG를 기본적으로 거부한다. 켜는 설정이 있지만
                **우리가 직접 넣은 파일 하나 때문에 그 문을 열 이유가 없다.**
                앱의 다른 밖그림도 같은 이유로 `img`를 쓴다. (source-thumb.tsx)
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.logoSrc}
                alt={item.logoAlt}
                style={{ height: ATTRIBUTION_LOGO_HEIGHT, width: "auto" }}
              />
            </a>

            <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-300">
              {item.role}
            </p>

            {/*
              고지 문구. **번역하거나 고치지 않고 그대로 보여준다.** (15.1절)

              이 저장소의 글이 전부 한글이라 이 한 줄만 영문으로 남는 것이
              어색해 보이는데, 그 어색함이 지켜야 할 모양이다. 검사가 글자
              그대로 견준다.
            */}
            <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-7 text-zinc-800 dark:bg-white/[.04] dark:text-zinc-200">
              {item.notice}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
              <a
                href={item.siteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-black dark:hover:text-zinc-200"
              >
                {item.name} 웹사이트 →
              </a>
              <a
                href={item.termsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-black dark:hover:text-zinc-200"
              >
                표기 조건 →
              </a>
            </div>
          </section>
        ))}
      </div>

      {/*
        보증받은 것처럼 보이지 않게 한다. (15.1절 표시 원칙)

        로고가 나란히 놓이면 "이 서비스들과 함께 만든 것"처럼 읽힐 수 있다.
        그렇지 않다는 것을 우리 말로도 한 번 적는다. 위의 고지 문구는
        TMDB가 정한 것이고 이 줄은 우리가 적는 것이다.
      */}
      <p className="mt-8 text-xs leading-6 text-zinc-500">
        위의 서비스들은 ThreadMark를 보증하거나 인증하지 않습니다. ThreadMark가
        그 서비스들의 공개된 자료를 가져다 쓰고 있을 뿐입니다.
      </p>
    </div>
  );
}
