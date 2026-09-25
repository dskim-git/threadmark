"use server";

import { z } from "zod";

import { isAiSearchConfigured } from "@/lib/ai/anthropic";
import {
  MAX_PLACEMENT_ITEMS,
  MAX_PLACEMENT_NODES,
  type PlacementItem,
  type PlacementNode,
} from "@/lib/ai/placement";
import { askWhereToPlace } from "@/lib/ai/placement-anthropic";
import {
  decideAiCallNow,
  recordAiUsage,
} from "@/lib/ai/usage-queries";
import { requireActiveAccount } from "@/lib/auth/account";
import { listPlacements } from "@/lib/projects/placement-queries";
import { listOutline } from "@/lib/projects/outline-queries";
import {
  listProjectCaptures,
  listProjectSources,
} from "@/lib/projects/queries";
import { formValue } from "@/lib/sources/schema";

import type { SuggestState, Suggestion } from "./suggest-state";

/**
 * 자리를 못 찾은 재료들이 어디에 어울리는지 물어본다. (19-D, 설계 문서 19절)
 *
 * **화면이 보낸 것은 프로젝트 번호 하나뿐이다.** 자리와 재료는 여기서
 * 데이터베이스를 보고 모은다. 화면이 보낸 글을 그대로 AI에 넘기면 두 가지가
 * 잘못된다. 내용을 바꿔 보낼 수 있고, 남의 것을 보내볼 수도 있다.
 * **RLS는 우리가 데이터베이스에 물어볼 때만 지켜준다.**
 *
 * 네 겹으로 막는다.
 *   1. `requireActiveAccount` — 승인된 계정인가
 *   2. 프로젝트가 내 것인가 — 내 것이 아니면 자리가 하나도 안 나온다
 *   3. 월 한도 — 이번 달에 얼마나 썼는가
 *   4. RLS — 모으는 질의 전부에 걸린다
 */

const idSchema = z.string().uuid();

function fail(error: string, remaining: number | null): SuggestState {
  return { suggestions: null, skipped: 0, error, remaining };
}

export async function suggestPlacements(
  _previous: SuggestState,
  formData: FormData,
): Promise<SuggestState> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));

  if (!projectId.success) {
    return fail("어느 프로젝트인지 알 수 없습니다.", null);
  }

  if (!isAiSearchConfigured()) {
    return fail(
      "AI 기능이 아직 설정되지 않았습니다. 운영자에게 알려 주세요.",
      null,
    );
  }

  /*
    한도를 먼저 본다. 모으는 것은 돈이 들지 않지만, 한도에 걸린 사람에게
    "모았는데 못 물어봅니다"를 보여줄 이유가 없다.
  */
  const decision = await decideAiCallNow();

  if (decision === null) {
    // 모르면 거부한다. (AGENTS.md 5절 7번)
    return fail(
      "얼마나 쓰셨는지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      null,
    );
  }

  if (!decision.allowed) {
    return fail(
      `이번 달에 ${decision.limit}번까지 물어볼 수 있는데 다 쓰셨습니다. 다음 달 1일에 다시 채워집니다.`,
      0,
    );
  }

  const [outline, placements, sources, captures] = await Promise.all([
    listOutline(projectId.data),
    listPlacements(projectId.data),
    listProjectSources(projectId.data),
    listProjectCaptures(projectId.data),
  ]);

  if (outline.length === 0) {
    return fail(
      "먼저 뼈대에 자리를 만들어 주세요. 놓을 자리가 있어야 고를 수 있습니다.",
      decision.remaining,
    );
  }

  /*
    자리 이름에 위 자리를 이어 붙인다.

    `선행 연구`만 넘기면 그것이 2장 아래인지 4장 아래인지 알 수 없다.
    **뼈대에서 위치가 곧 뜻이다.** 깊이를 담지 않으므로(설계 문서 7.3절)
    부모를 따라 올라가며 잇는다.
  */
  const titleById = new Map(outline.map((item) => [item.id, item.title]));
  const parentById = new Map(outline.map((item) => [item.id, item.parentId]));

  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let current: string | null = id;

    // 깊이에 한계가 없으므로 도는 횟수에 울타리를 둔다.
    for (let step = 0; current !== null && step < 50; step += 1) {
      const title = titleById.get(current);

      if (title === undefined) {
        break;
      }

      parts.unshift(title);
      current = parentById.get(current) ?? null;
    }

    return parts.join(" > ");
  };

  const nodes: PlacementNode[] = outline
    .slice(0, MAX_PLACEMENT_NODES)
    .map((item, position) => ({
      index: position + 1,
      id: item.id,
      path: pathOf(item.id),
      body: item.body ?? "",
    }));

  /*
    이미 어딘가에 놓인 것은 뺀다. **프로젝트에 이어두었지만 아직 자리를
    못 찾은 것**만 묻는다. 화면의 `아직 자리를 못 찾은 것` 칸과 같은 셈이다.
  */
  const placed = new Set(
    placements.map((item) =>
      item.kind === "source"
        ? `source:${item.sourceId}`
        : `capture:${item.captureId}`,
    ),
  );

  const items: PlacementItem[] = [];

  for (const source of sources) {
    const value = `source:${source.id}`;

    if (placed.has(value) || items.length >= MAX_PLACEMENT_ITEMS) {
      continue;
    }

    items.push({
      index: items.length + 1,
      value,
      kind: "source",
      label: source.title,
      text: source.title,
    });
  }

  for (const capture of captures) {
    const value = `capture:${capture.id}`;

    if (placed.has(value) || items.length >= MAX_PLACEMENT_ITEMS) {
      continue;
    }

    const text = [capture.content, capture.originalText]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .trim();

    items.push({
      index: items.length + 1,
      value,
      kind: "capture",
      label:
        text.slice(0, 60).trim() ||
        capture.sourceTitle ||
        "내용 없는 기록",
      text: text.length > 0 ? text : (capture.sourceTitle ?? ""),
    });
  }

  if (items.length === 0) {
    return fail(
      "자리를 못 찾은 재료가 없습니다. 먼저 이 프로젝트에 자료나 기록을 이어 주세요.",
      decision.remaining,
    );
  }

  const result = await askWhereToPlace({ nodes, items });

  await recordAiUsage({
    feature: "placement",
    provider: "anthropic",
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    outcome: result.ok ? "ok" : "failed",
  });

  if (!result.ok) {
    return fail(result.message, decision.remaining - 1);
  }

  if (result.dangling > 0) {
    console.error(
      `[ThreadMark] 자리 추천이 없는 번호를 ${result.dangling}줄 가리켰습니다. (자리 ${nodes.length}개, 재료 ${items.length}개)`,
    );
  }

  /*
    번호를 다시 우리 것으로 바꾼다. **여기서 없는 번호는 이미 걸러졌다.**
    (`parsePlacementAnswer`) 그래도 찾지 못하면 그 줄은 버린다.
  */
  const suggestions: Suggestion[] = [];

  for (const line of result.suggestions) {
    const item = items[line.itemIndex - 1];
    const node = nodes[line.nodeIndex - 1];

    if (!item || !node) {
      continue;
    }

    suggestions.push({
      value: item.value,
      itemLabel: item.label,
      kind: item.kind,
      nodeId: node.id,
      nodePath: node.path,
      reason: line.reason,
    });
  }

  return {
    suggestions,
    skipped: items.length - suggestions.length,
    error: null,
    remaining: decision.remaining - 1,
  };
}
