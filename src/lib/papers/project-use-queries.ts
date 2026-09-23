import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_PAPER_USE_STATUS,
  PROJECT_USE_COLUMNS,
  isPaperUseStatus,
  type PaperUseStatus,
} from "./project-use-fields.ts";

/**
 * 프로젝트별 논문 활용 계획 조회. (설계 문서 8.3절)
 *
 * 다른 조회 계층과 같은 원칙을 따른다. 먼저 승인된 계정인지 확인하고,
 * 화면이 확인했으리라 가정하지 않는다. (보안 원칙 5)
 *
 * 두 방향으로 읽는다.
 *   논문 쪽에서  이 논문을 어느 프로젝트에 어떻게 쓸 것인가
 *   프로젝트 쪽에서  이 프로젝트에 쓸 논문이 무엇이고 어디까지 됐는가
 *
 * 뒤쪽이 이 표를 만든 이유다. 원고를 쓰는 사람은 논문 한 편이 아니라
 * 프로젝트 하나를 붙들고 앉는다.
 */

/** 열 이름은 한 곳에서만 정한다. 여기서 또 적으면 어긋난다. */
const USE_SELECT = [
  "id",
  "paper_source_id",
  "project_id",
  "status",
  "updated_at",
  ...PROJECT_USE_COLUMNS,
].join(", ");

export type PaperProjectUse = {
  id: string;
  paperSourceId: string;
  projectId: string;
  status: PaperUseStatus;
  /** 항목마다 글 하나. 없으면 null. */
  values: Record<string, string | null>;
  updatedAt: string;
};

/** 프로젝트 화면에서 보여줄 때 필요한 논문 제목까지 담은 것. */
export type PaperProjectUseWithPaper = PaperProjectUse & {
  paperTitle: string;
};

/**
 * 한 줄을 우리 모양으로 옮긴다.
 *
 * 항목이 늘어도 이 함수는 고치지 않는다. 하나씩 옮겨 적으면 항목을 더할 때마다
 * 같이 고쳐야 하고, 빠뜨리면 그 칸만 조용히 비어 보인다. (14-B와 같다)
 */
function toUse(row: Record<string, unknown>): PaperProjectUse {
  const values: Record<string, string | null> = {};

  for (const column of PROJECT_USE_COLUMNS) {
    const value = row[column];

    values[column] = typeof value === "string" ? value : null;
  }

  return {
    id: String(row.id),
    paperSourceId: String(row.paper_source_id),
    projectId: String(row.project_id),
    /*
      모르는 상태값은 기본값으로 본다. 여기서 막으면 적어둔 글까지 보이지
      않게 되는데, 상태는 표시에만 쓰이므로 글을 보여주는 쪽이 낫다.
    */
    status: isPaperUseStatus(row.status) ? row.status : DEFAULT_PAPER_USE_STATUS,
    values,
    updatedAt: String(row.updated_at),
  };
}

/**
 * 논문 하나의 활용 계획 전부. 프로젝트별로 하나씩이다.
 *
 * 연결이 끊긴 프로젝트의 계획도 함께 돌려준다. 걸러내지 않는 이유는,
 * 화면이 "연결은 없는데 계획이 남아 있다"를 보여줘야 하기 때문이다.
 * 조용히 감추면 적어둔 글이 사라진 것처럼 보인다.
 */
export async function listPaperProjectUses(
  paperSourceId: string,
): Promise<PaperProjectUse[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  // RLS의 paper_project_uses_select_own 정책이 내 것만 돌려준다.
  const { data, error } = await supabase
    .from("paper_project_uses")
    .select(USE_SELECT)
    .eq("paper_source_id", paperSourceId);

  if (error) {
    console.error("[ThreadMark] 활용 계획 조회 실패:", error.message);

    // 모르면 없는 것으로 본다. 화면은 "아직 적지 않았다"를 보여준다.
    return [];
  }

  return (data ?? []).map((row) =>
    toUse(row as unknown as Record<string, unknown>),
  );
}

/**
 * 프로젝트 하나에 걸린 활용 계획 전부.
 *
 * 논문 제목을 함께 읽는다. 제목 없이 계획만 보여주면 어느 논문의 것인지
 * 알 수 없어서 목록으로 쓸 수 없다.
 *
 * 삭제 표시된 논문의 계획은 보여주지 않는다. 자료 목록에서 사라진 논문이
 * 여기서만 살아 있으면, 되살릴 수도 지울 수도 없는 줄이 남는다.
 */
export async function listProjectPaperUses(
  projectId: string,
): Promise<PaperProjectUseWithPaper[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("paper_project_uses")
    .select(`${USE_SELECT}, sources (id, title, deleted_at)`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[ThreadMark] 프로젝트의 활용 계획 조회 실패:",
      error.message,
    );

    return [];
  }

  return (data ?? []).flatMap((row) => {
    const record = row as unknown as Record<string, unknown>;
    const paper = record.sources as
      | { id: string; title: string; deleted_at: string | null }
      | null;

    if (!paper || paper.deleted_at !== null) {
      return [];
    }

    return [{ ...toUse(record), paperTitle: paper.title }];
  });
}
