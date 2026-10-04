/**
 * 공개 링크를 켜고 끄고 읽는 질의. (16-B)
 *
 * **잎사귀가 아니다.** 데이터베이스를 문다. 규칙을 담은 목록은
 * `public-fields.ts`에, 돌아온 값을 다듬는 일은 `public-payload.ts`에 있고
 * 둘은 검사가 따로 들여다본다. (AGENTS.md 6절)
 */

import { readPublicProject, type PublicProject } from "./public-payload.ts";
import { createClient } from "@/lib/supabase/server";

/** 켜져 있는 열쇠 하나와 공개한 내역. */
export type ShareLink = {
  id: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
};

/**
 * 열쇠로 공개된 프로젝트를 읽는다. **로그인하지 않아도 된다.**
 *
 * 문은 함수 하나다. anon에게 표 권한을 주지 않으려고 그렇게 만들었다.
 * (16-B.5절) 여기서는 그 함수를 부르기만 한다.
 *
 * 틀린 열쇠, 끈 열쇠, 지운 프로젝트는 **전부 `null`이다.** 어느 경우인지
 * 구분해 알리지 않는다. (보안 원칙 9)
 */
export async function getPublicProject(
  token: string,
): Promise<PublicProject | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("public_project", {
    p_token: token,
  });

  /*
    **모르면 거부한다.** 질의가 실패하면 빈 화면이 아니라 "없는 링크"다.
    오류 내용을 보는 사람에게 알리지 않는다. 열쇠를 맞혀 보는 사람에게
    "거의 맞았다"를 알려주는 셈이 된다.
  */
  if (error) {
    return null;
  }

  return readPublicProject(data);
}

/**
 * 이 프로젝트의 공개 내역. 최근 것부터.
 *
 * **꺼진 것까지 가져온다.** 그것이 "언제 켜고 껐는지"다. (16-B.6절)
 * 정책이 본인의 줄만 돌려주므로 소유자 확인을 여기서 또 하지 않는다.
 */
export async function listShareLinks(
  projectId: string,
): Promise<ShareLink[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_public_links")
    .select("id, token, created_at, revoked_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    token: row.token,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

/** 지금 켜져 있는 열쇠. 없으면 `null`. */
export function liveLink(links: readonly ShareLink[]): ShareLink | null {
  return links.find((link) => link.revokedAt === null) ?? null;
}
