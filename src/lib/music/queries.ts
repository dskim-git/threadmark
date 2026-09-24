import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { describeProvider } from "./providers";

/**
 * 음악 자료 조회. (설계 문서 13.2절, 13.6절)
 *
 * sources가 담지 않는 것만 여기 있다. 곡명과 표지는 자료 자체가 들고 있다.
 */

export type MusicProfile = {
  artist: string | null;
  albumName: string | null;
  albumArtist: string | null;
  /** 아는 만큼만 적힌 발매일. 날짜로 바꾸지 않는다. */
  releasedOn: string | null;
  trackNumber: number | null;
  /** 초. 사람이 보는 모양은 화면이 만든다. */
  durationSeconds: number | null;
  genre: string | null;
  language: string | null;
  composer: string | null;
  lyricist: string | null;
  arranger: string | null;
};

export type ProviderLink = {
  id: string;
  url: string;
  /** 어느 서비스인지. 담아둔 값이 아니라 주소에서 알아본 것이다. */
  label: string;
};

export async function getMusicProfile(
  sourceId: string,
): Promise<MusicProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("music_profiles")
    .select(
      "artist, album_name, album_artist, released_on, track_number, duration_seconds, genre, language, composer, lyricist, arranger",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 음악 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    artist: data.artist,
    albumName: data.album_name,
    albumArtist: data.album_artist,
    releasedOn: data.released_on,
    trackNumber: data.track_number,
    durationSeconds: data.duration_seconds,
    genre: data.genre,
    language: data.language,
    composer: data.composer,
    lyricist: data.lyricist,
    arranger: data.arranger,
  };
}

/**
 * 이 곡을 들을 수 있는 곳. 담은 순서대로.
 *
 * 서비스 이름은 여기서 알아본다. 담아두지 않는 이유는 providers.ts에 적었다.
 * 요약하면, 담게 하면 고른 것과 붙여넣은 주소가 어긋나는 것을 막을 수 없다.
 */
export async function listProviderLinks(
  sourceId: string,
): Promise<ProviderLink[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("music_provider_links")
    .select("id, url")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 음악 링크 조회 실패:", error.message);

    return [];
  }

  /*
    담을 때도 막지만 읽을 때도 본다. 이 값은 화면의 링크에 들어가고,
    `javascript:`가 거기 들어가면 누르는 순간 실행된다.
  */
  return (data ?? [])
    .filter(
      (row) =>
        row.url.startsWith("http://") || row.url.startsWith("https://"),
    )
    .map((row) => ({
      id: row.id,
      url: row.url,
      label: describeProvider(row.url),
    }));
}
