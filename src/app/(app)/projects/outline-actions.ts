"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { neighborToSwap } from "@/lib/projects/outline";
import { formValue } from "@/lib/projects/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 프로젝트 뼈대 만들기·고치기·옮기기. (설계 문서 7.3절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수들의 requireActiveAccount
 *   2. project_outline_nodes 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·연결 확인 트리거와 옮기기 가드
 */

const MAX_TITLE_LENGTH = 300;
const MAX_BODY_LENGTH = 50000;

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/** 뼈대를 고친 뒤 돌아갈 곳. 프로젝트 화면이다. */
function projectPath(projectId: string): string {
  return `/projects/${projectId}`;
}

const idSchema = z.uuid();

/**
 * 자리를 하나 만든다.
 *
 * 맨 뒤에 붙인다. 형제 중 가장 큰 순서에 1을 더한다. 사이에 끼워 넣는 길은
 * 두지 않는다. 만든 뒤에 위아래로 옮기면 되고, 끼워 넣기를 만들면 형제
 * 전부의 순서를 다시 매겨야 한다.
 */
export async function addOutlineNode(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));

  if (!projectId.success) {
    redirect("/projects");
  }

  const path = projectPath(projectId.data);
  const rawParent = formValue(formData.get("parentId"));
  const parent = rawParent.length > 0 ? idSchema.safeParse(rawParent) : null;

  if (parent !== null && !parent.success) {
    redirectWithQuery(path, { error: "잘못된 요청입니다." });
  }

  const title = formValue(formData.get("title")).trim();

  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    redirectWithQuery(path, { error: "자리 이름을 적어 주세요." });
  }

  const parentId = parent === null ? null : parent.data;
  const supabase = await createClient();

  /*
    형제 중 가장 큰 순서를 찾는다.

    `is`와 `eq`를 갈라 쓴다. PostgREST에서 `eq.null`은 값 비교라 아무것도
    맞지 않는다. 맨 윗칸을 다룰 때 이것을 빠뜨리면 순서가 늘 0이 되어
    새로 만든 자리가 맨 앞으로 간다.
  */
  let query = supabase
    .from("project_outline_nodes")
    .select("position")
    .eq("project_id", projectId.data)
    .order("position", { ascending: false })
    .limit(1);

  query = parentId === null
    ? query.is("parent_id", null)
    : query.eq("parent_id", parentId);

  const { data: last } = await query.maybeSingle();

  const { error } = await supabase.from("project_outline_nodes").insert({
    project_id: projectId.data,
    parent_id: parentId,
    title,
    position: (last?.position ?? -1) + 1,
  });

  if (error) {
    console.error("[ThreadMark] 자리 만들기 실패:", error.message);
    redirectWithQuery(path, { error: "자리를 만들지 못했습니다." });
  }

  revalidatePath(path);
  redirect(path);
}

/** 자리 이름과 그 자리에 쓴 글을 저장한다. */
export async function saveOutlineNode(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));

  if (!projectId.success || !nodeId.success) {
    redirect("/projects");
  }

  const path = projectPath(projectId.data);
  const title = formValue(formData.get("title")).trim();
  const body = formValue(formData.get("body"));

  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    redirectWithQuery(path, { error: "자리 이름을 적어 주세요." });
  }

  if (body.length > MAX_BODY_LENGTH) {
    redirectWithQuery(path, { error: "글이 너무 깁니다." });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("project_outline_nodes")
    .update({ title, body: body.length > 0 ? body : null })
    .eq("id", nodeId.data)
    .eq("project_id", projectId.data);

  if (error) {
    console.error("[ThreadMark] 자리 저장 실패:", error.message);
    redirectWithQuery(path, { error: "저장하지 못했습니다." });
  }

  revalidatePath(path);
  redirectWithQuery(path, { notice: "저장했습니다." });
}

/**
 * 자리를 지운다.
 *
 * **그 아래 자리도 함께 사라진다.** 데이터베이스의 `on delete cascade`가
 * 한다. 화면이 몇 개가 함께 사라지는지 미리 알려준다.
 */
export async function deleteOutlineNode(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));

  if (!projectId.success || !nodeId.success) {
    redirect("/projects");
  }

  const path = projectPath(projectId.data);
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_outline_nodes")
    .delete()
    .eq("id", nodeId.data)
    .eq("project_id", projectId.data);

  if (error) {
    console.error("[ThreadMark] 자리 지우기 실패:", error.message);
    redirectWithQuery(path, { error: "지우지 못했습니다." });
  }

  revalidatePath(path);
  redirectWithQuery(path, { notice: "자리를 지웠습니다." });
}

/**
 * 형제 사이에서 한 칸 위나 아래로 옮긴다.
 *
 * **두 자리의 순서를 맞바꾼다.** 전체를 다시 매기지 않는다. 그러면 옮길
 * 때마다 형제 전부를 고쳐야 하고, 그중 하나가 실패하면 순서가 반쯤 어긋난
 * 채로 남는다.
 */
export async function moveOutlineNode(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));
  const direction = formValue(formData.get("direction"));

  if (!projectId.success || !nodeId.success) {
    redirect("/projects");
  }

  const path = projectPath(projectId.data);

  if (direction !== "up" && direction !== "down") {
    redirectWithQuery(path, { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { data: self, error: selfError } = await supabase
    .from("project_outline_nodes")
    .select("id, parent_id, title, position")
    .eq("id", nodeId.data)
    .eq("project_id", projectId.data)
    .maybeSingle();

  if (selfError || !self) {
    redirectWithQuery(path, { error: "자리를 찾지 못했습니다." });
  }

  let siblingQuery = supabase
    .from("project_outline_nodes")
    .select("id, parent_id, title, position")
    .eq("project_id", projectId.data);

  siblingQuery = self.parent_id === null
    ? siblingQuery.is("parent_id", null)
    : siblingQuery.eq("parent_id", self.parent_id);

  const { data: siblings, error: siblingError } = await siblingQuery;

  if (siblingError || !siblings) {
    redirectWithQuery(path, { error: "자리를 찾지 못했습니다." });
  }

  const neighbor = neighborToSwap(
    siblings.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      title: row.title,
      body: null,
      position: row.position,
    })),
    self.id,
    direction,
  );

  // 맨 끝이다. 아무것도 하지 않는다. 오류가 아니다.
  if (!neighbor) {
    redirect(path);
  }

  /*
    순서 값이 같을 수 있다. 그때 그냥 맞바꾸면 아무것도 달라지지 않는다.
    같으면 한쪽을 한 칸 밀어 갈라 놓는다.
  */
  const [mine, theirs] =
    self.position === neighbor.position
      ? direction === "up"
        ? [neighbor.position - 1, neighbor.position]
        : [neighbor.position + 1, neighbor.position]
      : [neighbor.position, self.position];

  const results = await Promise.all([
    supabase
      .from("project_outline_nodes")
      .update({ position: mine })
      .eq("id", self.id),
    supabase
      .from("project_outline_nodes")
      .update({ position: theirs })
      .eq("id", neighbor.id),
  ]);

  for (const result of results) {
    if (result.error) {
      console.error("[ThreadMark] 자리 옮기기 실패:", result.error.message);
      redirectWithQuery(path, { error: "옮기지 못했습니다." });
    }
  }

  revalidatePath(path);
  redirect(path);
}

/**
 * 한 단 들이거나 내보낸다.
 *
 *   들이기(indent)   바로 위 형제의 자식이 된다
 *   내보내기(outdent) 부모의 형제가 된다
 *
 * 자기 아래로 들어가는 일은 여기서 생기지 않는다. 위 형제나 할아버지로만
 * 가기 때문이다. 그래도 **데이터베이스의 가드를 믿고 지우지 않는다.**
 * 다른 길이 생겼을 때 그 가드만 남는다.
 */
export async function reparentOutlineNode(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));
  const direction = formValue(formData.get("direction"));

  if (!projectId.success || !nodeId.success) {
    redirect("/projects");
  }

  const path = projectPath(projectId.data);

  if (direction !== "in" && direction !== "out") {
    redirectWithQuery(path, { error: "잘못된 요청입니다." });
  }

  const supabase = await createClient();

  const { data: self } = await supabase
    .from("project_outline_nodes")
    .select("id, parent_id, title, position")
    .eq("id", nodeId.data)
    .eq("project_id", projectId.data)
    .maybeSingle();

  if (!self) {
    redirectWithQuery(path, { error: "자리를 찾지 못했습니다." });
  }

  let nextParent: string | null;

  if (direction === "in") {
    let siblingQuery = supabase
      .from("project_outline_nodes")
      .select("id, parent_id, title, position")
      .eq("project_id", projectId.data);

    siblingQuery = self.parent_id === null
      ? siblingQuery.is("parent_id", null)
      : siblingQuery.eq("parent_id", self.parent_id);

    const { data: siblings } = await siblingQuery;

    const above = neighborToSwap(
      (siblings ?? []).map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        body: null,
        position: row.position,
      })),
      self.id,
      "up",
    );

    // 맨 위 형제는 들일 곳이 없다. 아무것도 하지 않는다.
    if (!above) {
      redirect(path);
    }

    nextParent = above.id;
  } else {
    // 이미 맨 윗칸이면 더 나갈 곳이 없다.
    if (self.parent_id === null) {
      redirect(path);
    }

    const { data: parent } = await supabase
      .from("project_outline_nodes")
      .select("parent_id")
      .eq("id", self.parent_id)
      .maybeSingle();

    nextParent = parent?.parent_id ?? null;
  }

  /*
    옮긴 뒤에는 새 형제들의 맨 뒤에 둔다.

    순서를 그대로 들고 가면 이미 그 자리에 있는 형제와 값이 겹쳐, 어느 쪽이
    앞인지 이름으로 갈리게 된다. 옮긴 자리가 엉뚱한 곳에 끼어 보인다.
  */
  let lastQuery = supabase
    .from("project_outline_nodes")
    .select("position")
    .eq("project_id", projectId.data)
    .order("position", { ascending: false })
    .limit(1);

  lastQuery = nextParent === null
    ? lastQuery.is("parent_id", null)
    : lastQuery.eq("parent_id", nextParent);

  const { data: last } = await lastQuery.maybeSingle();

  const { error } = await supabase
    .from("project_outline_nodes")
    .update({ parent_id: nextParent, position: (last?.position ?? -1) + 1 })
    .eq("id", self.id)
    .eq("project_id", projectId.data);

  if (error) {
    console.error("[ThreadMark] 자리 단계 바꾸기 실패:", error.message);
    redirectWithQuery(path, { error: "옮기지 못했습니다." });
  }

  revalidatePath(path);
  redirect(path);
}
