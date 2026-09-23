"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  ANALYSIS_FIELDS,
  MAX_ANALYSIS_FIELD_LENGTH,
} from "@/lib/papers/analysis-fields";
import { formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 논문 분석 서식 저장. (설계 문서 8.2절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. paper_analyses_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·참조 확인 트리거
 *
 * 항목을 하나씩 적지 않는다. `ANALYSIS_FIELDS`를 돌며 값을 꺼낸다.
 * 서른 번 같은 줄을 적으면 그중 하나를 빠뜨려도 아무도 못 본다.
 * 화면에는 칸이 보이는데 저장만 되지 않고, 사용자는 길게 적은 글이
 * 사라진 것을 나중에야 안다.
 */

const idSchema = z.uuid();

/**
 * 조회 문자열을 붙여 이동한다.
 *
 * Server Action의 리디렉션 주소는 HTTP 헤더로 전달되고, 헤더 값에는 ASCII만
 * 들어갈 수 있다. 한글 메시지를 주소에 그대로 넣으면 응답 자체가 깨진다.
 */
function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

export async function savePaperAnalysis(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const sourceId = idSchema.safeParse(formValue(formData.get("sourceId")));

  if (!sourceId.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const destination = `/sources/${sourceId.data}`;

  /*
    항목마다 다듬어 담는다. 규칙은 하나뿐이라 따로 스키마를 두지 않는다.
    비면 null, 길면 거부. 길이는 데이터베이스 제약과 같은 숫자를 쓴다.
    화면과 서버가 다른 숫자를 쓰면 입력은 되는데 저장이 안 되는 칸이 생긴다.
  */
  const values: Record<string, string | null> = {};
  const tooLong: string[] = [];

  for (const field of ANALYSIS_FIELDS) {
    const raw = formValue(formData.get(field.column)).trim();

    if (raw.length > MAX_ANALYSIS_FIELD_LENGTH) {
      tooLong.push(field.label);
      continue;
    }

    values[field.column] = raw.length > 0 ? raw : null;
  }

  if (tooLong.length > 0) {
    /*
      길이를 넘긴 칸만 알려주고 아무것도 저장하지 않는다.
      넘친 칸만 빼고 저장하면, 사용자는 저장됐다는 말을 보고 돌아왔다가
      그 칸만 비어 있는 것을 나중에 발견한다.
    */
    redirectWithQuery(`${destination}/analysis`, {
      error: `${tooLong.join(", ")}이(가) ${MAX_ANALYSIS_FIELD_LENGTH}자를 넘습니다. 줄여 주세요.`,
    });
  }

  const supabase = await createClient();

  /*
    source_id에 unique가 걸려 있어 upsert가 성립한다.
    onConflict를 명시하지 않으면 PostgREST가 기본키(id)로 판단해,
    이미 있는 자료에 두 번째 행을 만들려다 제약에 걸린다.

    owner_id는 보내지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
  */
  const { error } = await supabase
    .from("paper_analyses")
    .upsert({ source_id: sourceId.data, ...values }, { onConflict: "source_id" });

  if (error) {
    console.error("[ThreadMark] 논문 분석 저장 실패:", error.message);

    redirectWithQuery(`${destination}/analysis`, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(destination);
  revalidatePath(`${destination}/analysis`);

  /*
    분석 화면으로 되돌아간다. 자료 상세로 보내지 않는 이유는, 서른 칸을
    한 번에 채우는 사람이 없기 때문이다. 저장하고 이어서 적는 것이 보통이라
    그 자리에 그대로 남는 편이 낫다.
  */
  redirectWithQuery(`${destination}/analysis`, {
    notice: "분석을 저장했습니다.",
  });
}
