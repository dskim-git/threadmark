"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { buildOutline } from "@/lib/projects/outline";
import { listPlacementsOfCapture } from "@/lib/projects/placement-queries";
import { formValue } from "@/lib/projects/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 뼈대의 자리에 재료를 놓고 뺀다. (설계 문서 7.4절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수들의 requireActiveAccount
 *   2. project_node_items 정책 (소유자 + 승인 상태)
 *   3. 자리·자료·기록 세 소유자를 모두 확인하는 트리거
 */

const idSchema = z.uuid();
const MAX_NOTE_LENGTH = 2000;

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/**
 * 자리에 재료를 놓는다.
 *
 * **놓으면 프로젝트에도 자동으로 잇는다.** (설계 문서 7.4절)
 * "먼저 프로젝트에 잇고 그다음 자리에 놓기"는 두 걸음인데, 실제로는
 * "이걸 여기 쓰자"가 한 번에 떠오른다. 자리에 놓았는데 프로젝트 목록에
 * 없는 상태가 생기면 어느 쪽이 맞는지 알 수 없게 되기도 한다.
 */
export async function placeItem(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const nodeId = idSchema.safeParse(formValue(formData.get("nodeId")));

  if (!projectId.success || !nodeId.success) {
    redirect("/projects");
  }

  /*
    돌아갈 곳을 폼이 정한다.

    프로젝트 화면에서 놓으면 거기 그대로 있어야 하고, 기록 카드에서 놓으면
    **보던 목록으로 돌아가야 한다.** 놓자고 화면이 바뀌면 하던 일을 잃는다.
    적히지 않았으면 프로젝트 화면으로 간다.
  */
  const raw = formValue(formData.get("returnTo"));
  const path =
    raw.length > 0 ? sanitizeNextPath(raw) : `/projects/${projectId.data}`;

  /*
    무엇을 놓는지는 `자료:<id>` 또는 `기록:<id>` 한 값으로 온다.

    칸을 둘로 나누면 화면이 둘 중 하나를 비워 보내야 하고, 둘 다 채워 보내는
    길도 열린다. 그러면 어느 쪽을 쓸지 서버가 추측하게 된다. 한 칸이면
    고른 것이 곧 뜻이다.
  */
  const picked = formValue(formData.get("item"));
  const [kind, rawId] = picked.split(":", 2);
  const itemId = idSchema.safeParse(rawId ?? "");

  if ((kind !== "source" && kind !== "capture") || !itemId.success) {
    /*
      **무엇이 잘못됐는지 갈라서 남긴다.**

      "골라 주세요" 하나로 뭉뚱그렸더니 값이 아예 안 온 것인지 모양이 다른
      것인지 알 수 없었다. 둘은 고칠 곳이 다르다. 값이 안 오면 화면 쪽이고,
      모양이 다르면 만드는 쪽이다.

      값 자체는 남기지 않는다. 무엇을 다루는 중인지가 기록에 쌓이면 그것도
      남의 자료가 된다. 길이와 모양만 남긴다.
    */
    console.error(
      "[ThreadMark] 놓을 것을 읽지 못했습니다:",
      picked.length === 0
        ? "item 칸이 비어 있습니다"
        : `item 칸의 모양이 다릅니다 (종류=${kind === "source" || kind === "capture" ? kind : "알 수 없음"}, id 길이=${(rawId ?? "").length})`,
    );

    redirectWithQuery(path, {
      error:
        picked.length === 0
          ? "놓을 것이 전해지지 않았습니다. 창을 닫고 다시 열어 주세요."
          : "놓을 것을 알아보지 못했습니다.",
    });
  }

  const note = formValue(formData.get("note")).trim();

  if (note.length > MAX_NOTE_LENGTH) {
    redirectWithQuery(path, { error: "적은 글이 너무 깁니다." });
  }

  const supabase = await createClient();

  /*
    프로젝트에 먼저 잇는다.

    이미 이어져 있으면 아무 일도 일어나지 않아야 한다. 짝에 unique가 걸려
    있어 다시 넣으면 충돌하므로, 충돌을 무시하도록 알린다.
  */
  const linkError =
    kind === "source"
      ? (
          await supabase
            .from("source_projects")
            .upsert(
              { project_id: projectId.data, source_id: itemId.data },
              { onConflict: "source_id,project_id", ignoreDuplicates: true },
            )
        ).error
      : (
          await supabase
            .from("capture_projects")
            .upsert(
              { project_id: projectId.data, capture_id: itemId.data },
              { onConflict: "capture_id,project_id", ignoreDuplicates: true },
            )
        ).error;

  if (linkError) {
    console.error("[ThreadMark] 프로젝트 잇기 실패:", linkError.message);
    redirectWithQuery(path, { error: "프로젝트에 잇지 못했습니다." });
  }

  // 자리 안의 맨 뒤에 놓는다.
  const { data: last } = await supabase
    .from("project_node_items")
    .select("position")
    .eq("node_id", nodeId.data)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("project_node_items").insert({
    node_id: nodeId.data,
    source_id: kind === "source" ? itemId.data : null,
    capture_id: kind === "capture" ? itemId.data : null,
    note: note.length > 0 ? note : null,
    position: (last?.position ?? -1) + 1,
  });

  if (error) {
    console.error("[ThreadMark] 재료 놓기 실패:", error.message);

    /*
      같은 자리에 같은 것을 두 번 놓으려 한 경우를 따로 알린다.
      "저장 실패"로 뭉뚱그리면 사용자는 고장인 줄 안다. 이것은 이미
      되어 있다는 뜻이다.
    */
    redirectWithQuery(path, {
      error:
        error.code === "23505"
          ? "이미 그 자리에 놓여 있습니다."
          : "놓지 못했습니다.",
    });
  }

  revalidatePath(path);
  redirectWithQuery(path, { notice: "자리에 놓았습니다." });
}

/**
 * 놓은 것에 적은 말을 고친다.
 *
 * 무엇을 어디에 놓았는지는 바꿀 수 없다(트리거가 막는다). 고칠 수 있는
 * 것은 **여기서 할 말**뿐이다. 옮기고 싶으면 빼고 다시 놓는다.
 */
export async function savePlacementNote(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const placementId = idSchema.safeParse(formValue(formData.get("placementId")));

  if (!projectId.success || !placementId.success) {
    redirect("/projects");
  }

  const path = `/projects/${projectId.data}`;
  const note = formValue(formData.get("note")).trim();

  if (note.length > MAX_NOTE_LENGTH) {
    redirectWithQuery(path, { error: "적은 글이 너무 깁니다." });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("project_node_items")
    .update({ note: note.length > 0 ? note : null })
    .eq("id", placementId.data);

  if (error) {
    console.error("[ThreadMark] 놓은 까닭 저장 실패:", error.message);
    redirectWithQuery(path, { error: "저장하지 못했습니다." });
  }

  revalidatePath(path);
  redirectWithQuery(path, { notice: "저장했습니다." });
}

/**
 * 자리에서 뺀다.
 *
 * **재료 자체는 사라지지 않는다.** 프로젝트에 이어둔 것도 그대로다.
 * 여기서 사라지는 것은 "어디에 놓았는가"뿐이고, 뺀 재료는
 * `자리 못 찾은 것`으로 돌아간다.
 */
export async function removePlacement(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = idSchema.safeParse(formValue(formData.get("projectId")));
  const placementId = idSchema.safeParse(formValue(formData.get("placementId")));

  if (!projectId.success || !placementId.success) {
    redirect("/projects");
  }

  const path = `/projects/${projectId.data}`;
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_node_items")
    .delete()
    .eq("id", placementId.data);

  if (error) {
    console.error("[ThreadMark] 자리에서 빼기 실패:", error.message);
    redirectWithQuery(path, { error: "빼지 못했습니다." });
  }

  revalidatePath(path);
  redirectWithQuery(path, { notice: "자리에서 뺐습니다. 재료는 그대로 있습니다." });
}

/**
 * 기록을 놓을 수 있는 자리들. (19-B 뒤, 사용자 요청)
 *
 * 프로젝트마다 그 뼈대를 함께 준다. 기록 쪽에서 "이걸 어디에 쓸까"를 고를
 * 때 쓴다. 프로젝트 이름만으로는 고를 수 없다. **자리가 곧 쓰임새다.**
 *
 * **창을 열 때 가져온다.** 기록 카드는 받은함·자료 화면·읽기 화면 세 곳에
 * 나오는데, 그 화면들이 열릴 때마다 모든 프로젝트의 뼈대를 실어 나를 이유가
 * 없다. 자리를 고르는 일은 가끔 있는 일이다.
 */
export type PlaceTargetNode = {
  id: string;
  title: string;
  /** `1`, `1.2`. 담기지 않고 세어진 값이다. */
  number: string;
  depth: number;
};

export type PlaceTargetProject = {
  id: string;
  name: string;
  nodes: PlaceTargetNode[];
};

export async function listPlaceTargets(): Promise<PlaceTargetProject[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const [projects, nodes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_outline_nodes")
      .select("id, project_id, parent_id, title, position")
      .order("position", { ascending: true }),
  ]);

  if (projects.error) {
    console.error("[ThreadMark] 프로젝트 조회 실패:", projects.error.message);

    return [];
  }

  if (nodes.error) {
    console.error("[ThreadMark] 뼈대 조회 실패:", nodes.error.message);
  }

  const byProject = new Map<string, PlaceTargetNode[]>();

  for (const project of projects.data ?? []) {
    /*
      프로젝트마다 따로 세운다. 번호와 깊이는 그 프로젝트 안에서만 뜻이
      있고, 섞어서 세우면 `1.2`가 어느 프로젝트의 것인지 알 수 없다.
    */
    const own = (nodes.data ?? [])
      .filter((row) => row.project_id === project.id)
      .map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        body: null,
        position: row.position,
      }));

    byProject.set(
      project.id,
      buildOutline(own).map((item) => ({
        id: item.id,
        title: item.title,
        number: item.number,
        depth: item.depth,
      })),
    );
  }

  return (projects.data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    nodes: byProject.get(project.id) ?? [],
  }));
}

/**
 * 이 기록이 놓인 자리들. 창을 열 때 가져온다. (사용자 요청)
 *
 * 기록 카드는 세 화면에 나온다. 카드마다 미리 물어보면 카드 수만큼 왕복이
 * 늘고, 대부분은 열어보지 않는다. 누를 때 묻는다.
 */
export async function findPlacementsOfCapture(captureId: string) {
  await requireActiveAccount();

  const parsed = idSchema.safeParse(captureId);

  if (!parsed.success) {
    return [];
  }

  return listPlacementsOfCapture(parsed.data);
}
