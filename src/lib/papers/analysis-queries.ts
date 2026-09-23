import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { ANALYSIS_COLUMNS } from "./analysis-fields";

/**
 * 논문 분석 서식 조회. (설계 문서 8.2절)
 *
 * 다른 조회 계층과 같은 원칙을 따른다. 먼저 승인된 계정인지 확인하고,
 * 화면이 확인했으리라 가정하지 않는다.
 */

/** 열 이름은 한 곳에서만 정한다. 여기서 또 적으면 어긋난다. */
const ANALYSIS_SELECT = ["id", "source_id", ...ANALYSIS_COLUMNS].join(", ");

/** 항목마다 글 하나. 없으면 null. */
export type PaperAnalysis = {
  id: string;
  sourceId: string;
  values: Record<string, string | null>;
};

/**
 * 자료 하나의 분석. 아직 적지 않았으면 null.
 *
 * 열이 서른 개라 하나씩 옮겨 담지 않는다. 옮겨 적는 코드는 항목이 늘 때마다
 * 같이 고쳐야 하고, 빠뜨리면 그 칸만 조용히 비어 보인다.
 */
export async function getPaperAnalysis(
  sourceId: string,
): Promise<PaperAnalysis | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  // RLS의 paper_analyses_select_own 정책이 내 것만 돌려준다.
  const { data, error } = await supabase
    .from("paper_analyses")
    .select(ANALYSIS_SELECT)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 논문 분석 조회 실패:", error.message);

    // 모르면 없는 것으로 본다. 화면은 "아직 적지 않았다"를 보여준다.
    return null;
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as Record<string, unknown>;
  const values: Record<string, string | null> = {};

  for (const column of ANALYSIS_COLUMNS) {
    const value = row[column];

    values[column] = typeof value === "string" ? value : null;
  }

  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    values,
  };
}
