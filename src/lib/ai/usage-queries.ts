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

import { monthStart } from "./limits";

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
