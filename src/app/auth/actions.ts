"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * 로그아웃한다.
 *
 * Supabase가 세션을 폐기하고 인증 쿠키를 지운다.
 * GET이 아니라 form 제출로만 실행되므로, 링크 미리보기나 프리페치 때문에
 * 의도치 않게 로그아웃되지 않는다.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[ThreadMark] 로그아웃 실패:", error.message);
  }

  // 실패하더라도 로그인 화면으로 보낸다. 쿠키가 이미 무효일 수 있다.
  redirect("/login");
}
