"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { doiWasRejected, normalizeDoi } from "@/lib/papers/schema";
import { MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { SOURCE_RELATION_TYPES } from "@/lib/sources/relation-types";
import { createClient } from "@/lib/supabase/server";

/**
 * 자료끼리의 관계 잇기와 끊기. (설계 문서 8.4절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. source_relations_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·**양쪽** 참조 확인 트리거
 *
 * 양쪽 확인을 여기서 흉내 내지 않는다. 두 벌이 되면 한쪽만 고쳐졌을 때
 * 어느 쪽이 맞는지 알 수 없다. 여기서는 요청 값의 형태만 본다.
 * 프로젝트 연결(11단계)과 같은 생각이다.
 *
 * 고치는 길은 두지 않는다. 관계를 잘못 골랐다면 끊고 다시 잇는다.
 * 데이터베이스도 UPDATE 권한을 주지 않는다.
 */

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
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

const linkSchema = z.object({
  fromSourceId: z.uuid(),
  toSourceId: z.uuid(),
  relationType: z.enum(SOURCE_RELATION_TYPES),
  returnTo: z.string(),
});

export async function linkSourceRelation(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = linkSchema.safeParse({
    fromSourceId: formValue(formData.get("fromSourceId")),
    toSourceId: formValue(formData.get("toSourceId")),
    relationType: formValue(formData.get("relationType")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const { fromSourceId, toSourceId, relationType } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);

  /*
    자기 자신과 잇는 것은 데이터베이스도 막지만 여기서 먼저 걸러 말로
    알려준다. 제약조건에 걸리면 사용자에게는 "잇지 못했습니다"만 남는데,
    왜 안 되는지는 그 문구로 알 수 없다.
  */
  if (fromSourceId === toSourceId) {
    redirectWithQuery(destination, {
      error: "같은 자료끼리는 이을 수 없습니다.",
    });
  }

  const supabase = await createClient();

  // owner_id는 보내지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
  const { error } = await supabase.from("source_relations").insert({
    from_source_id: fromSourceId,
    to_source_id: toSourceId,
    relation_type: relationType,
  });

  if (error) {
    // 이미 이어둔 경우와 권한이 없는 경우를 구분해 알려준다.
    const message =
      error.code === "23505"
        ? "이미 같은 관계로 이어둔 자료입니다."
        : "잇지 못했습니다. 둘 다 내 자료인지 확인해 주세요.";

    console.error("[ThreadMark] 자료 관계 저장 실패:", error.message);
    redirectWithQuery(destination, { error: message });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "자료를 이었습니다." });
}

const candidateSchema = z.object({
  fromSourceId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "논문 제목을 적어 주세요.")
    .max(MAX_TITLE_LENGTH, `제목은 ${MAX_TITLE_LENGTH}자를 넘을 수 없습니다.`),
  /** 비워둘 수 있다. 참고문헌에 DOI가 적혀 있지 않은 경우가 더 많다. */
  doi: z.string(),
  relationType: z.enum(SOURCE_RELATION_TYPES),
  returnTo: z.string(),
});

/**
 * 아직 등록하지 않은 논문을 담아두고 바로 잇는다. (설계 문서 8.4절)
 *
 * 참고문헌에서 제목만 보고 "이건 나중에 읽어야겠다" 싶은 순간이 있다. 그때
 * 자료를 제대로 등록하려면 PDF도 서지 정보도 없는 채로 만들어야 해서, 읽던
 * 것을 멈추게 된다. 제목 한 줄로 담아두고 계속 읽는 길을 둔다.
 *
 * 후보는 따로 담는 표가 아니라 자료의 상태 하나다. 그래서 담아두는 순간부터
 * 관계로 이어지고, 나중에 서지 정보와 분석 서식도 그대로 쓴다.
 *
 * 담아두기와 잇기를 한 번에 한다. 관계 없이 담아두면 어디서 봤는지가 남지
 * 않는다. 그 출처가 바로 지금 읽고 있는 자료다.
 */
export async function addReadingCandidate(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = candidateSchema.safeParse({
    fromSourceId: formValue(formData.get("fromSourceId")),
    title: formValue(formData.get("title")),
    doi: formValue(formData.get("doi")),
    relationType: formValue(formData.get("relationType")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const { fromSourceId, title, relationType } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const rawDoi = parsed.data.doi;

  /*
    DOI를 적었는데 알아볼 수 없으면 아무것도 만들지 않는다. 만들어놓고
    DOI만 빠뜨리면, 사용자는 적어 넣었다고 생각하는데 조용히 사라진다.
  */
  if (doiWasRejected(rawDoi)) {
    redirectWithQuery(destination, {
      error: "DOI를 알아볼 수 없습니다. 10.으로 시작하는 값인지 확인해 주세요.",
    });
  }

  const doi = normalizeDoi(rawDoi);
  const supabase = await createClient();

  // owner_id는 보내지 않는다. 기본값과 트리거가 auth.uid()로 채운다.
  const { data: created, error: createError } = await supabase
    .from("sources")
    .insert({ type: "paper", status: "reading_candidate", title })
    .select("id")
    .single();

  if (createError || !created) {
    console.error(
      "[ThreadMark] 읽을 후보 저장 실패:",
      createError?.message ?? "행이 돌아오지 않았습니다.",
    );
    redirectWithQuery(destination, {
      error: "담아두지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  const { error: relationError } = await supabase
    .from("source_relations")
    .insert({
      from_source_id: fromSourceId,
      to_source_id: created.id,
      relation_type: relationType,
    });

  if (relationError) {
    /*
      후보는 이미 만들어졌다. 되돌리지 않고 무슨 일이 있었는지 그대로
      알린다. 지우면 사용자가 적은 제목까지 함께 사라지는데, 그것은
      관계가 빠진 것보다 나쁘다. 관계는 화면에서 바로 이을 수 있다.
    */
    console.error("[ThreadMark] 후보 관계 저장 실패:", relationError.message);
    redirectWithQuery(destination, {
      error: "논문은 담아두었지만 관계는 잇지 못했습니다. 관련 자료에서 다시 이어 주세요.",
    });
  }

  if (doi !== null) {
    /*
      DOI만 담은 논문 정보를 함께 만든다. 나중에 정식 자료로 바꿀 때
      14-C의 `DOI로 가져오기`가 그 값을 그대로 쓴다.

      실패해도 멈추지 않는다. 후보와 관계는 이미 만들어졌고, DOI는
      논문 정보 화면에서 다시 적을 수 있다.
    */
    const { error: profileError } = await supabase
      .from("paper_profiles")
      .insert({ source_id: created.id, doi });

    if (profileError) {
      console.error(
        "[ThreadMark] 후보 DOI 저장 실패:",
        profileError.message,
      );
      revalidatePath(destination);
      redirectWithQuery(destination, {
        notice: "담아두었습니다. DOI는 저장되지 않아 논문 정보에서 다시 적어야 합니다.",
      });
    }
  }

  revalidatePath(destination);
  redirectWithQuery(destination, {
    notice: "읽을 후보로 담아두고 이었습니다.",
  });
}

const unlinkSchema = z.object({
  relationId: z.uuid(),
  returnTo: z.string(),
});

export async function unlinkSourceRelation(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = unlinkSchema.safeParse({
    relationId: formValue(formData.get("relationId")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const { relationId } = parsed.data;
  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  /*
    관계의 id로 지운다. 화면은 나간 관계와 들어온 관계를 함께 보여주는데,
    짝으로 지우면 어느 방향인지를 폼마다 다시 실어 보내야 한다.
    소유자 조건은 RLS의 source_relations_delete_own 정책이 건다.
  */
  const { error } = await supabase
    .from("source_relations")
    .delete()
    .eq("id", relationId);

  if (error) {
    console.error("[ThreadMark] 자료 관계 삭제 실패:", error.message);
    redirectWithQuery(destination, { error: "관계를 끊지 못했습니다." });
  }

  revalidatePath(destination);
  redirectWithQuery(destination, { notice: "관계를 끊었습니다." });
}
