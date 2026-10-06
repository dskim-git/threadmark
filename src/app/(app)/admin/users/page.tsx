import type { Metadata } from "next";

import { AutoNotice } from "@/app/(app)/auto-notice";
import { HelpButton } from "@/app/(app)/help-button";
import {
  EMPTY_USER_USAGE,
  listUsageByUser,
  type AdminUserUsage,
} from "@/lib/ai/usage-queries";
import { AI_FEATURES, AI_FEATURE_LABELS } from "@/lib/ai/usage-summary";
import { getAvailableTransitions } from "@/lib/admin/transitions";
import { requireAdminAccount } from "@/lib/auth/account";
import { getStatusLabel, isAccountStatus } from "@/lib/auth/status";
import type { AccountStatus } from "@/lib/auth/status";
import { createClient } from "@/lib/supabase/server";

import { grantAiUsage, setAiAccess, updateUserStatus } from "./actions";

export const metadata: Metadata = {
  title: "사용자 승인",
  description: "가입 신청을 검토하고 승인 상태를 변경합니다.",
};

const MESSAGES: Record<string, string> = {
  invalid_request: "요청 값이 올바르지 않습니다.",
  self_change_blocked: "자신의 승인 상태는 변경할 수 없습니다.",
  user_not_found: "대상 사용자를 찾을 수 없습니다.",
  transition_not_allowed: "현재 상태에서는 할 수 없는 처리입니다.",
  update_failed: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  unchanged: "이미 같은 상태입니다.",
  updated: "처리했습니다.",
  grant_invalid:
    "몇 번 더 쓸 수 있게 할지와 사유를 모두 적어 주세요. 0번은 더할 수 없습니다.",
  grant_failed: "허용량을 더하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  granted: "허용량을 더했습니다.",
  ai_access_on: "이제 AI 기능을 쓸 수 있습니다.",
  ai_access_off: "AI 기능을 쓸 수 없게 했습니다.",
  ai_access_unchanged: "이미 그 상태입니다.",
  ai_access_failed: "AI 허용을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: AccountStatus;
  status_reason: string | null;
  requested_at: string;
  /** AI 기능을 쓸 수 있는가. (19-F) 못 읽으면 거짓으로 본다. */
  ai_enabled: boolean;
};

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const admin = await requireAdminAccount("/admin/users");
  const params = await searchParams;

  const supabase = await createClient();

  // profiles_select_admin 정책이 관리자에게만 전체 행을 돌려준다.
  // 오래 기다린 신청부터 보이도록 신청 시각 오름차순으로 읽는다.
  const [usersResult, logsResult, usageByUser] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, display_name, status, status_reason, requested_at, ai_enabled",
      )
      .order("requested_at", { ascending: true }),
    supabase
      .from("admin_audit_logs")
      .select("id, action, target_user_id, new_value, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    /*
      유저별 이번 달 AI 사용량. (19-E.4)

      `service_role`로 읽지 않는다. 관리자에게 열린 정책
      (`ai_usage_events_select_admin`)이 이미 있다. 우회하면 소유자 확인을
      코드가 해야 하고, 그 한 줄을 빠뜨리면 남의 장부가 보인다. (17-A)
    */
    listUsageByUser(),
  ]);

  if (usersResult.error) {
    console.error("[ThreadMark] 사용자 목록 조회 실패:", usersResult.error.message);
  }

  const users: UserRow[] = (usersResult.data ?? []).flatMap((row) =>
    isAccountStatus(row.status) ? [{ ...row, status: row.status }] : [],
  );

  const pending = users.filter((user) => user.status === "pending");
  const others = users.filter((user) => user.status !== "pending");

  /*
    누가 허용량을 풀어줬는지를 이름으로 보여주려고 만든다. 사람 목록을
    이미 읽었으니 그 이름을 다시 물어보지 않는다.
  */
  const nameById = new Map(
    users.map((user) => [
      user.id,
      user.display_name ?? user.email ?? "알 수 없는 사람",
    ]),
  );

  const renderUser = (user: UserRow) => (
    <UserCard
      key={user.id}
      user={user}
      currentUserId={admin.userId}
      // 못 읽은 것과 한 번도 안 쓴 것을 갈라서 보여준다.
      usage={
        usageByUser === null
          ? null
          : (usageByUser.get(user.id) ?? EMPTY_USER_USAGE)
      }
      nameById={nameById}
    />
  );

  const message =
    messageFor(params.error) ?? messageFor(params.notice) ?? null;
  const isError = Boolean(messageFor(params.error));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          사용자 승인
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          가입 신청을 검토하고 승인 상태를 변경합니다. 사람마다 이번 달 AI
          사용량도 함께 보입니다. 모든 처리는 감사 로그에 자동으로 기록됩니다.
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

      <Section
        title="승인 대기"
        count={pending.length}
        emptyText="승인을 기다리는 신청이 없습니다."
      >
        {pending.map(renderUser)}
      </Section>

      <Section
        title="전체 사용자"
        count={others.length}
        emptyText="다른 사용자가 없습니다."
      >
        {others.map(renderUser)}
      </Section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          최근 처리 내역
        </h2>
        {logsResult.data && logsResult.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {logsResult.data.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-white px-4 py-3 text-sm dark:bg-zinc-950"
              >
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {actionLabel(log.action)}
                </span>
                <span className="text-zinc-500">
                  {formatDateTime(log.created_at)}
                </span>
                {log.reason ? (
                  <span className="text-zinc-500">사유: {log.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">기록이 없습니다.</p>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  count,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-black dark:text-zinc-50">
        {title}
        <span className="ml-2 text-zinc-500">{count}</span>
      </h2>
      {count > 0 ? (
        <ul className="flex flex-col gap-3">{children}</ul>
      ) : (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      )}
    </section>
  );
}

function UserCard({
  user,
  currentUserId,
  usage,
  nameById,
}: {
  user: UserRow;
  currentUserId: string;
  /** 이번 달 AI 사용량. **읽지 못했으면 null이다.** 0번 쓴 것과 다르다. */
  usage: AdminUserUsage | null;
  nameById: Map<string, string>;
}) {
  const isSelf = user.id === currentUserId;
  const transitions = getAvailableTransitions(user.status);

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            {user.display_name ?? "이름 없음"}
            {isSelf ? (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                (나)
              </span>
            ) : null}
          </span>
          <span className="text-sm text-zinc-500">
            {user.email ?? "이메일 없음"}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {getStatusLabel(user.status)}
          </span>
          <span className="text-xs text-zinc-500">
            신청 {formatDateTime(user.requested_at)}
          </span>
        </div>
      </div>

      {user.status_reason ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          사유: {user.status_reason}
        </p>
      ) : null}

      <AiAccessPanel userId={user.id} enabled={user.ai_enabled} />

      <UsagePanel userId={user.id} usage={usage} nameById={nameById} />

      {isSelf ? (
        <p className="text-sm text-zinc-500">
          자신의 승인 상태는 이 화면에서 변경할 수 없습니다.
        </p>
      ) : (
        <form action={updateUserStatus} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={user.id} />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              사유 (선택, 감사 로그에 기록됩니다)
            </span>
            <input
              type="text"
              name="reason"
              maxLength={500}
              className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {transitions.map((transition) => (
              <button
                key={transition.to}
                type="submit"
                name="status"
                value={transition.to}
                className={
                  transition.destructive
                    ? "h-10 rounded-full border border-red-300 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    : "h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                }
              >
                {transition.label}
              </button>
            ))}
          </div>
        </form>
      )}
    </li>
  );
}

/**
 * 이 사람이 AI 기능을 쓸 수 있는가. (19-F, 2026-10-06 사용자 요청)
 *
 * **사용량 칸 위에 둔다.** 물음의 순서가 그렇다. 쓸 수 있는가가 먼저이고
 * 얼마나 썼는가가 그다음이다. 못 쓰는 사람의 사용량은 늘 0이라, 허용
 * 여부를 모르고 그 0을 보면 "안 쓰는 사람"으로 읽힌다.
 *
 * **단추가 하나뿐이다.** 지금 상태의 반대만 보여준다. 둘 다 보여주면
 * 지금이 어느 쪽인지를 단추 모양으로 읽어야 한다. 지금 상태는 글로 적고
 * 단추는 바꾸는 일만 한다.
 */
function AiAccessPanel({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.145] dark:bg-white/[.04]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            AI 기능
          </span>
          <span className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
            {enabled
              ? "쓸 수 있습니다. AI에게 물어보기, 자리 추천, 번역, 논문 서지 AI 보조입니다."
              : "쓸 수 없습니다. 가입하면 이 상태로 시작합니다."}
          </span>
        </div>

        <form action={setAiAccess} className="shrink-0">
          <input type="hidden" name="userId" value={userId} />
          <input
            type="hidden"
            name="enabled"
            value={enabled ? "false" : "true"}
          />
          <button
            type="submit"
            className={
              enabled
                ? "h-10 rounded-full border border-red-300 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                : "h-10 rounded-full border border-accent px-4 text-sm font-medium text-accent transition-colors hover:bg-accent-soft dark:border-accent-dark dark:text-accent-dark dark:hover:bg-accent-dark-soft"
            }
          >
            {enabled ? "AI 기능 막기" : "AI 기능 허용하기"}
          </button>
        </form>
      </div>

      {/*
        **허용받은 사람이 늘면 각자의 몫이 줄어든다.** 한 사람 몫은 한 달
        예산을 허용받은 사람 수로 나눈 값이다. 누르기 전에 그것을 알려야
        한다.
      */}
      <p className="text-xs leading-5 text-zinc-500">
        한 달 예산은 허용받은 사람끼리 나눠 씁니다. 허용하는 사람이 늘면
        각자 쓸 수 있는 양이 줄어듭니다.
      </p>
    </div>
  );
}

/**
 * 한 사람의 이번 달 AI 사용량과, 허용량을 더하는 자리. (설계 문서 19-E.4절)
 *
 * **리셋 단추가 아니다.** 장부(`ai_usage_events`)는 고칠 수도 지울 수도
 * 없다. 여기서 하는 일은 **쓸 수 있는 횟수를 늘리는 것**이고, 누르는 사람이
 * 보는 결과는 리셋과 같다. 다만 누가 얼마 썼는지가 영원히 남는다.
 *
 * **갈래를 나눠 보여주는 까닭.** 장부가 답해야 할 물음이 "얼마나 썼는가"
 * 하나가 아니라 "왜 이 달에 많이 나왔는가"이기도 하다.
 */
function UsagePanel({
  userId,
  usage,
  nameById,
}: {
  userId: string;
  usage: AdminUserUsage | null;
  nameById: Map<string, string>;
}) {
  /*
    못 읽은 것과 한 번도 안 쓴 것을 갈라서 말한다. 0번이라고 보여주면
    읽지 못한 것이 "아무도 안 썼다"로 보인다. (보안 원칙 7)
  */
  if (usage === null) {
    return (
      <p className="rounded-xl bg-black/[.03] px-4 py-3 text-sm text-zinc-500 dark:bg-white/[.04]">
        이번 달 AI 사용량을 읽지 못했습니다. 잠시 후 새로고침해 주세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-black/[.03] p-4 dark:bg-white/[.04]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          이번 달 AI 사용
        </span>
        {/*
          물음표를 이 자리에 둔다. 제목 옆에 두면 `사용자 승인`의 설명으로
          읽히는데, 물음이 생기는 곳은 숫자와 `허용량 더하기` 옆이다.
        */}
        <HelpButton topic="admin-ai-usage" label="AI 사용량과 허용량" />
        {/*
          **돈과 횟수를 함께 보여준다.** (19-F 2차례)

          막는 것은 돈이다. 그런데 관리자가 `몇 번 더`를 적어 풀어주므로,
          **남은 것을 번으로도 말해야** 얼마를 더 줄지 가늠할 수 있다.
          번은 한 번 상한으로 나눈 **어림**이라 그렇게 적는다.
        */}
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          {formatUsd(usage.allowanceUsd)} 중 {formatUsd(usage.spentUsd)} 씀 ·{" "}
          {formatUsd(usage.remainingUsd)} 남음 (어림 {usage.remainingCalls}번)
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {AI_FEATURES.map((feature) => (
          <li key={feature}>
            {AI_FEATURE_LABELS[feature]} {usage.byFeature[feature]}번
          </li>
        ))}
        {/*
          우리가 모르는 갈래로 부른 것. 데이터베이스에 값이 먼저 늘고 코드가
          아직 모를 때 생긴다. 숨기면 갈래별 합이 전체와 어긋나 보인다.
        */}
        {usage.unknownFeatureCalls > 0 ? (
          <li>그 밖 {usage.unknownFeatureCalls}번</li>
        ) : null}
      </ul>

      {usage.grants.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {usage.grants.map((grant) => (
            <li key={grant.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {grant.extraCalls > 0 ? `+${grant.extraCalls}` : grant.extraCalls}
                번
              </span>
              <span>{grant.reason}</span>
              <span className="text-zinc-500">
                {formatDateTime(grant.createdAt)}
              </span>
              <span className="text-zinc-500">
                {(grant.grantedBy ? nameById.get(grant.grantedBy) : null) ??
                  "알 수 없는 사람"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        action={grantAiUsage}
        className="flex flex-wrap items-end gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.08]"
      >
        <input type="hidden" name="userId" value={userId} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">몇 번 더</span>
          <input
            type="number"
            name="extraCalls"
            required
            min={-10000}
            max={10000}
            step={1}
            className="h-10 w-28 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">사유 (필수)</span>
          <input
            type="text"
            name="reason"
            required
            maxLength={500}
            className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        <button
          type="submit"
          className="h-10 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          허용량 더하기
        </button>
      </form>

      <p className="text-xs leading-5 text-zinc-500">
        이미 쓴 기록은 지우지 않고 쓸 수 있는 횟수만 늘립니다. 잘못 줬으면
        음수를 적어 되돌립니다. 기본 한도 아래로는 내려가지 않습니다.
      </p>
    </div>
  );
}

function messageFor(value: string | string[] | undefined): string | null {
  const key = Array.isArray(value) ? value[0] : value;

  return key ? (MESSAGES[key] ?? null) : null;
}

/**
 * 달러를 사람이 읽을 모양으로. (19-F 2차례)
 *
 * **센트 아래 두 자리까지 보여준다.** 한 번 부르는 값이 $0.09 어름이라
 * 센트까지만 끊으면 **여러 번 써도 숫자가 안 움직인다.** 움직이지 않는
 * 숫자는 고장처럼 보인다.
 */
function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    user_status_changed: "승인 상태 변경",
    user_role_granted: "역할 부여",
    user_role_revoked: "역할 회수",
    app_setting_updated: "설정 변경",
    ai_usage_granted: "AI 허용량 더하기",
    // 2026-10-06. 빠뜨리면 영문 갈래 이름이 그대로 보인다.
    ai_access_changed: "AI 기능 허용 변경",
  };

  return labels[action] ?? action;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
