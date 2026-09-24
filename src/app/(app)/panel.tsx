import { HelpButton } from "@/app/(app)/help-button";

/**
 * 기능 하나를 감싸는 칸. (사용자 요청, 2026-09-24)
 *
 * **어디까지가 한 기능인지 눈에 보여야 한다.** 자료 화면에 프로젝트·관련
 * 자료·파일·태그·기록이 제목만 달고 이어 붙어 있었다. 사용자가 "어디까지가
 * 어떤 기능인지 시각적으로 안 들어온다"고 했고, 맞는 말이었다.
 *
 * 제목의 크기나 여백으로만 가르면 **화면이 길어질수록 그 차이가 사라진다.**
 * 스크롤하는 동안에는 위의 제목이 보이지 않기 때문이다. 테두리로 가르면
 * 어디서 시작해 어디서 끝나는지가 한눈에 보인다.
 *
 * 앱 전체가 같은 틀을 쓴다. 화면마다 조금씩 다른 상자를 그리면, 같은 종류의
 * 것이 화면마다 다르게 보여 무엇이 무엇인지 다시 익혀야 한다.
 */
export function Panel({
  title,
  /** 물음표 단추가 가리킬 사용법 열쇠. 없으면 단추를 그리지 않는다. */
  help,
  helpLabel,
  /** 제목 줄 오른쪽에 놓을 것. 주로 그 칸의 주된 단추다. */
  action,
  /** 제목 아래 한 줄. 이 칸이 무엇을 하는 곳인지. */
  hint,
  children,
}: {
  title: React.ReactNode;
  help?: string;
  helpLabel?: string;
  action?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          {title}
        </h2>

        {help ? <HelpButton topic={help} label={helpLabel} /> : null}

        {/* 주된 단추는 오른쪽 끝으로 민다. 제목과 붙어 있으면 제목처럼 읽힌다. */}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>

      {hint ? (
        <p className="text-xs leading-5 text-zinc-500">{hint}</p>
      ) : null}

      {children}
    </section>
  );
}

/**
 * 눌러야 나오는 입력 칸. (사용자 요청, 2026-09-24)
 *
 * **새로 적는 칸을 처음부터 펼쳐두지 않는다.** 자료 화면에 고르는 칸과 적는
 * 칸이 늘 펼쳐져 있어서, 이미 담아둔 것보다 "새로 담는 자리"가 화면을 더
 * 많이 차지했다. 자주 하는 일은 보는 것이지 더하는 것이다.
 *
 * **`details`로 만든다.** 브라우저에서 돌릴 코드가 없고, 자바스크립트가
 * 없어도 열린다. 아이패드에서도 그대로 움직인다. 앱 곳곳이 이미 이 방법을
 * 쓰고 있다. (사용법 화면의 차례, 논문 담아두기)
 *
 * 열려 있어야 할 때가 있다. 방금 적다가 틀려서 되돌아온 경우다. 그때는
 * `defaultOpen`으로 펼친 채 그린다. 닫힌 칸 안에서 오류가 나면 무엇이
 * 잘못됐는지 볼 수가 없다.
 */
export function Reveal({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group flex flex-col">
      <summary className="flex h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]">
        {/* 열리면 방향이 바뀐다. 접힌 것인지 펼친 것인지가 보여야 한다. */}
        <span
          aria-hidden="true"
          className="text-xs text-zinc-500 transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        {label}
      </summary>

      <div className="pt-3">{children}</div>
    </details>
  );
}
