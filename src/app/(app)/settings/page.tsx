import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import {
  THEME_FONT_SETS,
  THEME_MODES,
  THEME_PALETTES,
} from "@/lib/appearance/theme";
import { AutoNotice } from "@/app/(app)/auto-notice";
import { HelpButton } from "@/app/(app)/help-button";
import { requireActiveAccount } from "@/lib/auth/account";
import { getDriveConnectionSummary } from "@/lib/drive/connection";

import { saveAppearance } from "./actions";

export const metadata: Metadata = {
  title: "설정 · ThreadMark",
  description: "계정과 연결을 확인합니다.",
};

/**
 * 설정. (설계 문서 21절의 `/settings`)
 *
 * 경로 목록에는 처음부터 있었는데 화면이 없었다. 그 대신 연결·사용자 승인·
 * 로그아웃이 위 메뉴에 흩어져 있었고, 매일 쓰는 기록·자료·논문과 같은 무게로
 * 보였다. 자주 쓰지 않는 것을 한곳에 모은다.
 *
 * 관리자 화면으로 가는 길도 여기 둔다. 링크를 감추는 것은 통제가 아니다.
 * 각 화면과 Server Action이 직접 확인하고 RLS가 한 번 더 막는다. 여기서는
 * 관리자에게만 진입 경로를 보여줄 뿐이다.
 */
export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const account = await requireActiveAccount("/settings");
  const [drive, params] = await Promise.all([
    getDriveConnectionSummary(account.userId),
    searchParams,
  ]);

  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  const driveLabel =
    drive?.status === "connected"
      ? "연결되어 있습니다"
      : drive
        ? "다시 확인이 필요합니다"
        : "아직 연결하지 않았습니다";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl text-black dark:text-zinc-50">설정</h1>
          <HelpButton topic="appearance" label="화면 색과 글꼴" />
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          계정과 연결을 확인합니다.
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

      {notice ? (
        <AutoNotice>{notice}</AutoNotice>
      ) : null}

      {/*
        화면 취향. (설계 문서 4.2절)

        고르고 저장하면 앱 전체가 바뀐다. 미리 보기를 따로 두지 않는다.
        저장한 뒤의 화면이 곧 미리 보기이고, 마음에 안 들면 다시 고르면 된다.
        작은 상자 안의 미리 보기는 실제로 몇 시간 들여다볼 때의 느낌을
        알려주지 못한다.
      */}
      <form
        action={saveAppearance}
        className="flex flex-col gap-6 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            화면
          </h2>
          <p className="text-xs leading-5 text-zinc-500">
            색과 글꼴을 고릅니다. 이 계정에만 적용되고 어느 기기에서 열어도
            따라옵니다.
          </p>
        </div>

        {/*
          밝기를 색보다 먼저 묻는다. 색 갈래 셋은 모두 밝은 화면으로 만든
          것이라, 어두운 모드에서는 어느 것을 골라도 비슷해 보인다.
          밝기를 먼저 정해야 색을 고른 결과가 보인다.
        */}
        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="pb-1 text-xs text-zinc-500">밝기</legend>

          {THEME_MODES.map((mode) => (
            <label
              key={mode.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[.08] px-4 py-3 transition-colors hover:border-black/20 has-checked:border-accent dark:border-white/[.145] dark:hover:border-white/30 dark:has-checked:border-accent-dark"
            >
              <input
                type="radio"
                name="mode"
                value={mode.value}
                defaultChecked={account.appearance.mode === mode.value}
                className="mt-1 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  {mode.label}
                </span>
                <span className="text-xs leading-5 text-zinc-500">
                  {mode.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="pb-1 text-xs text-zinc-500">색</legend>

          {THEME_PALETTES.map((palette) => (
            <label
              key={palette.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[.08] px-4 py-3 transition-colors hover:border-black/20 has-checked:border-accent dark:border-white/[.145] dark:hover:border-white/30 dark:has-checked:border-accent-dark"
            >
              <input
                type="radio"
                name="palette"
                value={palette.value}
                defaultChecked={account.appearance.palette === palette.value}
                className="mt-1 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {palette.label}
                  </span>
                  {/*
                    색 세 개를 그대로 보여준다. 이름만으로는 무엇이 바뀌는지
                    알 수 없다. 값은 갈래 정의에서 그대로 가져온다.
                  */}
                  <span className="flex gap-1">
                    {palette.swatch.map((color) => (
                      <span
                        key={color}
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                </span>
                <span className="text-xs leading-5 text-zinc-500">
                  {palette.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="pb-1 text-xs text-zinc-500">글꼴</legend>

          {THEME_FONT_SETS.map((fonts) => (
            <label
              key={fonts.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[.08] px-4 py-3 transition-colors hover:border-black/20 has-checked:border-accent dark:border-white/[.145] dark:hover:border-white/30 dark:has-checked:border-accent-dark"
            >
              <input
                type="radio"
                name="fonts"
                value={fonts.value}
                defaultChecked={account.appearance.fonts === fonts.value}
                className="mt-1 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  {fonts.label}
                </span>
                {/*
                  그 글꼴로 쓴 한 줄을 함께 보여준다. 글꼴 이름을 아는
                  사람은 드물고, 봐야 고를 수 있다.
                */}
                <span
                  className="text-base leading-7 text-zinc-800 dark:text-zinc-200"
                  style={{ fontFamily: FONT_SAMPLE[fonts.value] }}
                >
                  수학적 모델링에 대한 교사의 인식 연구
                </span>
                <span className="text-xs leading-5 text-zinc-500">
                  {fonts.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          className="h-10 w-fit rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          화면 바꾸기
        </button>
      </form>

      <section className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          내 계정
        </h2>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-20 shrink-0 text-zinc-500">이름</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {account.displayName ?? "이름이 없습니다"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-20 shrink-0 text-zinc-500">메일</dt>
            <dd className="break-all text-zinc-800 dark:text-zinc-200">
              {account.email ?? "알 수 없음"}
            </dd>
          </div>
          {account.isAdmin ? (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-20 shrink-0 text-zinc-500">권한</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">관리자</dd>
            </div>
          ) : null}
        </dl>

        <form action={signOut}>
          <button
            type="submit"
            className="h-10 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            로그아웃
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          연결
        </h2>

        <SettingsLink
          href="/settings/integrations"
          title="Google Drive"
          description={driveLabel}
        />
      </section>

      {account.isAdmin ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            운영
          </h2>

          <SettingsLink
            href="/admin/users"
            title="사용자 승인"
            description="가입 신청을 승인하거나 계정을 정지합니다."
          />
          <SettingsLink
            href="/admin/settings"
            title="운영 설정"
            description="새로 가입한 계정에 승인을 요구할지 정합니다."
          />
        </section>
      ) : null}

      {/*
        나가는 길. (17-A)

        맨 아래에 둔다. 자주 누를 것이 아니고, 로그아웃 바로 옆에 두면 둘을
        헷갈릴 자리가 생긴다. 그렇다고 감추지는 않는다. **나갈 수 있는지를
        찾아 헤매게 만드는 앱은 들어오기도 꺼려진다.** 실제로 지우는 일은
        저 화면에서 메일 주소를 적어야 시작된다.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          계정 정리
        </h2>

        <SettingsLink
          href="/account/delete"
          title="계정 지우기"
          description="계정과 담아둔 자료를 모두 지웁니다. 되돌릴 수 없습니다."
        />
      </section>
    </div>
  );
}

/**
 * 고르는 칸에서 보여줄 글꼴.
 *
 * 그 갈래를 골랐을 때 **제목**에 쓰일 글꼴로 보여준다. 본문 글꼴은 지금
 * 읽고 있는 글로 이미 보이지만 제목 글꼴은 그렇지 않고, 갈래마다 가장
 * 크게 달라지는 것도 제목이다.
 *
 * 변수 이름은 뿌리 레이아웃이 붙인 것과 같아야 한다.
 */
const FONT_SAMPLE: Record<string, string> = {
  myeongjo: "var(--font-noto-serif-kr), serif",
  single: "var(--font-plex-kr), sans-serif",
  gowun: "var(--font-gowun-batang), serif",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function SettingsLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-2xl border border-black/[.08] bg-white px-5 py-4 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          {title}
        </span>
        <span className="text-xs leading-5 text-zinc-500">{description}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-zinc-400">
        →
      </span>
    </Link>
  );
}
