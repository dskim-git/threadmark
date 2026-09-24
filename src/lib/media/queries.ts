import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { isMediaKind, type MediaKind } from "./works";

/**
 * 영화·드라마 자료 조회와 저장. (설계 문서 15절)
 *
 * sources가 담지 않는 것만 여기 있다. 제목·줄거리·포스터·TMDB 주소는
 * 자료 자체가 들고 있다.
 */

export type MediaProfile = {
  tmdbId: number;
  kind: MediaKind;
  originalTitle: string | null;
  releasedOn: string | null;
  genres: string[];
  castNames: string[];
  runtimeMinutes: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
  fetchedAt: string | null;
};

export async function getMediaProfile(
  sourceId: string,
): Promise<MediaProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    고르는 칸 목록을 변수로 빼지 않는다. Supabase 타입은 이 글자를
    그대로 읽어 돌아올 모양을 정한다. (AGENTS.md 6절)
  */
  const { data, error } = await supabase
    .from("media_profiles")
    .select(
      "tmdb_id, media_kind, original_title, released_on, genres, cast_names, runtime_minutes, season_count, episode_count, fetched_at",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 작품 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  /*
    갈래를 한 번 더 확인한다.

    생성된 타입은 컴파일 시점의 약속일 뿐이다. 마이그레이션 뒤 타입을 다시
    만들지 않으면 코드와 실제 스키마가 어긋날 수 있다. 모르는 값이면 영화로
    보지 않고 **없는 것으로 본다.** 잘못된 갈래로 TMDB에 다시 물으면 엉뚱한
    작품이 온다. (보안 원칙 7)
  */
  if (!isMediaKind(data.media_kind)) {
    console.error("[ThreadMark] 모르는 작품 갈래:", data.media_kind);

    return null;
  }

  return {
    tmdbId: data.tmdb_id,
    kind: data.media_kind,
    originalTitle: data.original_title,
    releasedOn: data.released_on,
    genres: data.genres ?? [],
    castNames: data.cast_names ?? [],
    runtimeMinutes: data.runtime_minutes,
    seasonCount: data.season_count,
    episodeCount: data.episode_count,
    fetchedAt: data.fetched_at,
  };
}

export type MediaProfileInput = {
  tmdbId: number;
  kind: MediaKind;
  originalTitle: string | null;
  releasedOn: string | null;
  genres: string[];
  castNames: string[];
  runtimeMinutes: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
};

/**
 * 작품 정보를 담는다. 이미 있으면 덮어쓴다.
 *
 * **덮어쓰는 것이 맞다.** 여기 담기는 값은 전부 TMDB가 준 것이고 사용자가
 * 적은 것이 아니다. 사용자가 적는 값(제목, 줄거리, 메모)은 `sources`와
 * `captures`에 있어서 이 함수가 건드리지 않는다.
 *
 * **담는 표를 나눈 덕에 덮어쓸 것과 지킬 것이 저절로 갈린다.**
 * YouTube에서와 같다. 책은 두 갈래가 한 표에 섞여 있어 칸마다 주석으로
 * 갈라 두어야 했다.
 */
export async function saveMediaProfile(
  sourceId: string,
  input: MediaProfileInput,
): Promise<boolean> {
  await requireActiveAccount();

  const supabase = await createClient();

  // owner_id를 보내지 않는다. 트리거가 채운다. (보안 원칙 2)
  const { error } = await supabase.from("media_profiles").upsert(
    {
      source_id: sourceId,
      tmdb_id: input.tmdbId,
      media_kind: input.kind,
      original_title: input.originalTitle,
      released_on: input.releasedOn,
      genres: input.genres,
      cast_names: input.castNames,
      runtime_minutes: input.runtimeMinutes,
      /*
        영화에는 시즌을 담지 않는다. 데이터베이스도 막지만, 여기서 비워야
        **영화로 바꿨을 때 앞서 담긴 드라마의 시즌이 남지 않는다.**
        걸러내지 않으면 저장이 통째로 거절된다.
      */
      season_count: input.kind === "tv" ? input.seasonCount : null,
      episode_count: input.kind === "tv" ? input.episodeCount : null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 작품 정보 저장 실패:", error.message);

    return false;
  }

  return true;
}
