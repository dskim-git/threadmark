import type { Metadata } from "next";
import Link from "next/link";

import { AutoNotice } from "@/app/(app)/auto-notice";
import {
  AI_BUDGET_MAX_USD,
  AI_BUDGET_MIN_USD,
  getAiBudgetSetting,
  getApprovalSetting,
} from "@/lib/admin/settings";
import { requireAdminAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { updateAiBudget, updateApprovalSetting } from "./actions";

export const metadata: Metadata = {
  title: "가입 설정",
  description: "신규 가입 승인 정책을 관리합니다.",
};

const MESSAGES: Record<string, string> = {
  invalid_request: "요청 값이 올바르지 않습니다.",
  update_failed: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  approval_on: "이제 신규 가입자는 승인 대기 상태가 됩니다.",
  approval_off: "이제 신규 가입자는 자동으로 승인됩니다.",
  budget_invalid: `한 달 예산은 ${AI_BUDGET_MIN_USD} 이상 ${AI_BUDGET_MAX_USD} 이하의 숫자로 적어 주세요.`,
  budget_failed: "예산을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  budget_updated: "한 달 AI 예산을 바꿨습니다.",
};

const ERROR_KEYS = new Set([
  "invalid_request",
  "update_failed",
  "budget_invalid",
  "budget_failed",
]);

export default async function AdminSettingsPage({
  searchParams,
}: PageProps<"/admin/settings">) {
  await requireAdminAccount("/admin/settings");

  const params = await searchParams;
  const supabase = await createClient();

  const [setting, pendingResult, budget, aiAllowedResult] = await Promise.all([
    getApprovalSetting(),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    getAiBudgetSetting(),
    /*
      AI를 허용받은 사람 수. **한 사람 몫이 이 수로 나뉜다.** (19-F)

      관리자는 `profiles_select_admin` 정책으로 전체를 본다. 쓰는 사람은
      자기 줄만 보여서 `ai_monthly_budget_share()` 함수가 대신 나눠 준다.
      여기서는 관리자가 보는 화면이라 직접 센다.
    */
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("ai_enabled", true),
  ]);

  const pendingCount = pendingResult.count ?? 0;
  const aiAllowedCount = aiAllowedResult.count ?? 0;

  const key = firstValue(params.error) ?? firstValue(params.notice);
  const message = key ? (MESSAGES[key] ?? null) : null;
  const isError = key ? ERROR_KEYS.has(key) : false;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          가입 설정
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          신규 가입자를 승인 대기 상태로 둘지 결정합니다.
        </p>
      </header>

      {/*
        오류는 그대로 두고, 잘 되었다는 안내만 스스로 사라진다.
        못 본 오류는 "아무 일도 없었다"와 구분되지 않는다. (auto-notice.tsx)
      */}
      {message ? (
        isError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {message}
          </p>
        ) : (
          <AutoNotice>{message}</AutoNotice>
        )
      ) : null}

      {setting.unavailable ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          설정 값을 읽지 못했습니다. 아래 표시는 기본값이며 실제 값과 다를 수
          있습니다. 신규 가입자는 안전하게 승인 대기 상태로 처리됩니다.
        </p>
      ) : null}

      <section className="flex flex-col gap-5 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <form action={updateApprovalSetting} className="flex flex-col gap-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="requireApproval"
              value="on"
              defaultChecked={setting.requireApproval}
              className="mt-1 h-4 w-4"
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                신규 가입 승인 필요
              </span>
              <span className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                켜두면 새로 가입한 사람은 승인 대기 상태가 되고, 관리자가
                승인해야 자료 저장 기능을 사용할 수 있습니다. 끄면 그 이후
                가입자는 자동으로 승인됩니다.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              저장
            </button>
            {setting.updatedAt ? (
              <span className="text-xs text-zinc-500">
                마지막 변경 {formatDateTime(setting.updatedAt)}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <form action={updateAiBudget} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              한 달 AI 예산 (USD)
            </span>
            <span className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              AI 기능에 한 달에 쓸 돈입니다.{" "}
              <strong className="font-medium">
                Anthropic Console에 걸어둔 예산과 같은 값으로 둡니다.
              </strong>{" "}
              여기가 더 크면 이 한도가 아무것도 막지 못하고, 어느 날 갑자기
              기능이 통째로 멈춥니다.
            </span>
            <input
              type="number"
              name="budgetUsd"
              step="0.0001"
              min={AI_BUDGET_MIN_USD}
              max={AI_BUDGET_MAX_USD}
              defaultValue={budget.budgetUsd ?? ""}
              required
              className="h-11 w-40 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>

          {/*
            **누르기 전에 결과를 보여준다.** 이 숫자 하나가 모두의 몫을
            정하는데, 몇 명이 나눠 쓰는지를 모르면 얼마를 적어야 할지
            알 수 없다.
          */}
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            지금 AI를 허용받은 사람은 <strong>{aiAllowedCount}명</strong>
            입니다.{" "}
            {budget.budgetUsd === null ? (
              <>예산을 읽지 못해 한 사람 몫을 셈할 수 없습니다.</>
            ) : (
              <>
                한 사람 몫은{" "}
                <strong>
                  ${(budget.budgetUsd / Math.max(1, aiAllowedCount)).toFixed(4)}
                </strong>
                입니다. 허용하는 사람이 늘면 각자의 몫이 줄어듭니다.
              </>
            )}
          </p>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              저장
            </button>
            {budget.updatedAt ? (
              <span className="text-xs text-zinc-500">
                마지막 변경 {formatDateTime(budget.updatedAt)}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      {/*
        설정을 끄는 것과 이미 밀린 신청을 처리하는 것은 별개다.
        이 구분이 화면에서 분명해야 관리자가 "껐으니 알아서 승인되겠지"라고
        오해하지 않는다.
      */}
      <section className="flex flex-col gap-3 rounded-2xl bg-zinc-50 p-6 dark:bg-white/[.04]">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          이미 승인을 기다리는 계정
        </h2>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          이 설정은 <strong>앞으로 가입하는 사람에게만</strong> 적용됩니다.
          설정을 꺼도 지금 대기 중인 계정은 자동으로 승인되지 않으며, 사용자
          승인 화면에서 직접 처리해야 합니다.
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          현재 승인 대기 {pendingCount}명
        </p>
        {pendingCount > 0 ? (
          <Link
            href="/admin/users"
            className="self-start text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
          >
            사용자 승인 화면으로 이동
          </Link>
        ) : null}
      </section>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
