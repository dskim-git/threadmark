"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  ANALYSIS_FIELDS,
  MAX_ANALYSIS_FIELD_LENGTH,
} from "@/lib/papers/analysis-fields";
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
 *
 * 리디렉션하지 않고 결과를 돌려준다. 읽기 작업대(14-E)에서 PDF를 옆에 두고
 * 적기 때문이다. 저장할 때마다 화면이 넘어가면 보던 쪽을 잃고 PDF를 다시
 * 그린다. 인용 저장(13-B)이 같은 이유로 리디렉션하지 않는다.
 */

export type SaveAnalysisResult = { ok: true } | { ok: false; message: string };

const inputSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  /** 항목 이름 -> 적은 글. 화면이 보낸 것만 담는다. */
  values: z.record(z.string(), z.string()),
});

export async function saveAnalysis(
  input: unknown,
): Promise<SaveAnalysisResult> {
  await requireActiveAccount();

  const parsed = inputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const { sourceId, values: sent } = parsed.data;

  /*
    항목마다 다듬어 담는다. 규칙은 하나뿐이라 따로 스키마를 두지 않는다.
    비면 null, 길면 거부. 길이는 데이터베이스 제약과 같은 숫자를 쓴다.
    화면과 서버가 다른 숫자를 쓰면 입력은 되는데 저장이 안 되는 칸이 생긴다.

    아는 항목만 담는다. 화면이 보낸 이름을 그대로 쓰면, 오타 난 이름이나
    우리가 모르는 열이 질의에 섞여 들어간다.
  */
  const values: Record<string, string | null> = {};
  const tooLong: string[] = [];

  for (const field of ANALYSIS_FIELDS) {
    const raw = (sent[field.column] ?? "").trim();

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
    return {
      ok: false,
      message: `${tooLong.join(", ")}이(가) ${MAX_ANALYSIS_FIELD_LENGTH}자를 넘습니다. 줄여 주세요.`,
    };
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
    .upsert({ source_id: sourceId, ...values }, { onConflict: "source_id" });

  if (error) {
    console.error("[ThreadMark] 논문 분석 저장 실패:", error.message);

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 자료 상세의 `논문 분석 n/30`이 바로 반영되게 한다.
  revalidatePath(`/sources/${sourceId}`);

  return { ok: true };
}
