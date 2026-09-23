"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isThemeFonts,
  isThemeMode,
  isThemePalette,
} from "@/lib/appearance/theme";
import { requireActiveAccount } from "@/lib/auth/account";
import { formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 화면 취향 저장. (설계 문서 4.2절 "사용자별 기능 설정")
 *
 * 값이 세 곳에서 같아야 한다. 이 코드가 보는 목록, 데이터베이스의 check 제약,
 * 그리고 globals.css의 규칙이다. 어느 하나가 어긋나면 고를 수는 있는데
 * 저장이 거부되거나, 저장은 되는데 화면이 안 바뀐다.
 *
 * 모르는 값은 조용히 기본값으로 바꾸지 않고 거부한다. 조회할 때와 다른
 * 판단인데, 저장은 값을 남기는 일이라서다. 사용자가 고른 것과 다른 값이
 * 저장되면 다음에 열었을 때 왜 바뀌어 있는지 알 수 없다.
 *
 * `profiles`의 가드 트리거는 승인 상태와 이메일만 막는다. 이 두 칸은
 * 본인이 바꿀 수 있고, 어느 행을 바꾸는지는 RLS의 profiles_update_own이 건다.
 */
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

export async function saveAppearance(formData: FormData): Promise<void> {
  const account = await requireActiveAccount("/settings");

  const mode = formValue(formData.get("mode"));
  const palette = formValue(formData.get("palette"));
  const fonts = formValue(formData.get("fonts"));

  if (!isThemeMode(mode) || !isThemePalette(palette) || !isThemeFonts(fonts)) {
    redirectWithQuery("/settings", { error: "알 수 없는 값입니다." });
  }

  const supabase = await createClient();

  // 어느 행을 바꾸는지는 RLS가 정한다. 여기서 id를 보내지 않는다.
  const { error } = await supabase
    .from("profiles")
    .update({ theme_mode: mode, theme_palette: palette, theme_fonts: fonts })
    .eq("id", account.userId);

  if (error) {
    console.error("[ThreadMark] 화면 취향 저장 실패:", error.message);
    redirectWithQuery("/settings", {
      error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  /*
    화면 취향은 뿌리 레이아웃이 붙인다. 그래서 설정 화면만이 아니라
    모든 화면을 다시 그려야 한다.
  */
  revalidatePath("/", "layout");
  redirectWithQuery("/settings", { notice: "화면을 바꿨습니다." });
}
