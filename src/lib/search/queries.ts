import {
  PROFILE_SEARCH_TARGETS,
  matchedProfileText,
} from "./profile-targets";
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
 *   자료      제목, 부제, 설명
 *   기록      적은 글, 원문, 번역문
 *   딸린 정보 가수·장르·배우·학술지·채널·장소 주소, 그리고 사용자가 쓴 글
 *
 * **딸린 정보는 2026-09-26에 들어왔다.** 그전까지 `AI에게 물어보기`만
 * 그것을 뒤지고 있었다. 같은 앱 안에서 **찾는 힘이 둘로 갈려 있었고**,
 * 사용법은 오히려 글자로 찾기가 "빠르고 돈이 들지 않는다"고 권했다.
 *
 * 9월 25일에 사용자가 찾은 고장이 **한쪽에만 남아 있던 것**이다. 고칠 곳이
 * 여럿일 때 한 곳만 고치면 이렇게 된다. 뒤질 곳 목록은 두 검색이 같은
 * 것(`PROFILE_SEARCH_TARGETS`)을 본다. 두 벌이 되면 또 갈린다.
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
  /**
   * 딸린 정보에서 걸렸을 때 **무엇이 걸렸는지.**
   *
   * 제목·부제·설명에서 걸린 것은 `null`이다. 그쪽은 화면에 이미 보이므로
   * 왜 나왔는지 눈에 보인다. 주소나 가수 이름에서 걸린 것은 화면 어디에도
   * 없어서, **적지 않으면 엉뚱한 것이 섞였다고 여기게 된다.**
   */
  matchedIn: string | null;
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

  /*
    딸린 정보 표를 표마다 따로 묻는다. 까닭은 `profile-targets.ts`에 적었다.
    뷰를 만들거나 글자를 이어 붙여 한 질의로 만드는 길은 새는 구멍이 생긴다.

    돌려받는 것은 **자료 번호와 걸린 값들**이다. 그 번호로 자료를 다시
    읽는다. 여기서 자료를 함께 읽지 않는 까닭은, 표마다 조인을 쓰면
    삭제 표시와 갈래를 거르는 규칙이 일곱 벌이 되기 때문이다.
  */
  const profileQueries = PROFILE_SEARCH_TARGETS.flatMap((target) => {
    const columns = ["source_id", ...target.text, ...target.arrays].join(",");
    const queries = [];

    if (target.text.length > 0) {
      queries.push(
        supabase
          .from(target.table)
          .select(columns)
          .or(buildIlikeFilter(target.text, term))
          .limit(SEARCH_LIMIT),
      );
    }

    /*
      배열 칸은 낱말이 통째로 같은지로 찾는다. `overlaps`가 그 일을 한다.
      그래서 `스릴러`는 찾고 `스릴`은 못 찾는다. 적어두고 넘어간다.
    */
    for (const column of target.arrays) {
      queries.push(
        supabase
          .from(target.table)
          .select(columns)
          .overlaps(column, [term])
          .limit(SEARCH_LIMIT),
      );
    }

    return queries;
  });

  const [sourceResult, captureResult, ...profileResults] = await Promise.all([
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
    ...profileQueries,
  ]);

  if (sourceResult.error) {
    console.error("[ThreadMark] 자료 검색 실패:", sourceResult.error.message);
  }

  if (captureResult.error) {
    console.error("[ThreadMark] 기록 검색 실패:", captureResult.error.message);
  }

  /*
    딸린 정보에서 걸린 자료 번호와 **걸린 까닭**을 모은다.

    한 자료가 여러 표에서 걸릴 수 있다. 그때는 먼저 온 까닭을 쓴다.
    까닭을 다 이어 붙이면 줄이 길어져 무엇이 걸렸는지 오히려 안 보인다.
  */
  const matchedBy = new Map<string, string>();

  for (const result of profileResults) {
    if (result.error) {
      /*
        **한 표가 실패해도 나머지는 보여준다.** 딸린 정보를 못 읽은 것이
        제목으로 찾은 것까지 버릴 이유는 아니다. 다만 조용히 넘기지 않고
        서버 기록에 남긴다. 잦으면 덜 나오고 있다는 뜻이다.
      */
      console.error("[ThreadMark] 딸린 정보 검색 실패:", result.error.message);

      continue;
    }

    for (const row of result.data ?? []) {
      const record = row as unknown as Record<string, unknown>;
      const sourceId = record.source_id;

      if (typeof sourceId !== "string" || matchedBy.has(sourceId)) {
        continue;
      }

      const why = matchedProfileText(record, term);

      if (why !== null) {
        matchedBy.set(sourceId, why);
      }
    }
  }

  /*
    걸린 자료를 읽는다. **제목으로 이미 걸린 것은 빼고 묻는다.** 그래야
    한 번 더 읽지 않고, 이 질의가 돌려주는 것은 전부 새로 더해질 것이다.
  */
  const alreadyFound = new Set((sourceResult.data ?? []).map((row) => row.id));
  const toFetch = [...matchedBy.keys()].filter((id) => !alreadyFound.has(id));

  const profileSourceResult =
    toFetch.length === 0
      ? null
      : await supabase
          .from("sources")
          .select("id, type, status, title, subtitle, description, created_at")
          .is("deleted_at", null)
          .in("id", toFetch.slice(0, SEARCH_LIMIT))
          .order("created_at", { ascending: false })
          .limit(SEARCH_LIMIT);

  if (profileSourceResult?.error) {
    console.error(
      "[ThreadMark] 딸린 정보로 걸린 자료 조회 실패:",
      profileSourceResult.error.message,
    );
  }

  const sourceRows = [
    ...(sourceResult.data ?? []),
    ...(profileSourceResult?.data ?? []),
  ];

  const sources = sourceRows.flatMap((row) => {
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
        /*
          **제목으로 이미 걸린 것에는 까닭을 붙이지 않는다.** 그쪽은 왜
          나왔는지 화면에 보인다. 주소에도 함께 걸렸다고 한 줄 더 적으면
          맞는 말이긴 해도 아무것도 알려주지 않고 줄만 길어진다.

          이 칸은 **화면 어디에도 까닭이 안 보일 때**를 위한 것이다.
        */
        matchedIn: alreadyFound.has(row.id)
          ? null
          : (matchedBy.get(row.id) ?? null),
      } satisfies SourceHit,
    ];
  });

  /*
    합친 목록을 다시 정렬한다. 두 질의가 저마다 최근 순으로 왔으므로,
    이어 붙이면 **가운데에서 날짜가 거꾸로 올라간다.**

    정렬한 뒤에 자른다. 자르고 정렬하면 뒤쪽 것이 먼저 잘려, 제목으로 걸린
    것만 남고 딸린 정보로 걸린 것이 통째로 사라진다.
  */
  sources.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sources.length = Math.min(sources.length, SEARCH_LIMIT);

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
