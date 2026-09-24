"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { saveMediaProfile } from "@/lib/media/queries";
import {
  fetchWorkDetail,
  searchWorks,
  type WorkCandidate,
  type WorkDetail,
} from "@/lib/media/tmdb";
import {
  CAST_LIMIT,
  GENRE_LIMIT,
  MAX_RUNTIME_MINUTES,
  MEDIA_KINDS,
  cleanNames,
  normalizeReleaseDate,
  tmdbUrl,
} from "@/lib/media/works";
import { MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 영화·드라마 정보. (설계 문서 15절)
 *
 * 세 겹으로 막는다.
 *   1. 이 파일의 requireActiveAccount
 *   2. media_profiles 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 *
 * 여기서 내보내는 것은 브라우저가 부를 수 있다. 서버끼리만 쓰는 도우미는
 * `src/lib` 쪽에 둔다. (`docs/VERIFICATION.md` 4-27절)
 */

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/** 제목으로 후보를 찾는다. 담지는 않는다. */
export async function findWorks(
  query: string,
): Promise<
  { ok: true; candidates: WorkCandidate[] } | { ok: false; message: string }
> {
  await requireActiveAccount();

  return searchWorks(query);
}

/**
 * 고른 후보의 자세한 정보를 받는다.
 *
 * 화면이 이 값을 칸에 채우고, 사용자가 `저장`을 눌러야 담긴다. 저장 전에는
 * 아무것도 저장되지 않고 바뀐 값이 바로 보이므로 덮어써도 위험하지 않다.
 */
export async function loadWorkDetail(
  kind: string,
  tmdbId: number,
): Promise<{ ok: true; work: WorkDetail } | { ok: false; message: string }> {
  await requireActiveAccount();

  const parsed = z.enum(MEDIA_KINDS).safeParse(kind);

  if (!parsed.success) {
    return { ok: false, message: "영화인지 드라마인지 알 수 없습니다." };
  }

  return fetchWorkDetail(parsed.data, tmdbId);
}

/**
 * 비워둘 수 있는 숫자 칸.
 *
 * 빈 칸은 0이 아니라 **모름**이다. 0으로 담으면 화면에 `0분`이 떠서
 * 잘못 담긴 것처럼 보이고, 데이터베이스도 0을 막고 있어 저장이 거절된다.
 */
const optionalCount = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value > 0 && value <= max),
      { message: "숫자를 확인해 주세요." },
    );

/**
 * 쉼표로 이어 적은 목록.
 *
 * 화면에서는 한 줄로 적고 여기서 가른다. **빈 것과 너무 긴 것을 빼낸다.**
 * `액션, ` 처럼 쉼표를 하나 더 찍는 일은 흔하고, 그대로 담으면 데이터베이스의
 * `book_names_valid`에 걸려 작품 정보 전체가 저장되지 않는다.
 */
const nameList = (limit: number) =>
  z
    .string()
    .trim()
    .transform((value) => cleanNames(value.split(","), limit));

const saveSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1, "제목을 적어 주세요.").max(MAX_TITLE_LENGTH),
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => (value.length === 0 ? null : value)),
  /*
    아래는 찾아온 값을 그대로 넘기는 칸이다. 화면이 숨은 칸으로 들고 있다가
    함께 보낸다. **숨은 칸이라도 믿지 않는다.** 브라우저에서 고칠 수 있다.
  */
  kind: z.enum(MEDIA_KINDS),
  tmdbId: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .refine(
      (value) => Number.isInteger(value) && value > 0 && value <= 100_000_000,
      { message: "작품 번호를 확인해 주세요." },
    ),
  originalTitle: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value)),
  releasedOn: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || normalizeReleaseDate(value) !== null, {
      message: "개봉일을 확인해 주세요.",
    }),
  genres: nameList(GENRE_LIMIT),
  castNames: nameList(CAST_LIMIT),
  runtimeMinutes: optionalCount(MAX_RUNTIME_MINUTES),
  seasonCount: optionalCount(1000),
  episodeCount: optionalCount(100_000),
  returnTo: z.string(),
});

/**
 * 작품 정보를 담는다.
 *
 * 두 표에 나눠 담는다. 제목·줄거리·포스터·주소는 `sources`, 나머지는
 * `media_profiles`다. 그 덕에 **목록 화면의 표지 표시와 검색이 그대로
 * 동작한다.** 책과 YouTube가 같은 방식이다.
 */
export async function saveMediaWork(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = saveSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    title: formValue(formData.get("title")),
    description: formValue(formData.get("description")),
    kind: formValue(formData.get("kind")),
    tmdbId: formValue(formData.get("tmdbId")),
    originalTitle: formValue(formData.get("originalTitle")),
    releasedOn: formValue(formData.get("releasedOn")),
    genres: formValue(formData.get("genres")),
    castNames: formValue(formData.get("castNames")),
    runtimeMinutes: formValue(formData.get("runtimeMinutes")),
    seasonCount: formValue(formData.get("seasonCount")),
    episodeCount: formValue(formData.get("episodeCount")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    const fallback = sanitizeNextPath(formValue(formData.get("returnTo"))) ?? "/library";

    redirectWithQuery(fallback, {
      error: parsed.error.issues[0]?.message ?? "적어주신 내용을 확인해 주세요.",
    });
  }

  const values = parsed.data;
  const returnTo = sanitizeNextPath(values.returnTo) ?? "/library";
  const poster = formValue(formData.get("posterUrl")).trim();

  const supabase = await createClient();

  /*
    자료 쪽을 먼저 고친다.

    **소유자 조건을 질의에도 건다.** 정책이 이미 막지만, 막는 것과 0건이
    바뀌는 것은 다르다. 여기서 걸면 남의 자료 id가 와도 0건이 되고
    아래에서 알아챈다. (보안 원칙 5)
  */
  const { data: updated, error: sourceError } = await supabase
    .from("sources")
    .update({
      title: values.title,
      description: values.description,
      original_url: tmdbUrl(values.kind, values.tmdbId),
      /*
        포스터 주소는 우리가 만든 것만 받는다. 브라우저에서 온 값이므로
        아무 주소나 담기면 화면의 그림 자리가 남의 서버를 부르게 된다.
      */
      thumbnail_url: poster.startsWith("https://image.tmdb.org/")
        ? poster
        : null,
    })
    .eq("id", values.sourceId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (sourceError || !updated) {
    console.error(
      "[ThreadMark] 작품 자료 저장 실패:",
      sourceError?.message ?? "대상 없음",
    );

    redirectWithQuery(returnTo, {
      error: "저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  const saved = await saveMediaProfile(values.sourceId, {
    tmdbId: values.tmdbId,
    kind: values.kind,
    originalTitle: values.originalTitle,
    releasedOn: values.releasedOn,
    genres: values.genres,
    castNames: values.castNames,
    runtimeMinutes: values.runtimeMinutes,
    seasonCount: values.seasonCount,
    episodeCount: values.episodeCount,
  });

  if (!saved) {
    redirectWithQuery(returnTo, {
      error: "작품 정보를 저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo);
  revalidatePath("/library");

  redirectWithQuery(returnTo, { notice: "작품 정보를 저장했습니다." });
}
