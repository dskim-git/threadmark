"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  PAPER_USE_STATUSES,
  PROJECT_USE_FIELDS,
  maxLengthFor,
  type PaperUseStatus,
} from "@/lib/papers/project-use-fields";
import { createClient } from "@/lib/supabase/server";

/**
 * 프로젝트별 논문 활용 계획 저장과 삭제. (설계 문서 8.3절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. paper_project_uses_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·**양쪽** 참조 확인 트리거
 *
 * 세 번째가 이 표에서 특히 중요하다. 연결 테이블이라 논문과 프로젝트 두 곳을
 * 가리키는데, 외래키 제약은 RLS를 보지 않는다. 한쪽만 확인하면 id만 알면
 * 남의 논문에 대한 계획을 내 프로젝트에 붙일 수 있다.
 *
 * 리디렉션하지 않고 결과를 돌려준다. 계획은 논문 화면에서 여러 프로젝트를
 * 오가며 적는 것이라, 한 번 저장할 때마다 화면이 넘어가면 자리를 잃는다.
 * 분석 서식(14-B)이 같은 이유로 그렇게 되어 있다.
 */

export type SaveProjectUseResult = { ok: true } | { ok: false; message: string };

/*
  아는 상태값 목록. 튜플로 단언하는 이유는 z.enum이 값 하나 이상을 요구하기
  때문이다. 단언하지 않으면 통과한 값의 타입이 그냥 string이 되어, 데이터베이스
  열거형과 맞는지를 컴파일러가 봐주지 못한다.
*/
const statusValues = PAPER_USE_STATUSES.map((status) => status.value) as [
  PaperUseStatus,
  ...PaperUseStatus[],
];

const saveSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  projectId: z.uuid({ message: "잘못된 요청입니다." }),
  /*
    모르는 상태값은 여기서 거부한다. 조회 때와 다른 판단인데, 저장은 값을
    남기는 일이라 모르는 값이 들어가면 그 뒤로 계속 남는다. (보안 원칙 7)
  */
  status: z.enum(statusValues, {
    message: "알 수 없는 상태입니다.",
  }),
  /** 항목 이름 -> 적은 글. 화면이 보낸 것만 담는다. */
  values: z.record(z.string(), z.string()),
});

export async function savePaperProjectUse(
  input: unknown,
): Promise<SaveProjectUseResult> {
  await requireActiveAccount();

  const parsed = saveSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const { sourceId, projectId, status, values: sent } = parsed.data;

  /*
    아는 항목만 담는다. 화면이 보낸 이름을 그대로 쓰면, 오타 난 이름이나
    우리가 모르는 열이 질의에 섞여 들어간다.

    길이는 데이터베이스 제약과 같은 숫자를 쓴다. 화면과 서버가 다른 숫자를
    쓰면 입력은 되는데 저장이 안 되는 칸이 생긴다.
  */
  const values: Record<string, string | null> = {};
  const tooLong: string[] = [];

  for (const field of PROJECT_USE_FIELDS) {
    const raw = (sent[field.column] ?? "").trim();
    const max = maxLengthFor(field);

    if (raw.length > max) {
      tooLong.push(`${field.label}(${max}자)`);
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
      message: `${tooLong.join(", ")}을(를) 넘었습니다. 줄여 주세요.`,
    };
  }

  const supabase = await createClient();

  /*
    짝에 unique가 걸려 있어 upsert가 성립한다. onConflict를 명시하지 않으면
    PostgREST가 기본키(id)로 판단해, 이미 있는 짝에 두 번째 행을 만들려다
    제약에 걸린다.

    owner_id는 보내지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
  */
  const { error } = await supabase.from("paper_project_uses").upsert(
    {
      paper_source_id: sourceId,
      project_id: projectId,
      status,
      ...values,
    },
    { onConflict: "paper_source_id,project_id" },
  );

  if (error) {
    console.error("[ThreadMark] 활용 계획 저장 실패:", error.message);

    return {
      ok: false,
      message: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath(`/sources/${sourceId}`);
  // 프로젝트 화면의 "이 프로젝트에 쓸 논문" 목록도 함께 새로 그린다.
  revalidatePath(`/projects/${projectId}`);

  return { ok: true };
}

const deleteSchema = z.object({
  sourceId: z.uuid({ message: "잘못된 요청입니다." }),
  projectId: z.uuid({ message: "잘못된 요청입니다." }),
});

/**
 * 계획을 지운다.
 *
 * 삭제 표시를 두지 않는다. 자료나 기록과 달리 계획은 "이 프로젝트에는 쓰지
 * 않는다"는 뜻으로 지우는 것이고, 되살릴 것이 없다. 되살릴 수 있어야 하는
 * 것은 원문과 내 생각인데, 그것은 자료와 기록 쪽에 남아 있다.
 *
 * 짝으로 지운다. id로 지우면 화면이 들고 있는 id가 낡았을 때 엉뚱한 줄을
 * 가리킬 수 있는데, 짝은 화면이 보고 있는 논문과 프로젝트 그대로다.
 */
export async function deletePaperProjectUse(
  input: unknown,
): Promise<SaveProjectUseResult> {
  await requireActiveAccount();

  const parsed = deleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const { sourceId, projectId } = parsed.data;

  const supabase = await createClient();

  // 소유자 조건은 RLS의 paper_project_uses_delete_own 정책이 건다.
  const { error } = await supabase
    .from("paper_project_uses")
    .delete()
    .eq("paper_source_id", sourceId)
    .eq("project_id", projectId);

  if (error) {
    console.error("[ThreadMark] 활용 계획 삭제 실패:", error.message);

    return {
      ok: false,
      message: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath(`/sources/${sourceId}`);
  revalidatePath(`/projects/${projectId}`);

  return { ok: true };
}
