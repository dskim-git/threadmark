/**
 * 물음에 관련된 것을 모은다. (설계 문서 19절)
 *
 *   사용자 질문 → 사용자 권한과 Project 범위 확인 → 키워드 검색 + 벡터 검색
 *   → 관련 Capture 선별 → AI가 관계 설명
 *
 * 벡터 검색은 미뤘다. 그 까닭은 `docs/VERIFICATION.md` 4-40절에 적었다.
 *
 * 남의 것이 섞일 길
 *   두 표 모두 RLS가 본인 행만 돌려준다. 여기서 `owner_id` 조건을 다시
 *   적지 않는 이유는 `src/lib/search/queries.ts`와 같다. 두 벌이 되면
 *   한쪽만 고쳐졌을 때 어느 쪽이 맞는지 알 수 없다.
 *
 *   **이 판단은 벡터 검색을 붙이는 날 다시 해야 한다.** 벡터 검색은 보통
 *   `SECURITY DEFINER` 함수 안에서 돌고, 그러면 RLS가 지나가지 않는다.
 *   19절이 "벡터 검색 전후 모두 owner_id와 공유 권한을 검사한다"고 못 박은
 *   것이 그 이야기다. 지금은 그 길이 없어서 RLS 하나로 충분하다.
 *
 * 왜 기록을 자료보다 먼저 넣는가
 *   19절: "전체 PDF보다 사용자가 저장한 Capture를 우선 임베딩한다."
 *   임베딩이 아니라 넘기는 순서에도 같은 뜻이 든다. 자료의 제목과 설명은
 *   **밖에서 받아온 값**이고, 기록은 **사용자가 직접 적은 것**이다.
 *   글자 수가 찰 때 남아야 할 쪽은 뒤엣것이다.
 */

import { requireActiveAccount } from "@/lib/auth/account";
import { buildIlikeFilter } from "@/lib/search/query";
import { createClient } from "@/lib/supabase/server";

import type { AskItem } from "./types";

/** 기록은 최대 몇 개까지 모을까. */
export const MAX_CAPTURES = 40;

/** 자료는 최대 몇 개까지 모을까. 기록보다 적게 둔다. */
export const MAX_SOURCES = 20;

/**
 * 한 자료에서 잘라 넘길 글자 수.
 *
 * 인용 하나가 통째로 아주 길 수 있다. 한 덩이가 전부를 차지하면 나머지
 * 기록이 하나도 못 들어간다. **긴 것 하나보다 여러 개가 낫다.**
 */
export const MAX_ITEM_CHARS = 1200;

/**
 * 한 번에 넘길 글자 수의 합.
 *
 * **이 값이 한 요청의 최대 비용을 정한다.** 한글 한 글자가 토큰 하나
 * 남짓이므로, 2만 자면 2만 토큰 어름이다. `limits.ts`의 200번이 이 크기를
 * 전제로 셈한 값이다. 이 값을 올리면 그쪽도 다시 본다.
 */
export const MAX_TOTAL_CHARS = 20_000;

/** 넘길 글자가 이보다 짧으면 넣지 않는다. 빈 기록이 자리만 차지한다. */
const MIN_ITEM_CHARS = 2;

/**
 * 키워드로 자료와 기록을 모은다.
 *
 * 찾은 것이 하나도 없으면 빈 목록이다. 그때는 부르는 쪽이 **AI에 물어보지
 * 않는다.** 넘길 것이 없는데 물으면 모델이 아는 것으로 답을 지어내고,
 * 그것이 담아둔 것처럼 보인다.
 */
export async function gatherCandidates(
  keywords: readonly string[],
): Promise<AskItem[]> {
  await requireActiveAccount();

  if (keywords.length === 0) {
    return [];
  }

  const supabase = await createClient();

  /*
    낱말마다 조건을 만들어 `또는`으로 잇는다. 하나라도 걸리면 후보다.
    좁히는 것은 그다음에 AI가 한다.
  */
  const captureFilter = keywords
    .map((keyword) =>
      buildIlikeFilter(["content", "original_text", "translated_text"], keyword),
    )
    .join(",");

  const sourceFilter = keywords
    .map((keyword) =>
      buildIlikeFilter(["title", "subtitle", "description"], keyword),
    )
    .join(",");

  const [captureResult, sourceResult] = await Promise.all([
    supabase
      .from("captures")
      .select(
        "id, capture_type, content, original_text, source_id, created_at, sources (title, deleted_at)",
      )
      .is("deleted_at", null)
      .or(captureFilter)
      .order("created_at", { ascending: false })
      .limit(MAX_CAPTURES),
    supabase
      .from("sources")
      .select("id, title, subtitle, description, created_at")
      .is("deleted_at", null)
      .or(sourceFilter)
      .order("created_at", { ascending: false })
      .limit(MAX_SOURCES),
  ]);

  if (captureResult.error) {
    console.error(
      "[ThreadMark] AI 후보(기록) 조회 실패:",
      captureResult.error.message,
    );
  }

  if (sourceResult.error) {
    console.error(
      "[ThreadMark] AI 후보(자료) 조회 실패:",
      sourceResult.error.message,
    );
  }

  const items: AskItem[] = [];
  let used = 0;

  /** 글자 수가 남아 있으면 넣는다. 다 차면 그 뒤는 버린다. */
  const push = (item: Omit<AskItem, "index">) => {
    const text = item.text.slice(0, MAX_ITEM_CHARS).trim();

    if (text.length < MIN_ITEM_CHARS || used + text.length > MAX_TOTAL_CHARS) {
      return;
    }

    used += text.length;
    items.push({ ...item, text, index: items.length + 1 });
  };

  // 기록이 먼저다. 사용자가 직접 적은 것이기 때문이다.
  for (const row of captureResult.data ?? []) {
    const record = row as unknown as {
      id: string;
      content: string | null;
      original_text: string | null;
      source_id: string | null;
      sources: { title: string; deleted_at: string | null } | null;
    };

    /*
      삭제 표시된 자료에 딸린 기록은 넣지 않는다. 목록에서 사라진 것이
      근거로 나오면 눌러도 갈 데가 없다. (`search/queries.ts`와 같은 판단)
    */
    if (record.source_id !== null && record.sources?.deleted_at !== null) {
      continue;
    }

    const text = [record.content, record.original_text]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .trim();

    push({
      kind: "capture",
      href: record.source_id ? `/sources/${record.source_id}` : null,
      origin: record.sources?.title ?? "자료에 붙지 않은 기록",
      text,
    });
  }

  for (const row of sourceResult.data ?? []) {
    const text = [row.subtitle, row.description]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .trim();

    push({
      kind: "source",
      href: `/sources/${row.id}`,
      origin: row.title,
      // 설명이 비어 있는 자료도 제목만으로 뜻이 있다.
      text: text.length > 0 ? `${row.title}\n${text}` : row.title,
    });
  }

  return items;
}
