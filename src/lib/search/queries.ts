import { requireActiveAccount } from "@/lib/auth/account";
import { isCaptureType, type CaptureType } from "@/lib/captures/types";
import { createClient } from "@/lib/supabase/server";
import { isSourceStatus, isSourceType } from "@/lib/sources/types";
import type { SourceStatus, SourceType } from "@/lib/sources/types";

import { buildIlikeFilter } from "./query.ts";

/**
 * 앱 안에서 글자로 찾기. (설계 문서 22절 "기본 키워드 검색")
 *
 * 지금까지 자료를 찾는 방법은 유형으로 거르고 눈으로 훑는 것뿐이었다.
 * 열 개일 때는 되지만 백 개가 되면 담아둔 것을 다시 못 찾는다.
 *
 * 무엇을 뒤지는가
 *   자료  제목, 부제, 설명
 *   기록  적은 글, 원문, 번역문
 *
 * 남의 것이 섞일 길은 없다. 두 표 모두 RLS가 본인 행만 돌려준다.
 * 여기서 owner_id 조건을 다시 적지 않는 이유는, 두 벌이 되면 한쪽만
 * 고쳐졌을 때 어느 쪽이 맞는지 알 수 없기 때문이다. (11단계와 같은 생각)
 *
 * 찾은 개수를 세지 않고 목록만 돌려준다. 개수를 따로 세려면 질의가 한 벌
 * 더 필요한데, 화면이 보여주는 것은 결국 목록이다.
 */

/** 한 번에 보여줄 최대 개수. 넘치면 검색어를 좁히라고 알린다. */
export const SEARCH_LIMIT = 50;

export type SourceHit = {
  id: string;
  type: SourceType;
  status: SourceStatus;
  title: string;
  subtitle: string | null;
  description: string | null;
  createdAt: string;
};

export type CaptureHit = {
  id: string;
  captureType: CaptureType;
  content: string | null;
  originalText: string | null;
  sourceId: string | null;
  sourceTitle: string | null;
  createdAt: string;
};

export type SearchResults = {
  sources: SourceHit[];
  captures: CaptureHit[];
};

/** 자료와 기록을 함께 찾는다. 둘을 따로 부르지 않아도 되게 한 번에 묶는다. */
export async function search(term: string): Promise<SearchResults> {
  await requireActiveAccount();

  const supabase = await createClient();

  const [sourceResult, captureResult] = await Promise.all([
    supabase
      .from("sources")
      .select("id, type, status, title, subtitle, description, created_at")
      .is("deleted_at", null)
      .or(buildIlikeFilter(["title", "subtitle", "description"], term))
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase
      .from("captures")
      .select(
        "id, capture_type, content, original_text, source_id, created_at, sources (title, deleted_at)",
      )
      .is("deleted_at", null)
      .or(buildIlikeFilter(["content", "original_text", "translated_text"], term))
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT),
  ]);

  if (sourceResult.error) {
    console.error("[ThreadMark] 자료 검색 실패:", sourceResult.error.message);
  }

  if (captureResult.error) {
    console.error("[ThreadMark] 기록 검색 실패:", captureResult.error.message);
  }

  const sources = (sourceResult.data ?? []).flatMap((row) => {
    if (!isSourceType(row.type)) {
      return [];
    }

    return [
      {
        id: row.id,
        type: row.type,
        status: isSourceStatus(row.status) ? row.status : "active",
        title: row.title,
        subtitle: row.subtitle,
        description: row.description,
        createdAt: row.created_at,
      } satisfies SourceHit,
    ];
  });

  const captures = (captureResult.data ?? []).flatMap((row) => {
    const record = row as unknown as {
      id: string;
      capture_type: string;
      content: string | null;
      original_text: string | null;
      source_id: string | null;
      created_at: string;
      sources: { title: string; deleted_at: string | null } | null;
    };

    if (!isCaptureType(record.capture_type)) {
      return [];
    }

    /*
      삭제 표시된 자료에 딸린 기록은 보여주지 않는다. 자료 목록에서 사라진
      것이 검색에서만 나오면, 눌러도 갈 데가 없는 줄이 된다.
      자료에 붙지 않은 독립 기록(source_id가 null)은 그대로 보여준다.
    */
    if (record.source_id !== null && record.sources?.deleted_at !== null) {
      return [];
    }

    return [
      {
        id: record.id,
        captureType: record.capture_type,
        content: record.content,
        originalText: record.original_text,
        sourceId: record.source_id,
        sourceTitle: record.sources?.title ?? null,
        createdAt: record.created_at,
      } satisfies CaptureHit,
    ];
  });

  return { sources, captures };
}
