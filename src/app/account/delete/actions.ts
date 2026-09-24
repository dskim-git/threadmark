"use server";

import { redirect } from "next/navigation";

import { matchesAccountEmail } from "@/lib/account/confirmation";
import { deleteAccount } from "@/lib/account/deletion";
import { isLastAdmin } from "@/lib/account/last-admin";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/*
  `"use server"` 파일은 async 함수만 내보낼 수 있다. 상수를 내보내면 빌드가
  거기서 멈춘다. 이 경로는 바깥에서 쓸 일이 없으므로 안에만 둔다.
*/
const DELETE_PATH = "/account/delete";

/**
 * 내 계정을 지운다.
 *
 * **승인 상태를 따지지 않는다.** `requireActiveAccount`가 아니라
 * `requireAccount`를 쓴다. 승인을 기다리는 사람, 거절된 사람, 정지된 사람이
 * 오히려 더 나가고 싶을 수 있고, 그들에게 나가는 길이 없으면 "가입은 됐는데
 * 쓰지도 못하고 지우지도 못하는" 상태에 갇힌다. 개인정보 초안 7절이 그래서
 * 승인 대기·거절 상태의 사용자도 삭제를 요청할 수 있다고 적었다.
 *
 * 로그인은 요구한다. 지우려면 누구인지는 알아야 한다.
 */
export async function deleteMyAccount(formData: FormData): Promise<void> {
  const account = await requireAccount(DELETE_PATH);

  /*
    화면에 칸이 있다고 해서 그 칸을 거쳐 들어온다는 보장은 없다.
    폼이 무엇을 보냈든 서버에서 다시 견준다.
  */
  if (!matchesAccountEmail(formData.get("confirm"), account.email)) {
    redirect(`${DELETE_PATH}?error=confirm_mismatch`);
  }

  /*
    하나뿐인 관리자는 지우지 않는다.

    데이터베이스의 가드 트리거는 service role에 예외를 두는데, 지우는 쪽이
    바로 그 역할이다. 가드가 있다는 사실이 가드가 걸린다는 뜻은 아니다.
    화면도 같은 함수로 미리 보고 안내하지만, 막는 것은 여기다.
  */
  if (await isLastAdmin(account)) {
    redirect(`${DELETE_PATH}?error=last_admin`);
  }

  const result = await deleteAccount(account.userId);

  if (!result.ok) {
    redirect(`${DELETE_PATH}?error=${result.reason}`);
  }

  /*
    이 브라우저의 세션을 지운다.

    `scope: "local"`을 쓴다. 계정이 방금 사라져서 서버에 로그아웃을 물어봐야
    돌아올 답이 없고, 그 실패 때문에 쿠키가 남으면 사용자는 지운 계정으로
    로그인된 채 돌아다니게 된다. 지울 것은 이 기기에 남은 쿠키뿐이다.
    계정이 없으므로 다른 기기의 세션도 어차피 다음 갱신에서 끊긴다.
  */
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    console.error("[ThreadMark] 삭제 후 로그아웃 실패:", error.message);
  }

  redirect("/login?notice=account_deleted");
}
