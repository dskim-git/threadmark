import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { AutoNotice } from "@/app/(app)/auto-notice";
import { unpublishProject } from "@/app/(app)/projects/share-actions";
import { requireActiveAccount } from "@/lib/auth/account";
import { originFromHeaders } from "@/lib/auth/request-url";
import { listLiveShares } from "@/lib/sharing/queries";

export const metadata: Metadata = {
  title: "공유",
  description: "지금 링크로 공개하고 있는 것을 모아 봅니다.",
};

/**
 * 지금 무엇이 공개되어 있는가. (설계 문서 21절의 `/shared`, 19-G)
 *
 * 왜 이 화면이 생겼나
 *   공개하는 일은 프로젝트 화면이 한다. 그런데 **공개한 다음 날 그
 *   프로젝트를 다시 열어볼 까닭이 없다.** 켜 둔 것이 있는지를 아무도
 *   보지 않게 된다.
 *
 *   003 결과 표의 `지금_공개중`이 2026-10-06부터 이틀 동안 `1`이었다.
 *   두 번 말씀드렸는데도 그대로였다. **끄는 길이 어려워서가 아니라 보이는
 *   자리가 없어서다.** 검사 글에만 보이고 앱에는 안 보이는 값이 하나
 *   있었다. (`docs/VERIFICATION.md` 4-82절)
 *
 *   블루프린트 21절에 경로와 메뉴 이름이 처음부터 적혀 있었는데 설명이
 *   없어 오래 눈에 띄지 않았다.
 *
 * 꺼진 것은 안 보여준다
 *   이 화면이 답하는 물음은 **"지금 무엇이 열려 있는가"** 하나다. 언제
 *   켜고 껐는지는 프로젝트 화면이 보여준다. 둘을 한 목록에 섞으면
 *   **지금 열린 것이 몇 개인지 세어야 알게 된다.**
 */
export default async function SharedPage({
  searchParams,
}: PageProps<"/shared">) {
  await requireActiveAccount("/shared");

  const [params, requestHeaders, shares] = await Promise.all([
    searchParams,
    headers(),
    listLiveShares(),
  ]);

  /*
    주소는 요청에서 읽는다. 로컬과 배포가 각각 다른 주소를 쓴다.

    **출처를 못 읽으면 주소를 만들지 않는다.** 반쪽 주소를 보여주면 그것을
    복사해 보내게 된다. 프로젝트 화면이 같은 판단을 한다.
  */
  const origin = originFromHeaders(requestHeaders);

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          공유
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          지금 링크로 열려 있는 것입니다. 이 링크를 아는 사람은 로그인하지
          않아도 볼 수 있습니다. 나가는 것은 직접 쓴 글과 자료 제목뿐입니다.
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

      {shares.length === 0 ? (
        /*
          **비었다는 말을 분명히 한다.** 빈 화면은 "아직 안 만들었나"로도
          읽힌다. 그리고 여기가 비어 있다는 것은 좋은 소식이므로 그렇게
          말한다.
        */
        <p className="rounded-xl border border-black/[.08] bg-white px-4 py-6 text-sm leading-6 text-zinc-600 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-400">
          지금 공개하고 있는 것이 없습니다. 공개는 프로젝트 화면의{" "}
          <strong className="font-medium">링크로 공개하기</strong>에서
          켭니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shares.map((share) => (
            <li
              key={share.token}
              className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/projects/${share.projectId}`}
                  className="text-sm font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  {share.projectName}
                </Link>
                <span className="text-xs text-zinc-500">
                  {formatDateTime(share.createdAt)}부터
                </span>
              </div>

              {origin === null ? (
                <p className="text-sm text-zinc-500">
                  주소를 만들지 못했습니다. 프로젝트 화면에서 확인해 주세요.
                </p>
              ) : (
                <p className="break-all rounded-xl border border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                  {`${origin}/p/${share.token}`}
                </p>
              )}

              <form action={unpublishProject}>
                <input
                  type="hidden"
                  name="projectId"
                  value={share.projectId}
                />
                {/*
                  끄고 나서 이 목록으로 돌아온다. 다음 줄을 마저 보려던
                  참이기 때문이다.
                */}
                <input type="hidden" name="returnTo" value="/shared" />
                <button
                  type="submit"
                  className="h-10 rounded-full border border-red-200 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  공개 끄기
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/*
        **다시 켜면 주소가 바뀐다는 것을 여기서도 알린다.** 프로젝트
        화면에도 적혀 있지만, 끄는 일을 이 화면에서도 하게 되었으므로
        누르기 전에 보이는 자리가 여기에도 있어야 한다.
      */}
      {shares.length > 0 ? (
        <p className="text-xs leading-5 text-zinc-500">
          공개를 끄면 그 링크는 그 자리에서 열리지 않습니다. 다시 켜면{" "}
          <strong className="font-medium">새 주소</strong>가 나오고, 전에
          보낸 링크는 되살아나지 않습니다.
        </p>
      ) : null}
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
