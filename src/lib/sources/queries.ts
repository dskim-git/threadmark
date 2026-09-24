import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_SOURCE_SORT,
  sourceSortOrder,
  type SourceSort,
} from "./sorting";
import {
  isSourceStatus,
  isSourceType,
  type SourceStatus,
  type SourceType,
} from "./types";

/**
 * Source 조회 계층.
 *
 * 모든 함수가 먼저 승인된 계정인지 확인한다. 화면이 확인했으리라 가정하지 않는다.
 * getAccount는 요청 단위로 캐시되므로 중복 확인에 추가 왕복이 생기지 않는다.
 *
 * 삭제 표시된 행은 RLS가 이미 걸러내지만 질의에서도 한 번 더 제외한다.
 * 정책이 나중에 느슨해지더라도 삭제된 자료가 목록에 섞이지 않게 하기 위해서다.
 */

const LIST_COLUMNS =
  "id, type, status, starred, title, subtitle, original_url, created_at, updated_at";

const DETAIL_COLUMNS =
  "id, type, status, starred, title, subtitle, description, original_url, canonical_url, thumbnail_url, created_at, updated_at";

export type SourceListItem = {
  id: string;
  type: SourceType;
  /** 읽을 후보인지 손에 있는 자료인지. (설계 문서 8.4절) */
  status: SourceStatus;
  /** 중요 표시(별). (설계 문서 5.2-1절) */
  starred: boolean;
  title: string;
  subtitle: string | null;
  originalUrl: string | null;
  createdAt: string;
};

export type SourceDetail = SourceListItem & {
  description: string | null;
  canonicalUrl: string | null;
  updatedAt: string;
};

/**
 * 내 자료 목록.
 *
 * 정렬을 화면이 정한다. 담은 순서만으로는 "제목은 아는데 언제 담았는지
 * 모르는" 경우에 찾을 방법이 없다. 정렬 값은 sorting.ts 한 곳에 있고,
 * 모르는 값은 그 쪽에서 기본값으로 바뀌어 들어온다.
 *
 * @param type 지정하면 해당 유형만 돌려준다.
 * @param sort 지정하지 않으면 최근에 담은 순이다.
 * @param starredOnly 참이면 별을 단 자료만 돌려준다. (설계 문서 5.2-1절)
 * @param onlyIds 주면 이 id에 든 자료만 돌려준다. 태그로 거를 때 쓴다.
 *   빈 배열을 주면 아무것도 돌려주지 않는다. "그 태그가 달린 자료가 없다"와
 *   "거르지 않는다"를 구분해야 하므로, 거르지 않을 때는 undefined를 준다.
 *   (설계 문서 20-1절)
 */
export async function listSources(
  type?: SourceType,
  sort: SourceSort = DEFAULT_SOURCE_SORT,
  starredOnly = false,
  onlyIds?: readonly string[],
): Promise<SourceListItem[]> {
  await requireActiveAccount();

  const supabase = await createClient();
  const order = sourceSortOrder(sort);

  let query = supabase
    .from("sources")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order(order.column, { ascending: order.ascending });

  if (type) {
    query = query.eq("type", type);
  }

  /*
    거르는 일을 데이터베이스에서 한다. 전부 받아와 브라우저 쪽에서 추리면
    자료가 늘어날수록 쓰지도 않을 것을 실어 나르게 된다.
    sources_owner_starred_created_idx가 이 조건을 받는다.
  */
  if (starredOnly) {
    query = query.eq("starred", true);
  }

  if (onlyIds !== undefined) {
    // 빈 배열이면 아무것도 나오지 않는다. 그것이 맞는 답이다.
    query = query.in("id", onlyIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ThreadMark] 자료 목록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row) =>
    isSourceType(row.type)
      ? [
          {
            id: row.id,
            type: row.type,
            // 모르는 상태는 보통의 자료로 본다. 목록에서 사라지게 두지 않는다.
            status: isSourceStatus(row.status) ? row.status : "active",
            starred: row.starred,
            title: row.title,
            subtitle: row.subtitle,
            originalUrl: row.original_url,
            createdAt: row.created_at,
          },
        ]
      : [],
  );
}

/**
 * 자료 하나를 가져온다. 없거나 내 것이 아니면 null을 돌려준다.
 *
 * 남의 자료를 요청했을 때 "없음"과 "권한 없음"을 구분하지 않는다.
 * 구분하면 어떤 id가 존재하는지 알려주는 셈이 된다.
 */
export async function getSourceById(id: string): Promise<SourceDetail | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 자료 조회 실패:", error.message);

    return null;
  }

  if (!data || !isSourceType(data.type)) {
    return null;
  }

  return {
    id: data.id,
    type: data.type,
    status: isSourceStatus(data.status) ? data.status : "active",
    starred: data.starred,
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    originalUrl: data.original_url,
    canonicalUrl: data.canonical_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export type SourceCounts = {
  /** 유형별 보관 수. 목록 화면의 유형 고르는 줄에 쓴다. */
  byType: Record<string, number>;
  /** 전부 몇 건인지. */
  total: number;
  /** 별을 단 것이 몇 건인지. (설계 문서 5.2-1절) */
  starred: number;
};

/**
 * 목록 화면의 고르는 줄에 쓰는 수.
 *
 * 유형별 수와 별 수를 한 번에 센다. 따로 세면 왕복이 둘이 되는데,
 * 어차피 같은 행들을 보고 세는 일이다.
 *
 * 걸러진 목록과 무관하게 **항상 전체**를 센다. 별만 보는 중에도 "전체
 * 몇 건"이 보여야 돌아갈 곳이 있는지 알 수 있다.
 */
export async function countSources(): Promise<SourceCounts> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .select("type, starred")
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] 자료 수 조회 실패:", error.message);

    return { byType: {}, total: 0, starred: 0 };
  }

  const byType: Record<string, number> = {};
  let starred = 0;

  for (const row of data ?? []) {
    byType[row.type] = (byType[row.type] ?? 0) + 1;

    if (row.starred) {
      starred += 1;
    }
  }

  return { byType, total: (data ?? []).length, starred };
}
