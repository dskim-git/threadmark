"use server";

import { z } from "zod";

import { isAiSearchConfigured } from "@/lib/ai/anthropic";
import { gatherCandidates } from "@/lib/ai/candidates";
import { askWhatFitsHere } from "@/lib/ai/placement-anthropic";
import { extractKeywords } from "@/lib/ai/question";
import {
  decideAiCallNow,
  recordAiUsage,
} from "@/lib/ai/usage-queries";
import { requireActiveAccount } from "@/lib/auth/account";
import { listOutline } from "@/lib/projects/outline-queries";
import { listPlacements } from "@/lib/projects/placement-queries";
import { formValue } from "@/lib/sources/schema";

import type { Fit, FitState } from "./fit-state";

/**
 * 이 자리에 어울리는 것을 **담아둔 것 전부**에서 고른다. (19-D-2, 사용자 요청)
 *
 * `suggest-actions.ts`와 방향이 반대다.
 *
 *   저쪽  프로젝트에 이어둔 것 → 어느 자리에 놓을까
 *   이쪽  자리 하나 → 담아둔 것 전부에서 무엇을 가져올까
 *
 * **이쪽이 더 값지다.** 이미 이어둔 것은 내가 아는 것이고, 이쪽은
 * **잊고 있던 것**을 찾아준다. 사용자가 짚은 차이가 그것이다.
 *
 * 어떻게 후보를 좁히는가
 *   담아둔 것 전부를 넘길 수는 없다. 설계 문서 19절의 흐름 그대로
 *   **자리 이름과 그 자리에 쓴 글에서 낱말을 뽑아 키워드로 먼저 좁힌다.**
 *   물어보기(`/ai-search`)가 쓰는 것과 같은 코드다. (`candidates.ts`)
 *
 *   그래서 **낱말이 하나도 안 겹치면 아무것도 못 찾는다.** 키워드 검색의
 *   한계이고, 벡터 검색이 메울 자리다. 지금은 그 길이 없다. (4-40절)
 *
 * 화면이 보낸 것은 프로젝트 번호와 자리 번호뿐이다. 나머지는 여기서
 * 데이터베이스를 보고 모은다. **RLS는 우리가 물어볼 때만 지켜준다.**
 */

const idSchema = z.string().uuid();

function fail(
  nodeId: string | null,
  error: string,
  remaining: number | null,
): FitState {
  return { nodeId, fits: null, looked: [], error, remaining };
}

export async function suggestForNode(
  _previous: FitState,
  formData: FormData,
): Promise<FitState> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));

  if (!projectId.success || !nodeId.success) {
    return fail(null, "어느 자리인지 알 수 없습니다.", null);
  }

  if (!isAiSearchConfigured()) {
    return fail(
      nodeId.data,
      "AI 기능이 아직 설정되지 않았습니다. 운영자에게 알려 주세요.",
      null,
    );
  }

  const decision = await decideAiCallNow();

  if (decision === null) {
    // 모르면 거부한다. (AGENTS.md 5절 7번)
    return fail(
      nodeId.data,
      "얼마나 쓰셨는지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      null,
    );
  }

  if (!decision.allowed) {
    return fail(
      nodeId.data,
      `이번 달에 ${decision.limit}번까지 물어볼 수 있는데 다 쓰셨습니다. 다음 달 1일에 다시 채워집니다.`,
      0,
    );
  }

  const [outline, placements] = await Promise.all([
    listOutline(projectId.data),
    listPlacements(projectId.data),
  ]);

  /*
    **이 자리가 이 프로젝트의 것인지 여기서 확인한다.** 남의 프로젝트라면
    `listOutline`이 빈 목록을 주므로 여기서 걸린다. 화면이 보낸 번호를
    그대로 믿고 자리 이름을 짓지 않는다.
  */
  const node = outline.find((item) => item.id === nodeId.data);

  if (!node) {
    return fail(nodeId.data, "그 자리를 찾지 못했습니다.", decision.remaining);
  }

  // 위 자리를 이어 붙인다. 뼈대에서는 위치가 곧 뜻이다.
  const titleById = new Map(outline.map((item) => [item.id, item.title]));
  const parentById = new Map(outline.map((item) => [item.id, item.parentId]));

  const parts: string[] = [];
  let cursor: string | null = node.id;

  for (let step = 0; cursor !== null && step < 50; step += 1) {
    const title = titleById.get(cursor);

    if (title === undefined) {
      break;
    }

    parts.unshift(title);
    cursor = parentById.get(cursor) ?? null;
  }

  const path = parts.join(" > ");
  const body = node.body ?? "";

  /*
    자리 이름과 쓴 글이 곧 검색어가 된다. **위 자리의 이름도 함께 넣는다.**
    `선행 연구`만으로는 낱말이 너무 적고, 위 자리의 이름이 주제를 담고 있다.
  */
  const keywords = extractKeywords(`${parts.join(" ")} ${body}`);

  if (keywords.length === 0) {
    return fail(
      nodeId.data,
      "자리 이름에서 찾을 낱말을 뽑지 못했습니다. 이름을 조금 더 적거나 이 자리에 쓸 글을 적어 주세요.",
      decision.remaining,
    );
  }

  const candidates = await gatherCandidates(keywords);

  /*
    **이미 이 자리에 놓인 것은 뺀다.** 다른 자리에 놓인 것은 빼지 않는다.
    같은 재료를 여러 자리에 놓는 것은 정상이다. (설계 문서 7.1절 2번)
  */
  const placedHere = new Set(
    placements
      .filter((item) => item.nodeId === nodeId.data)
      .map((item) =>
        item.kind === "source"
          ? `source:${item.sourceId}`
          : `capture:${item.captureId}`,
      ),
  );

  const pool = candidates
    .filter((item) => !placedHere.has(item.value))
    .map((item, position) => ({ ...item, index: position + 1 }));

  if (pool.length === 0) {
    return fail(
      nodeId.data,
      "이 자리의 낱말과 겹치는 것을 담아둔 것에서 찾지 못했습니다.",
      decision.remaining,
    );
  }

  const result = await askWhatFitsHere({
    node: { path, body },
    items: pool.map((item) => ({
      index: item.index,
      kind: item.kind,
      origin: item.origin,
      text: item.text,
    })),
  });

  await recordAiUsage({
    feature: "placement",
    provider: "anthropic",
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    outcome: result.ok ? "ok" : "failed",
  });

  if (!result.ok) {
    return fail(nodeId.data, result.message, decision.remaining - 1);
  }

  const fits: Fit[] = [];

  for (const line of result.fits) {
    const item = pool[line.itemIndex - 1];

    if (!item) {
      continue;
    }

    fits.push({
      value: item.value,
      kind: item.kind,
      label: item.text.slice(0, 80).replace(/\s+/g, " ").trim(),
      origin: item.origin,
      href: item.href,
      reason: line.reason,
    });
  }

  return {
    nodeId: nodeId.data,
    fits,
    /*
      **훑은 것의 이름을 함께 돌려준다.** 하나도 못 골랐을 때 후보에 아예
      없었던 것인지 AI가 안 고른 것인지 가리려면 이것이 있어야 한다.
    */
    looked: pool.map((item) => item.origin),
    error: null,
    remaining: decision.remaining - 1,
  };
}
