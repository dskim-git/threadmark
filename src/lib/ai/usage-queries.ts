/**
 * AI 사용 장부를 읽고 쓴다. (16-A-1의 표, 설계 문서 19절)
 *
 * 판단은 `limits.ts`가 하고 세는 것은 여기서 한다. 나눠 두어야 검사에서
 * 숫자를 직접 넣어볼 수 있다.
 *
 * RLS가 지킨다
 *   이 표는 읽기와 넣기만 열려 있고 고치기·지우기는 권한 자체가 없다.
 *   그래서 사용자 세션으로 세도 믿을 수 있다. 자기 줄만 보이고, 지울 수
 *   없으므로 줄여서 세게 만들 길이 없다.
 *
 *   `service_role`을 쓰지 않는 까닭도 그것이다. 우회하면 소유자 확인을
 *   코드가 해야 하고, 그 한 줄을 빠뜨리면 남의 장부가 보인다.
 */

import { requireActiveAccount, requireAdminAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  decideAiCall,
  limitWithGrants,
  monthStart,
  type AiCallDecision,
} from "./limits";
import {
  emptyTally,
  sumGrantsByOwner,
  tallyByOwner,
  type AiFeature,
  type FeatureTally,
} from "./usage-summary";

/**
 * 장부에 남길 갈래. 값은 `usage-summary.ts`가 들고 있다.
 *
 * 거기 두는 까닭은 그 파일이 아무것도 import하지 않는 잎사귀라 단위 검사가
 * 직접 부를 수 있기 때문이다. (AGENTS.md 2절)
 */
export type { AiFeature };

/** 부른 결과. 데이터베이스의 `ai_call_outcome`과 같은 값이다. */
export type AiOutcome = "ok" | "failed";

/**
 * 이번 달에 몇 번 불렀는지 센다.
 *
 * **셀 수 없으면 null이다.** 0이 아니다. 0을 돌려주면 장부를 못 읽었을 때
 * 한도가 통째로 사라진다. 부르는 쪽이 null을 받으면 막는다.
 * (AGENTS.md 5절 7번 "모르면 거부한다")
 */
export async function countAiCallsThisMonth(
  now: Date = new Date(),
): Promise<number | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart(now).toISOString());

  if (error) {
    console.error("[ThreadMark] AI 사용 장부 조회 실패:", error.message);

    return null;
  }

  return count ?? null;
}

/**
 * 부른 사실을 장부에 남긴다.
 *
 * **실패해도 남긴다.** 실패한 요청에도 돈이 들 수 있다. 빼면 장부가 적게
 * 센다.
 *
 * `owner_id`와 `created_at`은 보내지 않는다. 트리거가 정한다.
 * 보낸 값을 믿으면 남의 이름으로 남기거나 지난달로 적어 한도를 비켜 갈 수
 * 있다. (003의 검사 118)
 *
 * 남기지 못해도 **답을 버리지 않는다.** 장부를 못 쓴 것과 답을 못 받은 것은
 * 다른 일이고, 이미 돈이 나간 뒤에 답까지 버리면 사용자만 손해다.
 * 대신 서버 기록에 남긴다. 이것이 잦으면 한도가 헐거워지고 있다는 뜻이다.
 */
export async function recordAiUsage(input: {
  feature: AiFeature;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  outcome: AiOutcome;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("ai_usage_events").insert({
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    input_tokens: Math.max(0, Math.trunc(input.inputTokens)),
    output_tokens: Math.max(0, Math.trunc(input.outputTokens)),
    outcome: input.outcome,
  });

  if (error) {
    console.error(
      "[ThreadMark] AI 사용 기록을 남기지 못했습니다:",
      error.message,
    );
  }
}

/**
 * 이번 달에 더해받은 허용량을 센다. (19-E)
 *
 * **셀 수 없으면 null이다.** 0이 아니다. 0을 돌려주면 "허용량이 없다"와
 * "못 읽었다"가 같아지는데, 부르는 쪽은 그 둘을 다르게 다뤄야 한다.
 * `limitWithGrants`가 null을 받으면 기본 한도만 쓴다.
 *
 * 자기 것만 센다. 정책이 그렇게 되어 있다. 관리자가 남의 것을 볼 때는
 * 아래 `listUsageByUser`를 쓴다.
 */
export async function sumAiGrantsThisMonth(
  now: Date = new Date(),
): Promise<number | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    합을 데이터베이스에서 내지 않고 줄을 받아 더한다.

    PostgREST의 집계는 켜져 있지 않을 수 있고, 무엇보다 **한 사람의 한 달
    허용량 줄은 몇 개뿐이다.** 줄을 받아 더하는 편이 읽기 쉽고, 나중에
    "누가 언제 줬는지"를 함께 보여줄 때 같은 조회를 다시 쓸 수 있다.
  */
  const { data, error } = await supabase
    .from("ai_usage_grants")
    .select("extra_calls")
    .gte("created_at", monthStart(now).toISOString());

  if (error) {
    console.error("[ThreadMark] AI 허용량 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return data.reduce((total, row) => total + row.extra_calls, 0);
}

/**
 * 지금 한 번 더 불러도 되는지, 장부와 허용량을 함께 보고 판단한다. (19-E)
 *
 * **부르는 곳이 넷이라 한 곳으로 모았다.** 전에는 저마다
 * `countAiCallsThisMonth()`를 부르고 `decideAiCall(used)`로 판단했다.
 * 허용량이 생기면서 **그 넷을 다 고쳐야 하는 상태**가 되었는데, 이 저장소는
 * 그런 자리에서 한 곳을 잊은 일이 여러 번 있다.
 * (`PROTECTED_TABLES`, `EXPORTED_TABLES`, `PROFILE_SEARCH_TARGETS`)
 *
 * 그래서 넷이 이 함수 하나를 부른다. 한도 셈이 또 바뀌어도 고칠 곳이 하나다.
 *
 * **셀 수 없으면 null이다.** 0이 아니다. 부르는 쪽이 null을 받으면 막는다.
 * (AGENTS.md 5절 7번 "모르면 거부한다")
 *
 * 허용량은 못 읽어도 막지 않는다. **장부와 무게가 다르다.** 장부를 못 읽으면
 * 얼마나 썼는지 모르니 막아야 하지만, 허용량을 못 읽은 것은 **기본 한도로
 * 보면 되는 일**이다. 막는 쪽으로 기울면서도 기능을 세우지 않는다.
 */
export async function decideAiCallNow(
  now: Date = new Date(),
): Promise<AiCallDecision | null> {
  const used = await countAiCallsThisMonth(now);

  if (used === null) {
    return null;
  }

  const granted = await sumAiGrantsThisMonth(now);

  return decideAiCall(used, limitWithGrants(granted));
}

/**
 * 관리자가 보는 한 사람의 이번 달. (19-E.4)
 */
export type AdminUserUsage = {
  /** 이번 달에 몇 번 불렀는가. */
  used: number;
  /** 갈래별 횟수. */
  byFeature: Record<AiFeature, number>;
  /** 우리가 모르는 갈래로 부른 횟수. `used`에 이미 들어 있다. */
  unknownFeatureCalls: number;
  /** 이번 달에 더해받은 허용량의 합. 되돌린 줄까지 더한 값이다. */
  granted: number;
  /** 쓸 수 있는 횟수. 기본 한도 + 허용량. */
  limit: number;
  /** 남은 횟수. */
  remaining: number;
  /** 이번 달 허용량 줄. 최근 것이 앞이다. */
  grants: readonly AdminGrantRow[];
};

/** 허용량 한 줄. 누가 언제 왜 더해줬는지를 화면이 그대로 보여준다. */
export type AdminGrantRow = {
  id: string;
  extraCalls: number;
  reason: string;
  /** 누가 줬는지. 그 계정이 지워졌으면 null이다. */
  grantedBy: string | null;
  createdAt: string;
};

/** 이번 달에 아무 일도 없었던 사람. */
export const EMPTY_USER_USAGE: AdminUserUsage = buildUserUsage(
  emptyTally(),
  0,
  [],
);

/*
  한 번에 받아오는 줄 수와, 그 이상은 받지 않는 한계.

  PostgREST는 한 번에 돌려주는 줄 수에 상한이 있어서, 그냥 받으면 **넘치는
  만큼이 조용히 빠진다.** 오류가 나지 않고 합만 덜 나온다. 그래서 끝까지
  받았는지를 직접 확인하며 나눠 받는다.

  한계에 닿으면 숫자를 보여주지 않고 못 읽었다고 말한다. 덜 센 숫자를
  보여주는 것이 아무것도 안 보여주는 것보다 나쁘다. 한 사람이 한 달에 쓸 수
  있는 횟수를 생각하면 실제로 닿을 일은 없다.
*/
const USAGE_PAGE_SIZE = 1000;
const USAGE_MAX_ROWS = 50000;

/**
 * 이번 달 사용량과 허용량을 사람별로 모아 온다. (19-E.4)
 *
 * **`service_role`로 읽지 않는다.** 관리자가 남의 장부를 읽는 일은
 * `ai_usage_events_select_admin`과 `ai_usage_grants_select_admin` 정책이
 * 이미 열어 두었다. 우회하면 소유자 확인을 코드가 해야 하고, 그 한 줄을
 * 빠뜨리면 남의 것이 보인다. 17-A에서 같은 자리에 빠진 적이 있다.
 *
 * 관리자가 아니면 여기까지 오지 못한다. 화면이 이미 확인하지만 여기서도
 * 확인한다. 레이아웃의 확인만 믿지 않는다. (보안 원칙 5)
 *
 * **읽지 못하면 null이다.** 빈 표가 아니다. 빈 표를 돌려주면 "아무도 안
 * 썼다"와 "못 읽었다"가 같아 보인다. (보안 원칙 7)
 *
 * 줄이 하나도 없는 사람은 **열쇠 자체가 없다.** 부르는 쪽이
 * `EMPTY_USER_USAGE`로 채운다. 이 함수는 누가 있는지 모른다.
 */
export async function listUsageByUser(
  now: Date = new Date(),
): Promise<Map<string, AdminUserUsage> | null> {
  await requireAdminAccount("/admin/users");

  const supabase = await createClient();
  const since = monthStart(now).toISOString();

  const eventRows: { owner_id: string; feature: string }[] = [];
  let readAllEvents = false;

  for (let from = 0; from < USAGE_MAX_ROWS; from += USAGE_PAGE_SIZE) {
    /*
      `id` 차례로 받는다. 만든 때로 나누면 같은 시각의 줄이 나뉘는 자리에서
      한 줄이 두 번 오거나 아예 빠질 수 있다. `id`는 겹치지 않는다.
    */
    const { data, error } = await supabase
      .from("ai_usage_events")
      .select("owner_id, feature")
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(from, from + USAGE_PAGE_SIZE - 1);

    if (error || !data) {
      console.error(
        "[ThreadMark] 유저별 AI 사용량 조회 실패:",
        error?.message ?? "값이 없습니다",
      );

      return null;
    }

    eventRows.push(...data);

    if (data.length < USAGE_PAGE_SIZE) {
      readAllEvents = true;
      break;
    }
  }

  if (!readAllEvents) {
    console.error(
      "[ThreadMark] 이번 달 AI 사용 기록이 너무 많아 끝까지 읽지 못했습니다.",
    );

    return null;
  }

  const grantRows: {
    id: string;
    owner_id: string;
    extra_calls: number;
    reason: string;
    granted_by: string | null;
    created_at: string;
  }[] = [];
  let readAllGrants = false;

  for (let from = 0; from < USAGE_MAX_ROWS; from += USAGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ai_usage_grants")
      .select("id, owner_id, extra_calls, reason, granted_by, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + USAGE_PAGE_SIZE - 1);

    if (error || !data) {
      console.error(
        "[ThreadMark] 유저별 AI 허용량 조회 실패:",
        error?.message ?? "값이 없습니다",
      );

      return null;
    }

    grantRows.push(...data);

    if (data.length < USAGE_PAGE_SIZE) {
      readAllGrants = true;
      break;
    }
  }

  if (!readAllGrants) {
    console.error(
      "[ThreadMark] 이번 달 AI 허용량이 너무 많아 끝까지 읽지 못했습니다.",
    );

    return null;
  }

  const tallies = tallyByOwner(eventRows);
  const sums = sumGrantsByOwner(grantRows);

  const summaries = new Map<string, AdminUserUsage>();

  for (const ownerId of new Set([...tallies.keys(), ...sums.keys()])) {
    summaries.set(
      ownerId,
      buildUserUsage(
        tallies.get(ownerId) ?? emptyTally(),
        sums.get(ownerId) ?? 0,
        grantRows
          .filter((row) => row.owner_id === ownerId)
          .map((row) => ({
            id: row.id,
            extraCalls: row.extra_calls,
            reason: row.reason,
            grantedBy: row.granted_by,
            createdAt: row.created_at,
          })),
      ),
    );
  }

  return summaries;
}

/**
 * 센 것과 더해준 것을 한도 셈에 넣어 화면이 쓸 모양으로 만든다.
 *
 * **한도 셈을 여기서 다시 쓰지 않는다.** `decideAiCall`과 `limitWithGrants`를
 * 그대로 부른다. 화면에 보이는 남은 횟수와 실제로 막는 자리가 다른 셈을
 * 쓰면, 한쪽만 고쳐도 아무도 모른다. `decideAiCallNow`가 쓰는 것과 같은
 * 함수를 쓴다.
 */
function buildUserUsage(
  tally: FeatureTally,
  granted: number,
  grants: readonly AdminGrantRow[],
): AdminUserUsage {
  const decision = decideAiCall(tally.total, limitWithGrants(granted));

  return {
    used: tally.total,
    byFeature: tally.byFeature,
    unknownFeatureCalls: tally.unknown,
    granted,
    limit: decision.limit,
    remaining: decision.remaining,
    grants,
  };
}
