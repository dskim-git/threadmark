import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 태그 조회 계층. (설계 문서 20-1절)
 *
 * sources·captures와 같은 원칙을 따른다. 모든 함수가 먼저 승인된 계정인지
 * 확인하고, 남의 것이 섞일 길은 RLS가 막는다. 여기서 owner_id 조건을 다시
 * 적지 않는 이유는 두 벌이 되면 한쪽만 고쳐졌을 때 어느 쪽이 맞는지 알 수
 * 없기 때문이다.
 */

export type Tag = {
  id: string;
  /** 사람이 보는 이름. 처음 친 모양 그대로다. */
  name: string;
  /** 주소에 넣는 값. 같은 태그인지 판정하는 값이기도 하다. */
  slug: string;
};

export type TagWithCount = Tag & {
  /** 이 태그를 단 자료 수. */
  sourceCount: number;
  /** 이 태그를 단 기록 수. */
  captureCount: number;
};

/**
 * 내 태그 전부. 이름순이다.
 *
 * 고르는 줄과 다는 칸이 함께 쓴다. 다는 칸에서는 이미 쓴 태그를 눌러서 달 수
 * 있어야 한다. 그러지 않으면 같은 태그를 매번 손으로 치게 되고, 조금씩 다르게
 * 쳐서 결국 비슷한 태그가 여럿 쌓인다.
 */
export async function listTags(): Promise<Tag[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 태그 목록 조회 실패:", error.message);

    return [];
  }

  return data ?? [];
}

/**
 * 내 태그와 그 태그를 단 개수.
 *
 * 개수를 함께 보여주는 이유는 두 가지다. 하나는 어느 태그가 실제로 쓰이는지
 * 보여주는 것이고, 다른 하나는 **누르면 무엇이 나올지 미리 알려주는 것**이다.
 * 눌렀는데 빈 목록이 나오면 고장인지 아닌지 알 수 없다.
 *
 * 자료와 기록을 따로 센다. 합쳐서 세면 `수업 준비 3`을 자료 목록에서 눌렀을
 * 때 하나만 나오는 일이 생긴다.
 */
export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    세 번 물어보고 여기서 합친다.

    PostgREST의 관계 개수 세기로 한 번에 받을 수도 있지만, 그 문법은 두 연결
    표를 한 질의에 담을 때 읽기 어려워지고, 개수가 0인 태그가 빠질 수 있다.
    세 질의 모두 내 행만 훑으므로 값이 싸다.
  */
  const [tags, sourceLinks, captureLinks] = await Promise.all([
    supabase.from("tags").select("id, name, slug").order("name"),
    supabase.from("source_tags").select("tag_id"),
    supabase.from("capture_tags").select("tag_id"),
  ]);

  if (tags.error) {
    console.error("[ThreadMark] 태그 목록 조회 실패:", tags.error.message);

    return [];
  }

  // 개수만 실패했으면 목록은 그대로 보여준다. 개수는 장식이고 목록은 기능이다.
  if (sourceLinks.error) {
    console.error(
      "[ThreadMark] 자료 태그 수 조회 실패:",
      sourceLinks.error.message,
    );
  }

  if (captureLinks.error) {
    console.error(
      "[ThreadMark] 기록 태그 수 조회 실패:",
      captureLinks.error.message,
    );
  }

  const sourceCounts = countByTag(sourceLinks.data);
  const captureCounts = countByTag(captureLinks.data);

  return (tags.data ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    sourceCount: sourceCounts[tag.id] ?? 0,
    captureCount: captureCounts[tag.id] ?? 0,
  }));
}

function countByTag(
  rows: { tag_id: string }[] | null,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of rows ?? []) {
    counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1;
  }

  return counts;
}

/** 주소로 들어온 태그 이름을 태그로 바꾼다. 없으면 null이다. */
export async function getTagBySlug(slug: string): Promise<Tag | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 태그 조회 실패:", error.message);

    return null;
  }

  return data ?? null;
}

/** 자료 하나에 달린 태그. 이름순이다. */
export async function listTagsForSource(sourceId: string): Promise<Tag[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_tags")
    .select("tags (id, name, slug)")
    .eq("source_id", sourceId);

  if (error) {
    console.error("[ThreadMark] 자료 태그 조회 실패:", error.message);

    return [];
  }

  return sortByName(data);
}

/**
 * 여러 자료에 달린 태그를 한 번에 가져온다.
 *
 * 목록 화면이 카드마다 태그를 보여줄 때 쓴다. 자료마다 따로 물어보면
 * 목록에 스무 개가 있을 때 왕복이 스물한 번이다.
 */
export async function listTagsForSources(
  sourceIds: readonly string[],
): Promise<Record<string, Tag[]>> {
  if (sourceIds.length === 0) {
    return {};
  }

  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_tags")
    .select("source_id, tags (id, name, slug)")
    .in("source_id", sourceIds);

  if (error) {
    console.error("[ThreadMark] 자료 태그 조회 실패:", error.message);

    return {};
  }

  return groupByOwnerRow(
    (data ?? []).map((row) => ({ key: row.source_id, tag: row.tags })),
  );
}

/**
 * 여러 기록에 달린 태그를 한 번에 가져온다.
 *
 * 기록마다 따로 물어보면 목록에 스무 개가 있을 때 왕복이 스물한 번이다.
 * 기록 id로 찾아 쓸 수 있게 묶어서 돌려준다.
 */
export async function listTagsForCaptures(
  captureIds: readonly string[],
): Promise<Record<string, Tag[]>> {
  if (captureIds.length === 0) {
    return {};
  }

  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("capture_tags")
    .select("capture_id, tags (id, name, slug)")
    .in("capture_id", captureIds);

  if (error) {
    console.error("[ThreadMark] 기록 태그 조회 실패:", error.message);

    return {};
  }

  return groupByOwnerRow(
    (data ?? []).map((row) => ({ key: row.capture_id, tag: row.tags })),
  );
}

/** 연결 행을 붙은 쪽의 id로 묶고 이름순으로 늘어놓는다. */
function groupByOwnerRow(
  rows: { key: string; tag: Tag | null }[],
): Record<string, Tag[]> {
  const grouped: Record<string, Tag[]> = {};

  for (const row of rows) {
    if (!row.tag) {
      continue;
    }

    (grouped[row.key] ??= []).push(row.tag);
  }

  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  return grouped;
}

/** 이 태그가 달린 자료의 id. 자료 목록이 거를 때 쓴다. */
export async function listSourceIdsForTag(tagId: string): Promise<string[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_tags")
    .select("source_id")
    .eq("tag_id", tagId);

  if (error) {
    console.error("[ThreadMark] 태그별 자료 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).map((row) => row.source_id);
}

/** 이 태그가 달린 기록의 id. 기록 목록이 거를 때 쓴다. */
export async function listCaptureIdsForTag(tagId: string): Promise<string[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("capture_tags")
    .select("capture_id")
    .eq("tag_id", tagId);

  if (error) {
    console.error("[ThreadMark] 태그별 기록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).map((row) => row.capture_id);
}

/** 연결 행에서 태그만 꺼내 이름순으로 늘어놓는다. */
function sortByName(rows: { tags: Tag | null }[] | null): Tag[] {
  return (rows ?? [])
    .flatMap((row) => (row.tags ? [row.tags] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
