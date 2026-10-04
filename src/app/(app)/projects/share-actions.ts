"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 프로젝트 공개를 켜고 끈다. (설계 문서 16-B절)
 *
 * **여기서 열쇠를 만들지 않는다.** 데이터베이스가 만든다. 보낸 값을 쓰면
 * 짧거나 뻔한 열쇠를 넣을 수 있고, 그러면 **주소를 맞혀서 열 수 있게
 * 된다.** 16-B.5절이 막으려는 것이 그것이다.
 *
 * 그래서 켜는 일은 `project_id` 하나만 보내는 `insert`다. 열쇠와 소유자와
 * 만든 때는 전부 트리거가 채우고, 남의 프로젝트인지도 트리거가 본다.
 * (`set_project_public_link`)
 *
 * 끄는 일은 `revoked_at`을 적는 `update`다. **줄을 지우지 않는다.**
 * 공개했던 사실은 남긴다. (16-B.6절) 지우기 권한 자체가 없다.
 *
 * 되살리는 길은 없다. 다시 켜면 **새 줄이고 새 열쇠다.** 한 번 돌아간
 * 링크를 영원히 믿어야 하는 상태를 만들지 않는다.
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

function readProjectId(formData: FormData): string {
  const parsed = idSchema.safeParse(
    typeof formData.get("projectId") === "string"
      ? (formData.get("projectId") as string)
      : "",
  );

  if (!parsed.success) {
    redirectWithQuery("/projects", { error: "잘못된 요청입니다." });
  }

  return parsed.data;
}

/** 공개를 켠다. 새 열쇠가 나온다. */
export async function publishProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = readProjectId(formData);
  const supabase = await createClient();

  /*
    `project_id`만 보낸다. 나머지는 전부 데이터베이스가 정한다.
    생성된 타입도 그 모양이다. `project_id`만 필수다.
  */
  const { error } = await supabase
    .from("project_public_links")
    .insert({ project_id: projectId });

  if (error) {
    console.error("[ThreadMark] 프로젝트 공개 실패:", error.message);

    /*
      **까닭을 자세히 알리지 않는다.** 남의 프로젝트 번호로 눌렀을 때
      "남의 것입니다"라고 답하면 그 번호가 있다는 것을 알려주는 셈이다.
      (보안 원칙 9)
    */
    redirectWithQuery(`/projects/${projectId}`, {
      error: "공개하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithQuery(`/projects/${projectId}`, {
    notice: "링크를 만들었습니다. 이 링크를 아는 사람은 누구나 볼 수 있습니다.",
  });
}

/** 공개를 끈다. 그 자리에서 죽는다. */
export async function unpublishProject(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const projectId = readProjectId(formData);
  const supabase = await createClient();

  /*
    살아 있는 줄만 끈다. 이미 꺼진 줄을 건드리면 트리거가 막는다.
    (끈 열쇠는 되살릴 수 없고, 끈 때도 다시 적을 수 없다)
  */
  const { error } = await supabase
    .from("project_public_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .is("revoked_at", null);

  if (error) {
    console.error("[ThreadMark] 프로젝트 공개 끄기 실패:", error.message);
    redirectWithQuery(`/projects/${projectId}`, {
      error: "공개를 끄지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(`/projects/${projectId}`);
  redirectWithQuery(`/projects/${projectId}`, {
    notice: "공개를 껐습니다. 전에 보낸 링크는 더 이상 열리지 않습니다.",
  });
}
