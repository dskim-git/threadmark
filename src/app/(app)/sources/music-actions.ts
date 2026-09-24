"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { MUSIC_TIME_KIND, MAX_MUSIC_LABEL_LENGTH } from "@/lib/captures/music-locator";
import { MAX_TEXT_LENGTH } from "@/lib/captures/schema";
import { checkProviderLink } from "@/lib/music/providers";
import { lookupMusic, type LookupResult } from "@/lib/music/lookup";
import { MAX_POSITION_SECONDS, checkRange } from "@/lib/media/time";
import { MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 음악 정보·링크·시점 기록. (설계 문서 13절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. music_* 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 *
 * 13.6절을 지킨다. 음원 파일을 담지 않고, 담기는 것은 링크와 사람이 적은
 * 글뿐이다. 가사 전문을 받아오는 길은 만들지 않는다.
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
 * 빈 칸은 0이 아니라 **모름**이다. 트랙 번호를 비워두면 0번 트랙이 아니라
 * "몇 번인지 적지 않았다"는 뜻이다. 0으로 담으면 그 둘을 구분할 수 없다.
 */
const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value >= min && value <= max),
      { message: "숫자를 확인해 주세요." },
    );

export type { MusicCandidate } from "@/lib/music/candidates";

/**
 * 곡을 찾아 후보를 돌려준다. (설계 문서 13.3절)
 *
 * **아무것도 저장하지 않는다.** 후보를 보여주는 것까지가 이 함수의 일이고,
 * 무엇을 쓸지는 사용자가 고른다. 우리가 하나를 골라 바로 채우면 `붉은 노을`에
 * BIGBANG의 판이 들어간다. 실제로 받아보고 확인한 것이다. (13.3-1절)
 *
 * 웹사이트 담기의 미리 보기와 같은 생각이다. 밖에서 온 값을 저장하기 전에
 * 사람이 한 번 본다.
 */
export async function lookupMusicCandidates(
  title: string,
  artist: string,
): Promise<LookupResult> {
  await requireActiveAccount();

  return lookupMusic(title, artist);
}

const profileSchema = z.object({
  sourceId: z.uuid(),
  /*
    곡 이름. 자료의 제목으로 저장한다. (13.2절의 `곡명`)

    따로 담지 않는 이유는, 음악 자료에서 자료의 제목이 곧 곡 이름이기
    때문이다. 두 곳에 담으면 "어느 쪽이 맞는가"가 생긴다.

    처음에는 찾는 칸의 곡 이름을 **어디에도 담지 않았다.** 그래서 저장을
    누르면 화면이 새로 그려질 때 자료 제목으로 되돌아갔다. 사용자가 두 번
    말했다. 담을 자리가 없는 값을 화면에만 두면 그렇게 된다.
  */
  trackTitle: z
    .string()
    .trim()
    .min(1, "곡 이름을 적어 주세요.")
    .max(MAX_TITLE_LENGTH),
  artist: optionalText(300),
  albumName: optionalText(300),
  albumArtist: optionalText(300),
  releasedOn: optionalText(100),
  trackNumber: optionalNumber(1, 999),
  durationSeconds: optionalNumber(0, MAX_POSITION_SECONDS),
  genre: optionalText(200),
  language: optionalText(100),
  composer: optionalText(300),
  lyricist: optionalText(300),
  arranger: optionalText(300),
  // 표지는 sources가 담는다. 같은 칸에서 함께 고치게 한다. (13.2절)
  thumbnailUrl: optionalText(2000),
});

/**
 * 음악 정보를 적는다. 없으면 만들고 있으면 고친다.
 *
 * 자료 하나에 음악 정보는 하나다. 표의 `unique`가 그것을 지키고, 여기서는
 * `upsert`로 두 경우를 한 길로 다룬다. 화면이 "처음 적는가"를 알 필요가 없다.
 */
export async function saveMusicProfile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = profileSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    trackTitle: formValue(formData.get("trackTitle")),
    artist: formValue(formData.get("artist")),
    albumName: formValue(formData.get("albumName")),
    albumArtist: formValue(formData.get("albumArtist")),
    releasedOn: formValue(formData.get("releasedOn")),
    trackNumber: formValue(formData.get("trackNumber")),
    durationSeconds: formValue(formData.get("durationSeconds")),
    genre: formValue(formData.get("genre")),
    language: formValue(formData.get("language")),
    composer: formValue(formData.get("composer")),
    lyricist: formValue(formData.get("lyricist")),
    arranger: formValue(formData.get("arranger")),
    thumbnailUrl: formValue(formData.get("thumbnailUrl")),
  });

  const returnTo = sanitizeNextPath(formValue(formData.get("returnTo")));

  if (!parsed.success) {
    redirectWithQuery(returnTo, {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("music_profiles").upsert(
    {
      source_id: input.sourceId,
      artist: input.artist,
      album_name: input.albumName,
      album_artist: input.albumArtist,
      released_on: input.releasedOn,
      track_number: input.trackNumber,
      duration_seconds: input.durationSeconds,
      genre: input.genre,
      language: input.language,
      composer: input.composer,
      lyricist: input.lyricist,
      arranger: input.arranger,
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 음악 정보 저장 실패:", error.message);
    redirectWithQuery(returnTo, {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  /*
    곡 이름과 표지는 자료(sources)가 담는 값이다. 같은 칸에서 함께 고치게
    하되 저장은 따로 한다. 여기서 실패해도 곡 정보는 이미 저장되어 있다.

    표지 주소는 http와 https만 받는다. 찾아온 값이 그대로 화면의 그림
    주소로 들어간다. 아닌 값이면 표지만 빼고 제목은 저장한다.
  */
  const thumbnail = input.thumbnailUrl;
  const safeThumbnail =
    thumbnail === null ||
    thumbnail.startsWith("http://") ||
    thumbnail.startsWith("https://")
      ? thumbnail
      : null;

  const { error: sourceError2 } = await supabase
    .from("sources")
    .update({ title: input.trackTitle, thumbnail_url: safeThumbnail })
    .eq("id", input.sourceId);

  if (sourceError2) {
    console.error("[ThreadMark] 곡 이름·표지 저장 실패:", sourceError2.message);
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");
  redirectWithQuery(returnTo, { notice: "음악 정보를 저장했습니다." });
}

const linkSchema = z.object({
  sourceId: z.uuid(),
  url: z.string(),
  returnTo: z.string(),
});

/** 들을 수 있는 곳을 하나 더한다. (13.6절: 링크만 담는다) */
export async function addProviderLink(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = linkSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    url: formValue(formData.get("url")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const returnTo = sanitizeNextPath(parsed.data.returnTo);
  const checked = checkProviderLink(parsed.data.url);

  if (!checked.ok) {
    redirectWithQuery(returnTo, { error: checked.message });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("music_provider_links").insert({
    source_id: parsed.data.sourceId,
    url: checked.url,
  });

  if (error) {
    console.error("[ThreadMark] 음악 링크 추가 실패:", error.message);
    redirectWithQuery(returnTo, {
      /*
        같은 주소를 두 번 담으면 unique가 막는다. 그것이 가장 흔한 실패이므로
        그 경우를 먼저 말한다.
      */
      error: "링크를 담지 못했습니다. 이미 담은 주소인지 확인해 주세요.",
    });
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");
}

/**
 * 찾은 곡의 재생 링크를 담는다. (설계 문서 13.6절)
 *
 * **화면을 옮기지 않는다.** 이 함수를 부르는 자리는 곡 정보 칸이고, 그 칸에는
 * 아직 저장하지 않은 값이 들어 있다. 화면을 옮기면 그 값이 사라진다.
 * 그래서 폼으로 보내지 않고 값을 돌려준다.
 *
 * 사용자가 손으로 넣는 길(addProviderLink)은 그대로 둔다. 찾아지지 않는
 * 서비스가 많고, 찾아오기는 손을 덜어주는 일이지 조건이 아니다.
 */
export async function attachProviderLink(
  sourceId: string,
  url: string,
): Promise<{ ok: boolean; message: string }> {
  await requireActiveAccount();

  if (!z.uuid().safeParse(sourceId).success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const checked = checkProviderLink(url);

  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("music_provider_links").insert({
    source_id: sourceId,
    url: checked.url,
  });

  if (error) {
    console.error("[ThreadMark] 음악 링크 담기 실패:", error.message);

    // 같은 주소를 두 번 담으면 unique가 막는다. 가장 흔한 실패다.
    return {
      ok: false,
      message: "담지 못했습니다. 이미 담은 주소일 수 있습니다.",
    };
  }

  revalidatePath(`/sources/${sourceId}`);

  return { ok: true, message: `${checked.label} 링크를 담았습니다.` };
}

const removeLinkSchema = z.object({
  id: z.uuid(),
  returnTo: z.string(),
});

/** 링크를 뗀다. 고치는 길은 두지 않는다. 잘못 넣었으면 빼고 다시 넣는다. */
export async function removeProviderLink(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = removeLinkSchema.safeParse({
    id: formValue(formData.get("id")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const returnTo = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("music_provider_links")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[ThreadMark] 음악 링크 삭제 실패:", error.message);
    redirectWithQuery(returnTo, { error: "링크를 빼지 못했습니다." });
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");
}

const timeCaptureSchema = z.object({
  sourceId: z.uuid(),
  start: z.string(),
  end: z.string(),
  label: z.string().trim().max(MAX_MUSIC_LABEL_LENGTH),
  content: z.string().trim().min(1, "메모를 적어 주세요.").max(MAX_TEXT_LENGTH),
  returnTo: z.string(),
});

/**
 * 재생 시점에 메모를 남긴다. (설계 문서 13.4절)
 *
 *   01:08–01:34 / 2절 후렴
 *   현악기가 들어오면서 분위기가 확장되는 부분.
 *
 * 첫 줄이 `locator`로, 둘째 줄이 기록의 본문으로 간다. 시간을 본문에 섞어
 * 적으면 나중에 그 시점으로 옮겨 갈 수 없고 정렬도 안 된다.
 */
export async function createMusicTimeCapture(
  formData: FormData,
): Promise<void> {
  await requireActiveAccount();

  const parsed = timeCaptureSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    start: formValue(formData.get("start")),
    end: formValue(formData.get("end")),
    label: formValue(formData.get("label")),
    content: formData.get("content") ?? "",
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." },
    );
  }

  const returnTo = sanitizeNextPath(parsed.data.returnTo);
  const range = checkRange(parsed.data.start, parsed.data.end);

  if (!range.ok) {
    redirectWithQuery(returnTo, { error: range.message });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    source_id: parsed.data.sourceId,
    // 13.4절의 메모는 내가 쓴 글이다. 원문을 옮긴 것이 아니다. (2.4절)
    capture_type: "note",
    content: parsed.data.content,
    locator: {
      kind: MUSIC_TIME_KIND,
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
      label: parsed.data.label.length > 0 ? parsed.data.label : null,
    },
  });

  if (error) {
    console.error("[ThreadMark] 음악 시점 기록 실패:", error.message);
    redirectWithQuery(returnTo, {
      error: "기록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");
  redirectWithQuery(returnTo, { notice: "그 대목에 기록을 남겼습니다." });
}
