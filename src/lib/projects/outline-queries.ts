import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { buildOutline, type OutlineItem, type OutlineRow } from "./outline";

/**
 * 프로젝트 뼈대 조회. (설계 문서 7.3절)
 *
 * **한 번에 통째로 가져와 화면이 세운다.** 자리마다 질의를 보내면 깊이가
 * 깊어질수록 왕복이 늘고, 깊이에 한계가 없으므로 그 끝을 우리가 모른다.
 * `project_outline_nodes_project_idx`가 이 질의를 받는다.
 */
export async function listOutline(
  projectId: string,
): Promise<readonly OutlineItem[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_outline_nodes")
    .select("id, parent_id, title, body, position")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 뼈대 조회 실패:", error.message);

    return [];
  }

  const rows: OutlineRow[] = (data ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    body: row.body,
    position: row.position,
  }));

  return buildOutline(rows);
}
