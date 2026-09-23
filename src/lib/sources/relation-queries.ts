import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  isSourceRelationType,
  type SourceRelationType,
} from "./relation-types.ts";
import { isSourceType, type SourceType } from "./types.ts";

/**
 * 자료끼리의 관계 조회. (설계 문서 8.4절)
 *
 * 다른 조회 계층과 같은 원칙을 따른다. 먼저 승인된 계정인지 확인하고,
 * 화면이 확인했으리라 가정하지 않는다. (보안 원칙 5)
 *
 * 두 방향을 따로 읽는다. 관계에는 방향이 있어서, A가 B를 인용하는 것과
 * B가 A를 인용하는 것은 다른 사실이다. 한 덩어리로 돌려주면 화면이
 * 그 둘을 다시 갈라야 한다.
 */

/** 두 갈래 모두 같은 열을 읽는다. 한 곳에서만 정한다. */
const RELATION_COLUMNS = "id, relation_type, created_at";

/*
  sources를 두 번 가리키므로 어느 외래키를 따라갈지 이름으로 밝혀야 한다.
  밝히지 않으면 어느 쪽인지 알 수 없어 조회가 거부된다.
*/
const TO_SOURCE_JOIN =
  "sources!source_relations_to_source_id_fkey (id, type, title, deleted_at)";
const FROM_SOURCE_JOIN =
  "sources!source_relations_from_source_id_fkey (id, type, title, deleted_at)";

export type RelatedSource = {
  /** 관계 자체의 id. 끊을 때 쓴다. */
  relationId: string;
  relationType: SourceRelationType;
  /** 상대 자료. 이 자료가 아니라 건너편이다. */
  id: string;
  type: SourceType;
  title: string;
};

export type SourceRelations = {
  /** 이 자료에서 상대로 가는 것. */
  outgoing: RelatedSource[];
  /** 상대에서 이 자료로 오는 것. */
  incoming: RelatedSource[];
};

type JoinedRow = {
  id: string;
  relation_type: string;
  sources: {
    id: string;
    type: string;
    title: string;
    deleted_at: string | null;
  } | null;
};

/**
 * 한 줄을 우리 모양으로 옮긴다.
 *
 * 삭제 표시된 자료는 걸러낸다. 자료 목록에서 사라진 것이 관계에만 남아
 * 있으면, 눌러도 404가 나는 줄이 된다. 관계 자체는 지우지 않으므로
 * 자료를 되살리면 관계도 함께 돌아온다.
 *
 * 모르는 관계 종류도 걸러내지 않는다. 화면이 "관련 자료"로 뭉뚱그려
 * 보여준다. 여기서 막으면 15단계에서 음악용 값을 더한 직후, 타입을 다시
 * 생성하기 전까지 목록이 통째로 비어 보인다.
 */
function toRelated(row: JoinedRow): RelatedSource[] {
  const other = row.sources;

  if (!other || other.deleted_at !== null || !isSourceType(other.type)) {
    return [];
  }

  if (!isSourceRelationType(row.relation_type)) {
    return [];
  }

  return [
    {
      relationId: row.id,
      relationType: row.relation_type,
      id: other.id,
      type: other.type,
      title: other.title,
    },
  ];
}

/** 자료 하나에 걸린 관계를 두 방향 모두. */
export async function listSourceRelations(
  sourceId: string,
): Promise<SourceRelations> {
  await requireActiveAccount();

  const supabase = await createClient();

  // RLS의 source_relations_select_own 정책이 내 것만 돌려준다.
  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("source_relations")
      .select(`${RELATION_COLUMNS}, ${TO_SOURCE_JOIN}`)
      .eq("from_source_id", sourceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("source_relations")
      .select(`${RELATION_COLUMNS}, ${FROM_SOURCE_JOIN}`)
      .eq("to_source_id", sourceId)
      .order("created_at", { ascending: false }),
  ]);

  if (outgoing.error) {
    console.error(
      "[ThreadMark] 나간 관계 조회 실패:",
      outgoing.error.message,
    );
  }

  if (incoming.error) {
    console.error(
      "[ThreadMark] 들어온 관계 조회 실패:",
      incoming.error.message,
    );
  }

  // 모르면 없는 것으로 본다. 화면은 "아직 이어둔 자료가 없다"를 보여준다.
  return {
    outgoing: (outgoing.data ?? []).flatMap((row) =>
      toRelated(row as unknown as JoinedRow),
    ),
    incoming: (incoming.data ?? []).flatMap((row) =>
      toRelated(row as unknown as JoinedRow),
    ),
  };
}
