import type { Metadata } from "next";
import Link from "next/link";

import { HelpButton } from "@/app/(app)/help-button";
import { isLastAdmin } from "@/lib/account/last-admin";
import { requireAccount } from "@/lib/auth/account";
import { canAccessProtectedArea } from "@/lib/auth/status";

import { deleteMyAccount } from "./actions";

export const metadata: Metadata = {
  title: "계정 지우기 · ThreadMark",
  description: "ThreadMark 계정과 담아둔 자료를 모두 지웁니다.",
};

/**
 * 계정 지우기. (17-A, 개인정보 초안 9절)
 *
 * **앱 묶음 밖에 둔다.** `(app)` 레이아웃은 승인된 사용자만 통과시키는데,
 * 나가고 싶은 사람은 승인을 기다리는 중이거나 거절·정지된 상태일 수 있다.
 * 그 사람들이 못 들어오는 자리에 나가는 문을 달면 문이 없는 것과 같다.
 * 그래서 `/settings` 아래가 아니라 `/account/delete`에 두고, 설정 화면과
 * 승인 상태 화면 양쪽에서 이리로 보낸다. 문 하나에 들어오는 길이 둘이다.
 *
 * 개인정보 초안은 이 화면의 경로를 `/settings/account`로 적어두었다.
 * 승인받지 못한 사람이 닿을 수 없어 경로를 바꾸고 그 문서도 함께 고쳤다.
 *
 * 화면에 앱 머리말이 없는 것은 `/pending`, `/guide`와 같은 이유다.
 */
export default async function AccountDeletePage({
  searchParams,
}: PageProps<"/account/delete">) {
  const account = await requireAccount("/account/delete");
  const params = await searchParams;

  /*
    하나뿐인 관리자인지 **미리** 본다.

    실제로 막는 것은 삭제 동작 쪽이다. 여기서 보는 이유는 다른 데 있다.
    끝까지 적어 넣고 단추를 누른 뒤에 "안 됩니다"를 만나면, 사용자는 자기가
    무엇을 잘못했는지부터 찾는다. 안 되는 일이라면 시작하기 전에 알려준다.

    두 곳이 같은 함수를 부른다. 각자 세면 어긋날 자리가 생긴다.
  */
  const blockedAsLastAdmin = await isLastAdmin(account);

  const errorMessage = readError(params.error);
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();

  // 돌아갈 곳은 온 곳이다. 승인 전이라면 앱 화면으로 보낼 수 없다.
  const backPath = canAccessProtectedArea(account.status)
    ? "/settings"
    : "/pending";

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-lg">
        <div className="flex flex-col gap-8 rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
          <header className="flex flex-col gap-2">
            <Link
              href={backPath}
              className="w-fit text-sm text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
            >
              ← 돌아가기
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                계정 지우기
              </h1>
              <HelpButton topic="account-delete" label="계정 지우기" />
            </div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              ThreadMark 계정과 여기에 담아둔 것을 모두 지웁니다. 되돌릴 수
              없습니다.
            </p>
          </header>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              {errorMessage}
            </p>
          ) : null}

          <dl className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-white/[.04]">
            <div className="flex flex-wrap gap-2">
              <dt className="text-zinc-500">지울 계정</dt>
              <dd className="break-all text-zinc-800 dark:text-zinc-200">
                {account.email ?? "확인할 수 없음"}
              </dd>
            </div>
          </dl>

          {/*
            무엇이 사라지고 무엇이 남는지를 **나란히** 보여준다.

            사라지는 것만 늘어놓으면 "그럼 Drive에 올린 파일은?"이 남는다.
            그 물음에 답하지 않으면 지우기를 누르지 못하거나, 남는 줄 모르고
            눌렀다가 나중에 놀란다. 둘 다 좋지 않다.
          */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              함께 사라지는 것
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <li>담아둔 자료 전부와 거기에 남긴 기록·인용·번역</li>
              <li>프로젝트와 자료를 이어둔 것, 자료끼리 이어둔 것</li>
              <li>태그, 중요 표시(별), 논문 정보와 분석, 활용 계획</li>
              <li>웹사이트 정보와 음악 정보, 들을 곳 링크</li>
              <li>올린 파일을 다시 찾기 위해 적어둔 파일 이름과 위치</li>
              <li>이름·메일 주소 같은 계정 정보와 화면 취향</li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              남는 것
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              <li>
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                  Google Drive에 올린 파일은 그대로 남습니다.
                </strong>{" "}
                내 Drive에 있는 내 파일이라 우리가 지우지 않습니다. 필요 없으면
                Drive에서 직접 지웁니다.
              </li>
              <li>
                ThreadMark가 가지고 있던 Drive 접근 권한은 지우기 전에 Google에
                반납합니다.{" "}
                <a
                  href="https://myaccount.google.com/connections"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-200"
                >
                  Google 계정 설정
                </a>
                에서도 확인할 수 있습니다.
              </li>
              <li>
                관리자가 승인·정지를 처리한 기록은 남습니다. 거기에는 상태가
                언제 바뀌었는지만 있고 이름이나 메일 주소는 담기지 않습니다.
              </li>
            </ul>
          </section>

          {blockedAsLastAdmin ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              이 계정은 하나뿐인 관리자입니다. 지우면 아무도 새 가입을 승인할 수
              없게 되어 지울 수 없습니다. 다른 사람에게 관리자 권한을 먼저
              넘기면 그다음에 지울 수 있습니다.
            </p>
          ) : account.email ? (
            <form action={deleteMyAccount} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="confirm"
                  className="text-sm font-medium text-black dark:text-zinc-50"
                >
                  확인을 위해 위의 메일 주소를 그대로 적어 주세요
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  placeholder={account.email}
                  className="h-11 rounded-lg border border-black/[.08] bg-white px-4 text-sm text-black transition-colors focus:border-black/30 focus:outline-none dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:border-white/40"
                />
                <p className="text-xs leading-5 text-zinc-500">
                  한 번 지우면 되돌릴 수 없습니다. 우리도 되살릴 수 없습니다.
                </p>
              </div>

              <button
                type="submit"
                className="h-11 rounded-full bg-red-700 px-5 text-sm font-medium text-white transition-colors hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700"
              >
                계정 지우기
              </button>
            </form>
          ) : (
            /*
              메일 주소를 읽지 못하면 확인할 기준이 없다. 그 상태로 단추를
              보여주면 눌러도 늘 막히는 단추가 된다. 다른 길을 안내한다.
            */
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              이 계정의 메일 주소를 확인하지 못해 여기서는 지울 수 없습니다.
              {supportEmail ? (
                <>
                  {" "}
                  <a
                    className="font-medium underline underline-offset-2"
                    href={`mailto:${supportEmail}?subject=${encodeURIComponent(
                      "ThreadMark 계정 삭제 요청",
                    )}`}
                  >
                    {supportEmail}
                  </a>
                  로 삭제를 요청해 주세요.
                </>
              ) : (
                " 운영자에게 삭제를 요청해 주세요."
              )}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * 오류 코드를 사람이 읽을 문구로 바꾼다.
 *
 * 주소창에 무엇이 적혀 오든 우리가 아는 코드만 문구가 된다. 모르는 값은
 * 그대로 그리지 않는다. 그리면 남이 만든 글을 우리 화면에 띄우는 셈이 되고,
 * 그것은 가짜 안내문을 심는 길이 된다.
 */
function readError(value: string | string[] | undefined): string | null {
  const code = Array.isArray(value) ? value[0] : value;

  if (!code) {
    return null;
  }

  return ERROR_MESSAGES[code] ?? "계정을 지우지 못했습니다. 다시 시도해 주세요.";
}

const ERROR_MESSAGES: Record<string, string> = {
  confirm_mismatch:
    "적어 넣은 주소가 이 계정의 메일 주소와 다릅니다. 위에 보이는 주소를 그대로 적어 주세요.",
  last_admin:
    "이 계정은 하나뿐인 관리자입니다. 다른 사람에게 관리자 권한을 먼저 넘겨야 지울 수 있습니다.",
  /*
    "아무것도 지워지지 않았습니다"라고 적지 않는다.

    Drive 권한 반납이 계정 삭제보다 먼저 일어나기 때문에(deletion.ts 참고),
    여기까지 왔다면 연결이 이미 끊겼을 수 있다. 자료는 그대로다.
    실제와 다른 안심은 안심이 아니다.
  */
  delete_failed:
    "계정을 지우지 못했습니다. 담아둔 자료는 그대로 있습니다. Google Drive 연결은 끊겼을 수 있으니 설정에서 확인해 주세요.",
};
