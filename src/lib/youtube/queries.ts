import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { thumbnailUrl, watchUrl } from "./video-id";

/**
 * YouTube 영상 자료 조회와 저장. (설계 문서 14절)
 *
 * sources가 담지 않는 것만 여기 있다. 제목과 미리보기 그림과 영상 주소는
 * 자료 자체가 들고 있다.
 */

export type YoutubeProfile = {
  videoId: string;
  channelName: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  /** `null`은 모른다는 뜻이다. false와 다르다. */
  embeddable: boolean | null;
  fetchedAt: string | null;
};

export async function getYoutubeProfile(
  sourceId: string,
): Promise<YoutubeProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    고르는 칸 목록을 변수로 빼지 않는다.

    Supabase 타입은 이 글자를 **그대로 읽어** 돌아올 모양을 정한다. 변수에
    담으면 그냥 `string`이 되고 돌아온 값의 타입이 통째로 무너진다.
    15-E-2a와 19-B에서 두 번 겪었다. (AGENTS.md 6절)
  */
  const { data, error } = await supabase
    .from("youtube_profiles")
    .select(
      "video_id, channel_name, published_at, duration_seconds, embeddable, fetched_at",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 영상 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    videoId: data.video_id,
    channelName: data.channel_name,
    publishedAt: data.published_at,
    durationSeconds: data.duration_seconds,
    embeddable: data.embeddable,
    fetchedAt: data.fetched_at,
  };
}

/** 저장할 값. 전부 밖에서 받아온 것이다. */
export type YoutubeProfileInput = {
  videoId: string;
  channelName: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  embeddable: boolean | null;
};

/**
 * 영상 정보를 담는다. 이미 있으면 덮어쓴다.
 *
 * **덮어쓰는 것이 맞다.** 여기 담기는 값은 전부 YouTube가 준 것이고
 * 사용자가 적은 것이 아니다. 지켜야 할 것은 *사용자가 적은 값*이지
 * *우리가 채운 값*이 아니다. (AGENTS.md 2절)
 *
 * 사용자가 적는 값(제목, 메모)은 `sources`와 `captures`에 있어서 이 함수가
 * 건드리지 않는다. **담는 표를 나눈 덕에 덮어쓸 것과 지킬 것이 저절로
 * 갈린다.**
 *
 * `source_id`에 unique가 걸려 있어 `upsert`가 한 줄로 끝난다.
 */
export async function saveYoutubeProfile(
  sourceId: string,
  input: YoutubeProfileInput,
): Promise<boolean> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    owner_id를 보내지 않는다. 트리거가 채운다. (보안 원칙 2)

    보내면 클라이언트가 소유자를 정하는 길이 생기고, 트리거가 덮어쓰더라도
    "보내도 되는 값"으로 읽히게 된다.
  */
  const { error } = await supabase.from("youtube_profiles").upsert(
    {
      source_id: sourceId,
      video_id: input.videoId,
      channel_name: input.channelName,
      published_at: input.publishedAt,
      duration_seconds: input.durationSeconds,
      embeddable: input.embeddable,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 영상 정보 저장 실패:", error.message);

    return false;
  }

  return true;
}

/**
 * 영상 정보에서 자료 쪽에 함께 담을 값.
 *
 * 제목·미리보기 그림·주소는 `sources`의 것이다. 두 곳에 같은 값을 두지
 * 않으려는 것이고, 그 덕에 **목록 화면의 표지 표시와 검색이 그대로
 * 동작한다.** 책이 같은 방식이다. (15-E-2a)
 */
export function sourceFieldsFromVideo(videoId: string): {
  originalUrl: string;
  thumbnailUrl: string;
} {
  return {
    originalUrl: watchUrl(videoId),
    thumbnailUrl: thumbnailUrl(videoId),
  };
}
