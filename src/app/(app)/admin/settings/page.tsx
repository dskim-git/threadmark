import type { Metadata } from "next";
import Link from "next/link";

import { getApprovalSetting } from "@/lib/admin/settings";
import { requireAdminAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { updateApprovalSetting } from "./actions";

export const metadata: Metadata = {
  title: "가입 설정 · ThreadMark",
  description: "신규 가입 승인 정책을 관리합니다.",
};

const MESSAGES: Record<string, string> = {
  invalid_request: "요청 값이 올바르지 않습니다.",
  update_failed: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  approval_on: "이제 신규 가입자는 승인 대기 상태가 됩니다.",
  approval_off: "이제 신규 가입자는 자동으로 승인됩니다.",
};

const ERROR_KEYS = new Set(["invalid_request", "update_failed"]);

export default async function AdminSettingsPage({
  searchParams,
}: PageProps<"/admin/settings">) {
  await requireAdminAccount("/admin/settings");

  const params = await searchParams;
  const supabase = await createClient();

  const [setting, pendingResult] = await Promise.all([
    getApprovalSetting(),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const pendingCount = pendingResult.count ?? 0;

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

      {message ? (
        <p
          role="status"
          className={
            isError
              ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          }
        >
          {message}
        </p>
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
