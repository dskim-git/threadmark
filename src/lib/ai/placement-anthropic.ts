/**
 * 자리 추천을 Claude에게 물어본다. (19-D)
 *
 * `anthropic.ts`와 나란한 파일이다. 둘을 한 파일에 두지 않은 까닭은
 * **지시문과 답의 모양이 아주 다르기** 때문이다. 물어보기는 사람이 읽을
 * 글을 받고, 이쪽은 짝 목록을 받는다. 한 함수에 두 모양을 넣으면 분기가
 * 늘고, 한쪽을 고칠 때 다른 쪽이 딸려 간다.
 *
 * **서버에서만 부른다.** API 키는 브라우저에 내려가지 않는다.
 *
 * 모델과 예산은 `anthropic.ts`와 같은 것을 쓴다. 같은 Workspace에서 같은
 * 돈이 나가고, 설계 문서 18.1절이 정한 상한도 하나다.
 */

import Anthropic from "@anthropic-ai/sdk";

import { getSearchModel, isAiSearchConfigured } from "./anthropic";
import {
  buildFitItems,
  buildNodeFitSystemPrompt,
  buildNodeQuestion,
  buildPlacementItems,
  buildPlacementQuestion,
  buildPlacementSystemPrompt,
  parseNodeFitAnswer,
  parsePlacementAnswer,
  countDanglingLines,
  type NodeFit,
  type PlacementItem,
  type PlacementNode,
  type PlacementSuggestion,
} from "./placement";
import type { AskFailureReason } from "./types";

export { isAiSearchConfigured };

/**
 * 나오는 글의 상한.
 *
 * 한 줄에 재료 하나이고 재료는 스무 개까지다. 까닭 한 줄씩 붙어도 길지
 * 않다. 물어보기(4000)보다 작게 둔다. **길게 쓸 일이 없는데 자리를 열어
 * 두면 그만큼 값이 오를 수 있다.**
 */
const MAX_OUTPUT_TOKENS = 2000;

export type PlacementResult =
  | {
      ok: true;
      suggestions: PlacementSuggestion[];
      /** 답이 가리킨 없는 번호의 개수. 서버 기록에만 쓴다. */
      dangling: number;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      ok: false;
      reason: AskFailureReason;
      message: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    };

export async function askWhereToPlace(input: {
  nodes: readonly PlacementNode[];
  items: readonly PlacementItem[];
}): Promise<PlacementResult> {
  const model = getSearchModel();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();

  if (apiKey.length === 0) {
    return {
      ok: false,
      reason: "not_configured",
      message: "AI 기능이 아직 설정되지 않았습니다.",
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const client = new Anthropic({ apiKey });

  const content = [
    buildPlacementQuestion(input.nodes),
    "",
    buildPlacementItems(input.items),
  ].join("\n");

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildPlacementSystemPrompt(),
      /*
        스무 개를 스물한 자리에 맞추는 일이라 생각할 자리를 준다.
        물어보기와 같은 깊이다. 올리려면 한도(`limits.ts`)를 함께 내린다.
      */
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content }],
    });

    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        reason: "refused",
        message: "이번에는 자리를 고르지 않았습니다. 잠시 후 다시 해보세요.",
        model,
        inputTokens,
        outputTokens,
      };
    }

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const suggestions = parsePlacementAnswer(
      answer,
      input.items.length,
      input.nodes.length,
    );

    return {
      ok: true,
      suggestions,
      dangling: countDanglingLines(
        answer,
        input.items.length,
        input.nodes.length,
      ),
      model,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    /*
      무엇이 왜 안 됐는지는 서버 기록에만 남긴다. 화면에는 다시 해볼 만한
      일인지만 알려준다. (번역·물어보기와 같은 판단)
    */
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[ThreadMark] 자리 추천이 제한되었습니다.");

      return {
        ok: false,
        reason: "rate_limited",
        message: "요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.",
        model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[ThreadMark] AI API 키가 거부되었습니다.");

      return {
        ok: false,
        reason: "not_configured",
        message: "AI 기능 설정에 문제가 있습니다. 운영자에게 알려 주세요.",
        model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    console.error(
      "[ThreadMark] 자리 추천 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return {
      ok: false,
      reason: "failed",
      message: "자리를 물어보지 못했습니다. 잠시 후 다시 시도해 주세요.",
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export type NodeFitResult =
  | {
      ok: true;
      fits: NodeFit[];
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      ok: false;
      reason: AskFailureReason;
      message: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    };

/**
 * 자리 하나에 어울리는 것을 후보 중에서 고른다. (19-D-2)
 *
 * 위의 `askWhereToPlace`와 방향이 반대다. 그쪽은 재료마다 자리를 고르고
 * 이쪽은 자리 하나에 재료를 고른다. 후보는 **담아둔 것 전부에서 키워드로
 * 좁혀 온 것**이라, 대부분 상관없을 수 있다는 것을 지시문이 말해준다.
 */
export async function askWhatFitsHere(input: {
  node: { path: string; body: string };
  items: readonly {
    index: number;
    kind: string;
    origin: string;
    text: string;
  }[];
}): Promise<NodeFitResult> {
  const model = getSearchModel();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();

  if (apiKey.length === 0) {
    return {
      ok: false,
      reason: "not_configured",
      message: "AI 기능이 아직 설정되지 않았습니다.",
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const client = new Anthropic({ apiKey });

  const content = [
    buildNodeQuestion(input.node),
    "",
    buildFitItems(input.items),
  ].join("\n");

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildNodeFitSystemPrompt(),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content }],
    });

    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        reason: "refused",
        message: "이번에는 고르지 않았습니다. 잠시 후 다시 해보세요.",
        model,
        inputTokens,
        outputTokens,
      };
    }

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      ok: true,
      fits: parseNodeFitAnswer(answer, input.items.length),
      model,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[ThreadMark] 자리 추천이 제한되었습니다.");

      return {
        ok: false,
        reason: "rate_limited",
        message: "요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.",
        model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[ThreadMark] AI API 키가 거부되었습니다.");

      return {
        ok: false,
        reason: "not_configured",
        message: "AI 기능 설정에 문제가 있습니다. 운영자에게 알려 주세요.",
        model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    console.error(
      "[ThreadMark] 자리에 어울리는 것 고르기 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return {
      ok: false,
      reason: "failed",
      message: "물어보지 못했습니다. 잠시 후 다시 시도해 주세요.",
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}
