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

/** 지금 공개 중인 것 하나. 어느 프로젝트인지까지 안다. (19-G) */
export type LiveShare = {
  projectId: string;
  projectName: string;
  token: string;
  createdAt: string;
};

/**
 * 내가 지금 공개해 둔 것 전부. 최근에 켠 것부터. (19-G, 21절의 `/shared`)
 *
 * 왜 이 함수가 필요한가
 *   공개하는 일은 프로젝트 화면이 한다. 그런데 **공개한 다음 날 그
 *   프로젝트를 다시 열어볼 까닭이 없다.** 그래서 켜 둔 것이 있는지를
 *   아무도 보지 않는다.
 *
 *   003 결과 표의 `지금_공개중`이 2026-10-06부터 `1`이었고 이틀 동안
 *   그대로였다. **끄는 길이 어려워서가 아니라 보이는 자리가 없어서다.**
 *   검사 글에만 보이고 앱에는 안 보이는 값이 하나 있었다. (4-82절)
 *
 * **꺼진 것은 안 가져온다.** 이 화면이 답하는 물음은 "지금 무엇이 열려
 * 있는가" 하나다. 언제 켜고 껐는지는 프로젝트 화면이 보여준다. 둘을 한
 * 목록에 섞으면 **지금 열린 것이 몇 개인지 세어야 알게 된다.**
 *
 * 소유자 확인을 여기서 또 하지 않는다. 정책이 본인의 줄만 돌려준다.
 * 지운 프로젝트는 켜진 줄이 남지 않지만(003의 검사 137), 그래도 이름을
 * 못 읽은 줄은 버린다. **이름 없이 주소만 보여주면 무엇을 끄는지 모른다.**
 */
export async function listLiveShares(): Promise<LiveShare[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_public_links")
    .select("project_id, token, created_at, projects(name)")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error(
      "[ThreadMark] 공개 중인 목록 조회 실패:",
      error?.message ?? "결과가 없습니다",
    );

    return [];
  }

  return data.flatMap((row) => {
    const name = row.projects?.name;

    if (typeof name !== "string") {
      return [];
    }

    return [
      {
        projectId: row.project_id,
        projectName: name,
        token: row.token,
        createdAt: row.created_at,
      },
    ];
  });
}
