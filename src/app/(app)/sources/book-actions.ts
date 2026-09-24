"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { lookupBooks } from "@/lib/books/kakao";
import { HOLDINGS, READING_STATUSES } from "@/lib/books/reading";
import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 책 정보와 읽기 기록. (설계 문서 12절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. book_profiles 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 */

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

/**
 * 비워둘 수 있는 숫자.
 *
 * 빈 칸은 0이 아니라 **모름**이다. 총 쪽수를 비워두면 0쪽짜리 책이 아니라
 * "몇 쪽인지 적지 않았다"는 뜻이다. 0으로 담으면 그 둘을 구분할 수 없고,
 * 진행률이 "다 읽음"으로 보인다.
 */
const optionalPages = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : Number(value)))
  .refine(
    (value) =>
      value === null ||
      (Number.isInteger(value) && value >= 0 && value <= 100_000),
    { message: "쪽수를 확인해 주세요." },
  );

/**
 * 비워둘 수 있는 날짜.
 *
 * `YYYY-MM-DD`만 받는다. 브라우저의 날짜 칸이 그 모양으로 보내고, 다른
 * 모양이 섞이면 "며칠 걸렸나"를 셀 수 없다.
 */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/u.test(value), {
    message: "날짜를 확인해 주세요.",
  });

/**
 * 여러 이름이 든 칸.
 *
 * 화면에서는 쉼표로 이어 적고 여기서 가른다. 사람이 이름마다 칸을 만드는
 * 것보다 빠르게 적을 수 있고, 저자가 하나뿐인 책이 대부분이다.
 *
 * **빈 것과 너무 긴 것을 빼낸다.** 데이터베이스의 `book_names_valid`가 같은
 * 규칙을 보고, 걸리면 책 전체가 저장되지 않는다. `홍길동, ` 처럼 쉼표를
 * 하나 더 찍는 일은 흔하다.
 */
const nameList = z
  .string()
  .max(3000)
  .transform((value) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && name.length <= 200)
      .slice(0, 50),
  );

const profileSchema = z
  .object({
    sourceId: z.uuid(),

    // 자료가 담는 값. 같은 칸에서 함께 고친다.
    bookTitle: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    description: optionalText(5000),
    thumbnailUrl: optionalText(2000),

    // 밖에서 가져오는 값.
    authors: nameList,
    translators: nameList,
    publisher: optionalText(300),
    publishedOn: optionalText(100),
    isbn10: optionalText(20),
    isbn13: optionalText(20),
    metadataSource: optionalText(100),

    // 사용자가 적는 값.
    holding: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine((value) => value === null || (HOLDINGS as readonly string[]).includes(value), {
        message: "소장 형태를 확인해 주세요.",
      }),
    readingStatus: z.enum(READING_STATUSES),
    totalPages: optionalPages,
    currentPage: optionalPages,
    startedOn: optionalDate,
    finishedOn: optionalDate,
    whyChosen: optionalText(2000),
    verdict: optionalText(5000),
  })
  /*
    두 칸이 서로 어긋나는 경우를 **저장 전에** 잡는다.

    데이터베이스에도 같은 제약이 걸려 있지만, 거기서 걸리면 사용자에게는
    알 수 없는 말로 실패가 돌아온다. 어느 칸이 문제인지 여기서 알려준다.
    막는 것은 데이터베이스이고, 설명하는 것은 여기다.
  */
  .refine(
    (value) =>
      value.totalPages === null ||
      value.currentPage === null ||
      value.currentPage <= value.totalPages,
    { message: "읽은 쪽이 전체 쪽수보다 많습니다." },
  )
  .refine(
    (value) =>
      value.startedOn === null ||
      value.finishedOn === null ||
      value.finishedOn >= value.startedOn,
    { message: "다 읽은 날이 시작한 날보다 앞설 수 없습니다." },
  );

/**
 * 책을 찾아 후보를 돌려준다. (설계 문서 12절)
 *
 * **아무것도 저장하지 않는다.** 후보를 보여주는 것까지가 이 함수의 일이고,
 * 무엇을 쓸지는 사용자가 고른다. 같은 제목의 다른 판, 개정판, 번역본이
 * 흔해서 우리가 하나를 고르면 조용히 틀린 값이 들어간다.
 */
export async function findBooks(query: string) {
  await requireActiveAccount();

  return lookupBooks(query);
}

/**
 * 책 정보와 읽기 기록을 저장한다.
 *
 * 제목·소개·표지는 자료(sources)가 담는 값이라 따로 저장한다. **같은 값을
 * 두 곳에 두지 않으려고** 그렇게 나눠 두었다. 사용자에게는 한 칸으로 보인다.
 */
export async function saveBookProfile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = profileSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    bookTitle: formValue(formData.get("bookTitle")),
    description: formValue(formData.get("description")),
    thumbnailUrl: formValue(formData.get("thumbnailUrl")),
    authors: formValue(formData.get("authors")) ?? "",
    translators: formValue(formData.get("translators")) ?? "",
    publisher: formValue(formData.get("publisher")),
    publishedOn: formValue(formData.get("publishedOn")),
    isbn10: formValue(formData.get("isbn10")),
    isbn13: formValue(formData.get("isbn13")),
    metadataSource: formValue(formData.get("metadataSource")),
    holding: formValue(formData.get("holding")) ?? "",
    readingStatus: formValue(formData.get("readingStatus")) ?? "unread",
    totalPages: formValue(formData.get("totalPages")) ?? "",
    currentPage: formValue(formData.get("currentPage")) ?? "",
    startedOn: formValue(formData.get("startedOn")) ?? "",
    finishedOn: formValue(formData.get("finishedOn")) ?? "",
    whyChosen: formValue(formData.get("whyChosen")),
    verdict: formValue(formData.get("verdict")),
  });

  const returnTo = sanitizeNextPath(formValue(formData.get("returnTo")));

  if (!parsed.success) {
    redirectWithQuery(returnTo, {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  /*
    ISBN은 담기 전에 다시 고른다.

    사용자가 손으로 `978-89-...`처럼 적을 수 있다. 데이터베이스는 숫자만
    받으므로 그대로 보내면 책 전체가 저장되지 않는다. 모양이 아니면 비운다.
    **ISBN 하나 때문에 읽기 기록을 잃지 않는다.**
  */
  const { error } = await supabase.from("book_profiles").upsert(
    {
      source_id: input.sourceId,
      authors: input.authors,
      translators: input.translators,
      publisher: input.publisher,
      published_on: input.publishedOn,
      isbn10: cleanIsbn(input.isbn10, 10),
      isbn13: cleanIsbn(input.isbn13, 13),
      metadata_source: input.metadataSource,
      holding: input.holding as never,
      reading_status: input.readingStatus,
      total_pages: input.totalPages,
      current_page: input.currentPage,
      started_on: input.startedOn,
      finished_on: input.finishedOn,
      why_chosen: input.whyChosen,
      verdict: input.verdict,
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 책 정보 저장 실패:", error.message);
    redirectWithQuery(returnTo, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  /*
    제목·소개·표지는 자료가 담는 값이다. 여기서 실패해도 책 정보는 이미
    저장되어 있다. 표지 주소는 http와 https만 받는다. 찾아온 값이 그대로
    화면의 그림 주소로 들어간다.
  */
  const thumbnail = input.thumbnailUrl;
  const safeThumbnail =
    thumbnail === null ||
    thumbnail.startsWith("http://") ||
    thumbnail.startsWith("https://")
      ? thumbnail
      : null;

  const { error: sourceError } = await supabase
    .from("sources")
    .update({
      title: input.bookTitle,
      description: input.description,
      thumbnail_url: safeThumbnail,
    })
    .eq("id", input.sourceId);

  if (sourceError) {
    console.error("[ThreadMark] 책 제목·소개 저장 실패:", sourceError.message);
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");
  redirectWithQuery(returnTo, { notice: "책 정보를 저장했습니다." });
}

/** 담을 수 있는 모양이 아니면 비운다. 하이픈과 공백은 지운다. */
function cleanIsbn(value: string | null, length: 10 | 13): string | null {
  if (value === null) {
    return null;
  }

  const cleaned = value.replace(/[\s-]/gu, "").toUpperCase();

  if (length === 10) {
    return /^[0-9]{9}[0-9X]$/u.test(cleaned) ? cleaned : null;
  }

  return /^[0-9]{13}$/u.test(cleaned) ? cleaned : null;
}
