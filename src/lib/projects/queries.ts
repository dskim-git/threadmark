import { requireActiveAccount } from "@/lib/auth/account";
import { isCaptureType, type CaptureType } from "@/lib/captures/types";
import { isSourceType, type SourceType } from "@/lib/sources/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Project 조회 계층.
 *
 * 연결된 자료와 기록은 연결 테이블을 거쳐 읽는다. 연결 테이블과 대상 표 양쪽에
 * RLS가 걸려 있으므로, 남의 것이 섞여 들어올 경로가 없다.
 */

const PROJECT_COLUMNS =
  "id, name, project_type, description, research_question, target_output, start_date, end_date, color, created_at, updated_at";

export type Project = {
  id: string;
  name: string;
  projectType: string | null;
  description: string | null;
  researchQuestion: string | null;
  targetOutput: string | null;
  startDate: string | null;
  endDate: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkedSource = {
  id: string;
  type: SourceType;
  title: string;
};

export type LinkedCapture = {
  id: string;
  captureType: CaptureType;
  content: string | null;
  originalText: string | null;
  sourceId: string | null;
};

/** 프로젝트 이름과 색만 담은 요약. 자료 화면의 연결 표시에 쓴다. */
export type ProjectChip = {
  id: string;
  name: string;
  color: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  project_type: string | null;
  description: string | null;
  research_question: string | null;
  target_output: string | null;
  start_date: string | null;
  end_date: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    projectType: row.project_type,
    description: row.description,
    researchQuestion: row.research_question,
    targetOutput: row.target_output,
    startDate: row.start_date,
    endDate: row.end_date,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<Project[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ThreadMark] 프로젝트 목록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).map(toProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 프로젝트 조회 실패:", error.message);

    return null;
  }

  return data ? toProject(data) : null;
}

/** 프로젝트에 연결된 자료. */
export async function listProjectSources(
  projectId: string,
): Promise<LinkedSource[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_projects")
    .select("sources (id, type, title, deleted_at)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ThreadMark] 연결된 자료 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row) => {
    const source = row.sources;

    // 삭제 표시된 자료는 연결이 남아 있어도 보여주지 않는다.
    if (!source || source.deleted_at !== null || !isSourceType(source.type)) {
      return [];
    }

    return [{ id: source.id, type: source.type, title: source.title }];
  });
}

/** 프로젝트에 연결된 기록. */
export async function listProjectCaptures(
  projectId: string,
): Promise<LinkedCapture[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("capture_projects")
    .select("captures (id, capture_type, content, original_text, source_id, deleted_at)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ThreadMark] 연결된 기록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row) => {
    const capture = row.captures;

    if (
      !capture ||
      capture.deleted_at !== null ||
      !isCaptureType(capture.capture_type)
    ) {
      return [];
    }

    return [
      {
        id: capture.id,
        captureType: capture.capture_type,
        content: capture.content,
        originalText: capture.original_text,
        sourceId: capture.source_id,
      },
    ];
  });
}

/** 특정 자료가 연결된 프로젝트. 자료 상세 화면에서 보여준다. */
export async function listProjectsForSource(
  sourceId: string,
): Promise<ProjectChip[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_projects")
    .select("projects (id, name, color, deleted_at)")
    .eq("source_id", sourceId);

  if (error) {
    console.error("[ThreadMark] 자료의 프로젝트 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row) => {
    const project = row.projects;

    if (!project || project.deleted_at !== null) {
      return [];
    }

    return [{ id: project.id, name: project.name, color: project.color }];
  });
}

/** 이름과 색만 담은 전체 프로젝트 목록. 연결 추가 선택 상자에 쓴다. */
export async function listProjectChips(): Promise<ProjectChip[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, color")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 프로젝트 목록 조회 실패:", error.message);

    return [];
  }

  return data ?? [];
}
