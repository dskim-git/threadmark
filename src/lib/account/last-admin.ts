/**
 * 하나뿐인 관리자인지 본다. (17-A)
 *
 * 관리자가 하나뿐인데 그 계정이 사라지면 **아무도 새 가입을 승인할 수 없게
 * 되고**, 되살릴 길은 Supabase 대시보드에서 직접 SQL을 넣는 것뿐이다.
 * 앱 안에서 앱을 잠글 수 있게 두지 않는다.
 *
 * **이 판단을 한 곳에 둔다.** 삭제 화면은 시작하기 전에 알려주려고 보고,
 * 삭제 동작은 실제로 막으려고 본다. 둘이 각자 세면 어긋날 자리가 생긴다.
 * 자료 화면에서 두 칸이 같은 값을 쓸 때 그 값을 위로 올린 것과 같은 생각이다.
 *
 * **RLS를 우회하는 클라이언트를 쓰지 않는다.** 처음에는 계정을 지우는
 * 모듈에서 `user_roles` 표를 직접 읽었는데, 그 역할에는 그 표의 권한이
 * 부여된 적이 없어 `permission denied`가 났다. 이 저장소에는 같은 일을 겪고
 * 남긴 마이그레이션이 이미 있다.
 * (`20260922093000_grant_drive_connections_to_service_role.sql`)
 *
 * 권한을 더 주는 대신 표를 읽지 않기로 했다. 관리자 수를 세는 일은 남의 행을
 * 봐야 하는 일이 아니고, `count_admins()`가 그 일을 `SECURITY DEFINER`로
 * 대신 해주며 이미 로그인한 사용자에게 열려 있다. **권한이 필요해 보이면
 * 권한을 더하기 전에 그 일이 정말 필요한지 먼저 본다.**
 */

import type { Account } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 이 계정을 지우면 관리자가 없어지는가.
 *
 * 관리자가 아니면 셀 것도 없이 `false`다. 관리자인데 세지 못했으면 `true`다.
 * 모르면 지우지 않는다. (보안 원칙 7)
 */
export async function isLastAdmin(account: Account): Promise<boolean> {
  if (!account.isAdmin) {
    return false;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_admins");

  if (error) {
    console.error("[ThreadMark] 관리자 수 조회 실패:", error.message);

    return true;
  }

  return (data ?? 0) <= 1;
}
