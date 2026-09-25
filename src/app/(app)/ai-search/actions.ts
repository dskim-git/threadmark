"use server";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  createAnthropicAskProvider,
  isAiSearchConfigured,
} from "@/lib/ai/anthropic";
import { citedIndices, danglingIndices } from "@/lib/ai/answer";
import { gatherCandidates } from "@/lib/ai/candidates";
import { decideAiCall } from "@/lib/ai/limits";
import { extractKeywords, normalizeQuestion } from "@/lib/ai/question";
import {
  countAiCallsThisMonth,
  recordAiUsage,
} from "@/lib/ai/usage-queries";

import type { AskState } from "./state";

/**
 * 담아둔 것에서 물음에 답한다. (설계 문서 19절)
 *
 * 왜 Server Action이고 주소에 남기지 않는가
 *   `/search`는 검색어를 `?q=`로 주소에 남긴다. 새로고침해도 결과가 그대로
 *   있고 즐겨찾기에 담을 수 있어서다.
 *
 *   **여기서는 그렇게 하면 안 된다.** 주소에 남기면 화면을 열 때마다
 *   물어보게 되고, 새로고침 한 번이 돈 한 번이다. 뒤로 가기도 마찬가지다.
 *   사용자가 누른 적 없는 요청이 나가면 한도가 조용히 줄어든다.
 *
 *   그래서 누를 때만 나가는 Server Action으로 두고 결과를 화면 상태로
 *   들고 있는다. 주소에 남지 않으니 즐겨찾기에 담을 수 없는데, 그 편이 맞다.
 *   **돈이 드는 일은 누를 때만 일어나야 한다.**
 *
 * 세 겹으로 막는다
 *   1. `requireActiveAccount` — 승인된 계정인가
 *   2. 월 한도 — 이번 달에 얼마나 썼는가
 *   3. RLS — 후보를 모을 때 남의 것은 애초에 보이지 않는다
 */

function fail(question: string, error: string, remaining: number | null): AskState {
  return { question, answer: null, cited: [], error, remaining };
}

export async function askAboutMyNotes(
  _previous: AskState,
  formData: FormData,
): Promise<AskState> {
  await requireActiveAccount("/ai-search");

  const question = normalizeQuestion(formData.get("question"));

  if (question === null) {
    return fail("", "무엇이 궁금한지 적어 주세요.", null);
  }

  if (!isAiSearchConfigured()) {
    return fail(
      question,
      "AI로 물어보기가 아직 설정되지 않았습니다. 운영자에게 알려 주세요.",
      null,
    );
  }

  /*
    한도를 먼저 본다. 후보를 모으는 것은 돈이 들지 않지만, 한도에 걸린
    사람에게 "찾았는데 못 물어봅니다"를 보여줄 이유가 없다.
  */
  const used = await countAiCallsThisMonth();

  if (used === null) {
    /*
      장부를 읽지 못했다. **모르면 거부한다.** (AGENTS.md 5절 7번)
      통과시키면 한도가 없는 것과 같아진다.
    */
    return fail(
      question,
      "얼마나 쓰셨는지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      null,
    );
  }

  const decision = decideAiCall(used);

  if (!decision.allowed) {
    return fail(
      question,
      `이번 달에 ${decision.limit}번까지 물어볼 수 있는데 다 쓰셨습니다. 다음 달 1일에 다시 채워집니다.`,
      0,
    );
  }

  const items = await gatherCandidates(extractKeywords(question));

  if (items.length === 0) {
    /*
      넘길 것이 없으면 **묻지 않는다.** 물으면 모델이 아는 것으로 답을
      지어내고, 그것이 담아둔 것처럼 보인다. 돈도 든다.
    */
    return fail(
      question,
      "물음과 겹치는 기록을 찾지 못했습니다. 담아둔 글에 있는 낱말로 물어보세요.",
      decision.remaining,
    );
  }

  const provider = createAnthropicAskProvider();
  const result = await provider.ask({ question, items });

  await recordAiUsage({
    feature: "search",
    provider: provider.name,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    outcome: result.ok ? "ok" : "failed",
  });

  if (!result.ok) {
    return fail(question, result.message, decision.remaining - 1);
  }

  /*
    답이 가리킨 번호 중 **진짜 있는 것만** 근거로 그린다. 없는 번호를
    그리면 누를 데가 없는 줄이 생기고, 더 나쁘게는 엉뚱한 자료를 근거라고
    보여주게 된다. (`answer.ts` 참고)
  */
  const dangling = danglingIndices(result.answer, items.length);

  if (dangling.length > 0) {
    console.error(
      `[ThreadMark] AI 답이 없는 자료 번호를 가리켰습니다: ${dangling.join(", ")} (넘긴 것 ${items.length}개)`,
    );
  }

  const cited = citedIndices(result.answer, items.length).map(
    (index) => items[index - 1],
  );

  return {
    question,
    answer: result.answer,
    cited,
    error: null,
    remaining: decision.remaining - 1,
  };
}
