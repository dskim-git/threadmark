"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import {
  doiWasRejected,
  readPaperProfileForm,
  toAuthorsJson,
} from "@/lib/papers/schema";
import {
  MAX_TITLE_LENGTH,
  firstIssueMessage,
  formValue,
} from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 논문 서지 정보 저장. (설계 문서 8.1절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. paper_profiles_*_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정·참조 확인 트리거
 *
 * 세 번째가 이 표에 필요한 이유는 captures와 같다. 외래키 제약은 RLS를 보지
 * 않아서, source_id 값만 알면 남의 자료에 논문 정보를 붙일 수 있다.
 * 그 확인을 여기서 흉내 내지 않는다. 두 벌이 되면 한쪽만 고쳐졌을 때
 * 어느 쪽이 맞는지 알 수 없다.
 *
 * 만드는 것과 고치는 것을 나누지 않는다. 자료 하나에 논문 정보는 하나뿐이고,
 * 사용자에게는 둘 다 "논문 정보를 적는 일"이다. upsert로 한 길만 둔다.
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

export async function savePaperProfile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const sourceId = idSchema.safeParse(formValue(formData.get("sourceId")));

  if (!sourceId.success) {
    redirectWithQuery("/library", { error: "잘못된 요청입니다." });
  }

  const destination = `/sources/${sourceId.data}`;
  const rawDoi = formValue(formData.get("doi"));

  const parsed = readPaperProfileForm({
    authors: formValue(formData.get("authors")),
    publicationYear: formValue(formData.get("publicationYear")),
    journalName: formValue(formData.get("journalName")),
    volume: formValue(formData.get("volume")),
    issue: formValue(formData.get("issue")),
    pageRange: formValue(formData.get("pageRange")),
    doi: rawDoi,
    issn: formValue(formData.get("issn")),
    abstract: formValue(formData.get("abstract")),
    keywords: formValue(formData.get("keywords")),
    originalLanguage: formValue(formData.get("originalLanguage")),
    citationOverride: formValue(formData.get("citationOverride")),
  });

  if (!parsed.success) {
    redirectWithQuery(`${destination}/paper`, {
      error: firstIssueMessage(parsed.error),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  /*
    가져오기로 받은 제목을 자료에 반영한다. (설계 문서 8.5절)

    화면에서 "제목도 바꾸기"를 고른 경우에만 이 칸이 온다. 고르지 않으면
    아예 보내지 않으므로 자료 제목은 손대지 않는다.

    제목은 sources가 주인이다. 논문 정보 화면에 제목 입력란을 두지 않은 것도
    같은 이유다. 두 곳에서 고칠 수 있으면 어느 쪽이 맞는지 알 수 없어진다.
    여기서 고치는 것은 "가져온 값을 쓰겠다"는 한 번의 선택이지, 제목을
    여기서도 관리한다는 뜻이 아니다.
  */
  const importedTitle = formValue(formData.get("importedTitle")).trim();

  if (importedTitle.length > 0) {
    const title = importedTitle.slice(0, MAX_TITLE_LENGTH);

    const { error: titleError } = await supabase
      .from("sources")
      .update({ title })
      .eq("id", sourceId.data);

    if (titleError) {
      console.error("[ThreadMark] 자료 제목 갱신 실패:", titleError.message);

      redirectWithQuery(`${destination}/paper`, {
        error: "제목을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  /*
    source_id에 unique가 걸려 있어 upsert가 성립한다.
    onConflict를 명시하지 않으면 PostgREST가 기본키(id)로 판단해,
    이미 있는 자료에 두 번째 행을 만들려다 제약에 걸린다.

    owner_id는 보내지 않는다. 트리거가 auth.uid()로 채운다. (보안 원칙 2)
  */
  const { error } = await supabase.from("paper_profiles").upsert(
    {
      source_id: sourceId.data,
      authors: toAuthorsJson(input.authors),
      publication_year: input.publicationYear,
      journal_name: input.journalName,
      volume: input.volume,
      issue: input.issue,
      page_range: input.pageRange,
      doi: input.doi,
      issn: input.issn,
      abstract: input.abstract,
      keywords: input.keywords,
      original_language: input.originalLanguage,
      citation_override: input.citationOverride,
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 논문 정보 저장 실패:", error.message);

    redirectWithQuery(`${destination}/paper`, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(destination);
  revalidatePath("/library");
  revalidatePath("/library/papers");

  /*
    DOI를 적었는데 알아볼 수 없었던 경우를 알린다.
    저장 자체는 막지 않는다. DOI 하나 때문에 나머지를 못 적게 하면,
    사용자는 적어둔 것을 잃지 않으려고 창을 닫지 못한다.
    다만 조용히 사라지게 두지도 않는다. 적은 것이 어디 갔는지 알아야 한다.
  */
  if (doiWasRejected(rawDoi)) {
    redirectWithQuery(destination, {
      notice:
        "논문 정보를 저장했습니다. DOI는 10.으로 시작하는 형태가 아니어서 담지 않았습니다.",
    });
  }

  redirectWithQuery(destination, { notice: "논문 정보를 저장했습니다." });
}
