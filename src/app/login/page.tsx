import type { Metadata } from "next";

import { sanitizeNextPath } from "@/lib/auth/request-url";

import { signInWithGoogle } from "./actions";

export const metadata: Metadata = {
  title: "로그인 · ThreadMark",
  description: "ThreadMark에 로그인합니다.",
};

/**
 * 오류 코드를 사용자에게 보여줄 문구로 바꾼다.
 *
 * 인증 공급자가 보낸 원문을 그대로 노출하지 않는다.
 * 내부 사정을 드러내지 않으면서 다음에 무엇을 하면 되는지만 알려준다.
 */
const ERROR_MESSAGES: Record<string, string> = {
  oauth_start_failed:
    "Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  oauth_denied: "Google 로그인이 완료되지 않았습니다. 다시 시도해 주세요.",
  missing_code: "인증 정보가 전달되지 않았습니다. 처음부터 다시 로그인해 주세요.",
  exchange_failed:
    "로그인 세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  unknown_origin: "요청 주소를 확인하지 못했습니다. 다시 시도해 주세요.",
};

const FALLBACK_ERROR_MESSAGE = "로그인에 실패했습니다. 다시 시도해 주세요.";

/**
 * 오류가 아니라 "그 일이 끝났다"를 알리는 문구.
 *
 * 계정을 지우면 갈 수 있는 화면이 로그인뿐이다. 아무 말 없이 로그인 화면이
 * 뜨면 지워진 것인지 그냥 튕긴 것인지 알 수 없다. **되돌릴 수 없는 일일수록
 * 끝났다는 말을 들어야 한다.**
 */
const NOTICE_MESSAGES: Record<string, string> = {
  account_deleted:
    "계정을 지웠습니다. 담아두신 자료도 함께 지워졌습니다. 그동안 고맙습니다.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  const errorCode = firstValue(params.error);
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR_MESSAGE)
    : null;

  // 아는 코드만 문구가 된다. 주소창에 적어 넣은 글이 화면에 나오지 않는다.
  const noticeCode = firstValue(params.notice);
  const noticeMessage = noticeCode ? (NOTICE_MESSAGES[noticeCode] ?? null) : null;

  const next = sanitizeNextPath(firstValue(params.next));

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-sm">
        <div className="flex flex-col gap-8 rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              ThreadMark
            </h1>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              자료와 생각을 Source, Capture, Project로 연결해 기록합니다.
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

          {noticeMessage ? (
            <p
              role="status"
              className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300"
            >
              {noticeMessage}
            </p>
          ) : null}

          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-solid border-black/[.08] px-5 text-base font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              <GoogleMark />
              Google로 계속하기
            </button>
          </form>

          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500">
            현재 ThreadMark는 제한적으로 운영합니다. 로그인한 뒤 관리자 승인을
            받아야 자료 저장 기능을 사용할 수 있습니다.{" "}
            {/*
              로그인 전에도 이 앱이 무엇인지 알 수 있어야 한다.
              링크 하나로 남에게 알릴 수 있게 하는 것이 이 화면의 몫이다.
            */}
            <a
              href="/guide"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              사용법 보기
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

/** 같은 이름의 쿼리 파라미터가 여러 번 오면 첫 값만 쓴다. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Google 로그인 버튼에 사용하는 공식 G 마크. */
function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 48"
      className="h-5 w-5"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
