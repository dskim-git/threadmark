"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { seedOutline } from "@/lib/projects/outline-seed";
import {
  firstIssueMessage,
  formValue,
  projectInputSchema,
  resolveColor,
} from "@/lib/projects/schema";
import { findProjectTemplate } from "@/lib/projects/templates";
import { createClient } from "@/lib/supabase/server";

/**
 * Project 생성·수정·삭제와 연결 관리.
 *
 * 연결은 서로 다른 두 표를 잇는다. 한쪽만 확인하면 남의 자료를 내 프로젝트에
 * 넣거나, 남의 프로젝트에 내 자료를 밀어넣을 수 있다.
 * 양쪽 확인은 데이터베이스 트리거가 한다. 여기서는 요청 값의 형태만 본다.
 */

const idSchema = z.uuid();

function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

function readInput(formData: FormData) {
  return projectInputSchema.safeParse({
    name: formValue(formData.get("name")),
    projectType: formValue(formData.get("projectType")),
    description: formValue(formData.get("description")),
    researchQuestion: formValue(formData.get("researchQuestion")),
    targetOutput: formValue(formData.get("targetOutput")),
    startDate: formValue(formData.get("startDate")),
    endDate: formValue(formData.get("endDate")),
    // 화면은 라디오와 색상 선택기 두 값을 보낸다. 어느 것을 쓸지는 여기서 정한다.
    color: resolveColor(
      formValue(formData.get("colorChoice")),
      formValue(formData.get("customColor")),
    ),
  });
}

/**
 * 프로젝트를 만든다. 폼은 `/projects/new`에 있다.
 *
 * 오류는 **그 화면으로** 돌려보낸다. 목록으로 보내면 무엇이 잘못됐는지 읽는
 * 순간 고쳐 쓸 칸이 눈앞에 없다. 수정(updateProject)이 수정 화면으로
 * 돌려보내는 것과 같은 이유다.
 */
export async function createProject(formData: FormData): Promise<void> {
  await requireActiveAccount("/projects/new");

  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery("/projects/new", {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  /*
    시작 서식. (설계 문서 7.3-1절)

    **유형 칸이 비어 있을 때만** 서식 이름이 그리로 들어간다. 적어 넣은
    값을 덮지 않는다. 지킬 것은 사용자가 적은 값이고 우리가 채운 값이
    아니다. 음악에서 한 번 부딪힌 자리다. (AGENTS.md 2절)
  */
  const template = findProjectTemplate(formValue(formData.get("templateId")));

  /*
    비어 있는 유형은 `null`로 들어온다. 빈 글자가 아니다. 둘을 같게 보면
    "적지 않았다"와 "빈칸을 적었다"가 구분되지 않는다.
  */
  const projectType =
    input.projectType ??
    (template && template.outline.length > 0 ? template.name : null);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      // owner_id는 넣지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
      name: input.name,
      project_type: projectType,
      description: input.description,
      research_question: input.researchQuestion,
      target_output: input.targetOutput,
      start_date: input.startDate,
      end_date: input.endDate,
      color: input.color,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ThreadMark] 프로젝트 생성 실패:", error?.message);
    redirectWithQuery("/projects/new", {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  /*
    서식이 준 자리들을 심는다.

    **실패해도 프로젝트는 살린다.** 뼈대를 못 만든 것은 프로젝트를 못 만들
    이유가 아니다. 사용자가 손으로 자리를 만들면 된다. 다만 조용히 넘어가지
    않는다. 서식을 골랐는데 빈 뼈대가 나오면 사용자는 자기가 잘못 골랐다고
    생각한다.
  */
  const seeded =
    template && template.outline.length > 0
      ? await seedOutline(supabase, data.id, template.outline)
      : true;

  revalidatePath("/projects");

  if (!seeded) {
    redirectWithQuery(`/projects/${data.id}`, {
      error: "프로젝트는 만들었지만 서식의 자리들을 만들지 못했습니다. 아래에서 직접 만들 수 있습니다.",
    });
  }

  redirect(`/projects/${data.id}`);
}

export async function updateProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const parsed = readInput(formData);

  if (!parsed.success) {
    redirectWithQuery(`/projects/${id.data}/edit`, {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      project_type: input.projectType,
      description: input.description,
      research_question: input.researchQuestion,
      target_output: input.targetOutput,
      start_date: input.startDate,
      end_date: input.endDate,
      color: input.color,
    })
    .eq("id", id.data)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[ThreadMark] 프로젝트 수정 실패:", error.message);
    redirectWithQuery(`/projects/${id.data}/edit`, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (!data || data.length === 0) {
    redirectWithQuery("/projects", { error: "프로젝트를 찾을 수 없습니다." });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id.data}`);
  redirect(`/projects/${id.data}`);
}

/**
 * 삭제 표시를 남긴다.
 *
 * 연결은 지우지 않는다. 프로젝트를 되살리면 연결도 함께 돌아와야 하기 때문이다.
 * 조회에서는 삭제 표시된 프로젝트가 빠지므로 연결도 함께 보이지 않는다.
 */
export async function deleteProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const id = idSchema.safeParse(formValue(formData.get("id")));

  if (!id.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("soft_delete_project", {
    project_id: id.data,
  });

  if (error) {
    console.error("[ThreadMark] 프로젝트 삭제 실패:", error.message);
    redirectWithQuery(`/projects/${id.data}`, {
      error: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (data !== true) {
    redirectWithQuery("/projects", { error: "프로젝트를 찾을 수 없습니다." });
  }

  revalidatePath("/projects");
  redirectWithQuery("/projects", { notice: "프로젝트를 삭제했습니다." });
}


// -----------------------------------------------------------------------------
// 연결 관리
// -----------------------------------------------------------------------------

const linkSchema = z.object({
  projectId: z.uuid(),
  targetId: z.uuid(),
  returnTo: z.string(),
});

function readLink(formData: FormData) {
  return linkSchema.safeParse({
    projectId: formValue(formData.get("projectId")),
    targetId: formValue(formData.get("targetId")),
    returnTo: formValue(formData.get("returnTo")),
  });
}

export async function linkSourceToProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = readLink(formData);

  if (!parsed.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const { projectId, targetId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("source_projects")
    .insert({ project_id: projectId, source_id: targetId });

  if (error) {
    // 이미 연결된 경우와 권한이 없는 경우를 구분해 알려준다.
    const message =
      error.code === "23505"
        ? "이미 연결된 자료입니다."
        : "연결하지 못했습니다. 내 자료와 내 프로젝트인지 확인해 주세요.";

    console.error("[ThreadMark] 자료 연결 실패:", error.message);
    redirectWithQuery(destination, { error: message });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "자료를 연결했습니다." });
}

export async function unlinkSourceFromProject(
  formData: FormData,
): Promise<void> {
  await requireActiveAccount();

  const parsed = readLink(formData);

  if (!parsed.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const { projectId, targetId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("source_projects")
    .delete()
    .eq("project_id", projectId)
    .eq("source_id", targetId);

  if (error) {
    console.error("[ThreadMark] 자료 연결 해제 실패:", error.message);
    redirectWithQuery(destination, { error: "연결을 끊지 못했습니다." });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "연결을 끊었습니다." });
}

export async function linkCaptureToProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = readLink(formData);

  if (!parsed.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const { projectId, targetId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("capture_projects")
    .insert({ project_id: projectId, capture_id: targetId });

  if (error) {
    const message =
      error.code === "23505"
        ? "이미 연결된 기록입니다."
        : "연결하지 못했습니다. 내 기록과 내 프로젝트인지 확인해 주세요.";

    console.error("[ThreadMark] 기록 연결 실패:", error.message);
    redirectWithQuery(destination, { error: message });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "기록을 연결했습니다." });
}

export async function unlinkCaptureFromProject(
  formData: FormData,
): Promise<void> {
  await requireActiveAccount();

  const parsed = readLink(formData);

  if (!parsed.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  const { projectId, targetId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("capture_projects")
    .delete()
    .eq("project_id", projectId)
    .eq("capture_id", targetId);

  if (error) {
    console.error("[ThreadMark] 기록 연결 해제 실패:", error.message);
    redirectWithQuery(destination, { error: "연결을 끊지 못했습니다." });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "연결을 끊었습니다." });
}
