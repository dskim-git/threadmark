import { randomUUID } from "node:crypto";

import type { createClient } from "@/lib/supabase/server";

import { flattenOutline, type OutlineSeed } from "./templates";

/**
 * 서식이 준 자리들을 프로젝트에 심는다. (19-A)
 *
 * **`"use server"` 파일에 두지 않는다.** 그 파일이 내보내는 것은 전부
 * 브라우저가 부를 수 있는 동작이 된다. 이 함수는 서버끼리만 쓰는 도우미이고,
 * Supabase 클라이언트를 받기 때문에 브라우저에서 부를 수 있는 모양도 아니다.
 * 17-A에서 상수 하나를 그 파일에 두었다가 빌드가 멈춘 적이 있다.
 *
 * **깊이 한 단씩 나눠 담는다.** 부모와 자식을 한 문장에 함께 담으면,
 * 자식의 트리거가 부모를 찾을 때 **같은 문장에서 방금 넣은 행이 아직 보이지
 * 않는다.** 한 단씩 나누면 앞 단이 이미 담긴 뒤라 확실하게 보인다.
 *
 * id를 우리가 만들어 넣는다. 그래야 담기 전에 부모와 자식을 이어둘 수 있고,
 * 담은 뒤에 id를 돌려받아 짝을 맞추는 일을 하지 않아도 된다. 돌려받은 순서가
 * 보낸 순서와 같다는 보장이 없어서, 그 짝 맞추기는 믿을 만하지 않다.
 *
 * **실패해도 프로젝트는 살린다.** 뼈대를 못 만든 것은 프로젝트를 못 만들
 * 이유가 아니다. 사용자가 손으로 자리를 만들면 된다.
 */
export async function seedOutline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  outline: readonly OutlineSeed[],
): Promise<boolean> {
  const flat = flattenOutline(outline);

  if (flat.length === 0) {
    return true;
  }

  const ids = new Map<string, string>();

  for (const seed of flat) {
    ids.set(seed.key, randomUUID());
  }

  const deepest = Math.max(...flat.map((seed) => seed.depth));

  for (let depth = 0; depth <= deepest; depth += 1) {
    const rows = flat
      .filter((seed) => seed.depth === depth)
      .map((seed) => ({
        id: ids.get(seed.key) as string,
        project_id: projectId,
        parent_id: seed.parentKey === null ? null : (ids.get(seed.parentKey) as string),
        title: seed.title,
        position: seed.position,
      }));

    const { error } = await supabase.from("project_outline_nodes").insert(rows);

    if (error) {
      console.error("[ThreadMark] 서식 뼈대 만들기 실패:", error.message);

      return false;
    }
  }

  return true;
}

