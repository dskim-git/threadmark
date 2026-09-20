"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { originFromHeaders, sanitizeNextPath } from "@/lib/auth/request-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Google 로그인을 시작한다.
 *
 * 브라우저가 아니라 서버에서 인증 URL을 만든다. PKCE code verifier가
 * 서버가 관리하는 쿠키에 저장되고, 자바스크립트 없이도 로그인이 시작된다.
 *
 * 이 단계에서는 로그인에 필요한 기본 권한만 요청한다.
 * Google Drive 권한은 설계 문서 4.1절에 따라 별도의 동의 과정으로 분리하며,
 * 여기서 scope나 offline 접근을 미리 요구하지 않는다.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = sanitizeNextPath(formData.get("next"));
  const origin = originFromHeaders(await headers());

  if (!origin) {
    redirect("/login?error=unknown_origin");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    // 인증 URL에는 PKCE 값이 들어 있으므로 기록하지 않는다.
    console.error(
      "[ThreadMark] Google 로그인 시작 실패:",
      error?.message ?? "인증 URL이 반환되지 않았습니다.",
    );
    redirect("/login?error=oauth_start_failed");
  }

  redirect(data.url);
}
