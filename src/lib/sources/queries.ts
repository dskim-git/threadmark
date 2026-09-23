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
  "id, type, status, title, subtitle, original_url, created_at, updated_at";

const DETAIL_COLUMNS =
  "id, type, status, title, subtitle, description, original_url, canonical_url, thumbnail_url, created_at, updated_at";

export type SourceListItem = {
  id: string;
  type: SourceType;
  /** 읽을 후보인지 손에 있는 자료인지. (설계 문서 8.4절) */
  status: SourceStatus;
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
 */
export async function listSources(
  type?: SourceType,
  sort: SourceSort = DEFAULT_SOURCE_SORT,
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
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    originalUrl: data.original_url,
    canonicalUrl: data.canonical_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** 유형별 보관 수. 목록 화면의 필터에 쓴다. */
export async function countSourcesByType(): Promise<Record<string, number>> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .select("type")
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] 자료 수 조회 실패:", error.message);

    return {};
  }

  const counts: Record<string, number> = {};

  for (const row of data ?? []) {
    counts[row.type] = (counts[row.type] ?? 0) + 1;
  }

  return counts;
}
