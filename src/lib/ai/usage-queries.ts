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

import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  decideAiCall,
  limitWithGrants,
  monthStart,
  type AiCallDecision,
} from "./limits";

/**
 * 장부에 남길 갈래. 데이터베이스의 `ai_feature`와 같은 값이다.
 *
 * **여기와 데이터베이스가 어긋나면 장부에 못 쓴다.** 값을 더하려면
 * 마이그레이션을 따로 하나 만들고(`ALTER TYPE ... ADD VALUE`는 같은
 * 트랜잭션에서 쓸 수 없다), 그것을 올린 뒤 여기에 더한다.
 */
export type AiFeature = "translation" | "search" | "placement";

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
