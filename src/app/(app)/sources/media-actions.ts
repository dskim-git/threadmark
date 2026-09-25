"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { MEDIA_TIME_KIND } from "@/lib/captures/media-locator";
import { parsePosition } from "@/lib/media/time";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import {
  getMediaProfile,
  replaceApiWatchProviders,
  saveMediaProfile,
} from "@/lib/media/queries";
import {
  fetchWatchProviders,
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
  OFFER_KINDS,
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

/**
 * 한국에서 볼 수 있는 곳을 받아와 담는다. (설계 문서 15절)
 *
 * **받아온 줄만 바꾼다.** 사용자가 직접 적은 줄은 건드리지 않는다.
 * 15절이 둘을 구분하라고 한 까닭이 여기서 드러난다.
 *
 * 화면을 바꾸지 않고 결과만 돌려준다. 담기는 서버가 하므로 화면은
 * 다시 그려야 하는데, 그 일은 부르는 쪽이 `router.refresh()`로 한다.
 */
export async function syncWatchProviders(
  sourceId: string,
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  await requireActiveAccount();

  const parsed = z.string().uuid().safeParse(sourceId);

  if (!parsed.success) {
    return { ok: false, message: "자료를 찾을 수 없습니다." };
  }

  /*
    어느 작품인지는 **우리가 담아둔 값에서 읽는다.** 화면이 보내온 번호를
    쓰지 않는다. 브라우저에서 온 값으로 밖에 물으면, 남이 고른 번호를
    우리 서버가 대신 조회하게 만드는 길이 열린다.

    담아둔 값을 읽는 이 조회는 소유자 정책을 통과해야 하므로, 남의 자료
    id가 와도 여기서 없는 것이 된다.
  */
  const profile = await getMediaProfile(parsed.data);

  if (!profile) {
    return {
      ok: false,
      message: "먼저 `찾기`로 작품을 고르고 저장해 주세요.",
    };
  }

  const result = await fetchWatchProviders(profile.kind, profile.tmdbId);

  if (!result.ok) {
    return result;
  }

  const saved = await replaceApiWatchProviders(
    parsed.data,
    result.offers,
    result.link,
  );

  if (!saved) {
    return {
      ok: false,
      message: "받아온 것을 저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    };
  }

  revalidatePath(`/sources/${parsed.data}`);

  return { ok: true, count: result.offers.length };
}

const manualSchema = z.object({
  sourceId: z.string().uuid(),
  providerName: z
    .string()
    .trim()
    .min(1, "볼 수 있는 곳의 이름을 적어 주세요.")
    .max(200),
  offerKind: z.enum(OFFER_KINDS),
  returnTo: z.string(),
});

/**
 * 볼 수 있는 곳을 직접 적는다.
 *
 * **TMDB가 모르는 곳이 있다.** 지역 서비스나 도서관 영상 서비스가 그렇다.
 * 적어둘 자리가 있어야 이 기능이 쓸모 있다.
 *
 * 담을 때 `origin`을 `manual`로 둔다. 다시 받아올 때 살아남는다.
 */
export async function addWatchProvider(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = manualSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    providerName: formValue(formData.get("providerName")),
    offerKind: formValue(formData.get("offerKind")),
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

  const supabase = await createClient();

  // owner_id를 보내지 않는다. 트리거가 채운다. (보안 원칙 2)
  const { error } = await supabase.from("media_watch_providers").insert({
    source_id: values.sourceId,
    provider_name: values.providerName,
    offer_kind: values.offerKind,
    origin: "manual",
    /*
      직접 적은 것은 받아온 것 뒤에 온다. TMDB가 주는 차례는 그 나라에서
      많이 쓰는 곳을 앞에 두는 것이고, 우리가 적은 것에는 그런 뜻이 없다.
    */
    display_order: 9_000,
  });

  if (error) {
    console.error("[ThreadMark] 볼 수 있는 곳 담기 실패:", error.message);

    redirectWithQuery(returnTo, {
      error: error.code === "23505"
        ? "이미 같은 곳이 같은 방법으로 담겨 있습니다."
        : "담지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo);

  redirectWithQuery(returnTo, { notice: "볼 수 있는 곳을 담았습니다." });
}

/** 담아둔 곳 하나를 뺀다. 받아온 것이든 적은 것이든 뺄 수 있다. */
export async function removeWatchProvider(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = z.object({
    id: z.string().uuid(),
    returnTo: z.string(),
  }).safeParse({
    id: formValue(formData.get("id")),
    returnTo: formValue(formData.get("returnTo")),
  });

  const returnTo = sanitizeNextPath(
    parsed.success ? parsed.data.returnTo : formValue(formData.get("returnTo")),
  ) ?? "/library";

  if (!parsed.success) {
    redirectWithQuery(returnTo, { error: "지울 것을 찾지 못했습니다." });
  }

  const supabase = await createClient();

  // 정책이 남의 것을 걸러낸다. 여기서 소유자를 따로 적지 않는다.
  const { error } = await supabase
    .from("media_watch_providers")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[ThreadMark] 볼 수 있는 곳 빼기 실패:", error.message);

    redirectWithQuery(returnTo, {
      error: "빼지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo);

  redirectWithQuery(returnTo, { notice: "볼 수 있는 곳에서 뺐습니다." });
}

const momentSchema = z.object({
  sourceId: z.string().uuid(),
  /*
    셋 다 비워둘 수 있다. 다만 **셋 다 비면 자리가 아니다.** 아래에서
    함께 본다. `refine`을 칸마다 걸면 "무엇을 적어야 하는지"를 칸마다
    말하게 되는데, 실제 규칙은 "셋 중 하나는 있어야 한다"이다.
  */
  season: optionalCount(1000),
  episode: optionalCount(100_000),
  /** 사람이 `12:30`이나 `750`처럼 친다. 읽는 규칙은 한 곳에 있다. */
  position: z.string().trim().max(20),
  content: z
    .string()
    .trim()
    .min(1, "이 대목에 남길 말을 적어 주세요.")
    .max(5000),
  returnTo: z.string(),
});

/**
 * 시즌·회차·시점에 기록을 남긴다. (설계 문서 15절)
 *
 *   "시즌, 회차, 타임코드를 Capture 위치로 저장한다."
 *
 * 담는 곳은 `captures.locator`다. 새 표를 만들지 않는다. PDF·음악·영상이
 * 이미 그 칸을 쓰고 있고 `kind`로 갈린다. (6.3절)
 *
 * **누를 수 없는 자리다.** OTT 영상을 우리가 틀 수 없다. 15절이
 * "OTT 영상 자체를 임베드하거나 다운로드하지 않는다"고 못 박았다.
 * 적어두는 것까지가 우리가 할 수 있는 일이다.
 */
export async function captureMediaMoment(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = momentSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    season: formValue(formData.get("season")),
    episode: formValue(formData.get("episode")),
    position: formValue(formData.get("position")),
    content: formValue(formData.get("content")),
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

  /*
    시점은 사람이 친 글자다. `12:30`도 `750`도 `1:12:00`도 온다.
    읽는 규칙은 `media/time.ts` 한 곳에 있고, 음악이 쓰던 것과 같다.
  */
  const startSeconds =
    values.position === "" ? null : parsePosition(values.position);

  if (values.position !== "" && startSeconds === null) {
    redirectWithQuery(returnTo, {
      error: "시점을 `12:30`이나 `750`처럼 적어 주세요.",
    });
  }

  /*
    **셋 다 비면 자리가 아니다.** 아무것도 가리키지 않는 꼬리표가 붙는다.
    그럴 바에는 기록만 남기는 편이 낫고, 그 길은 기록 화면에 이미 있다.
  */
  if (values.season === null && values.episode === null && startSeconds === null) {
    redirectWithQuery(returnTo, {
      error: "시즌·회차·시점 중 하나는 적어 주세요.",
    });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    source_id: values.sourceId,
    /*
      보면서 남기는 말은 **내가 쓴 글**이다. 대사를 그대로 옮긴 것이
      아니므로 `note`다. (설계 문서 2.4절)
    */
    capture_type: "note",
    content: values.content,
    locator: {
      kind: MEDIA_TIME_KIND,
      season: values.season,
      episode: values.episode,
      startSeconds,
    },
  });

  if (error) {
    console.error("[ThreadMark] 작품 시점 기록 실패:", error.message);

    redirectWithQuery(returnTo, {
      error: "기록하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");

  redirectWithQuery(returnTo, { notice: "그 대목에 기록을 남겼습니다." });
}
