import { YOUTUBE_REQUEST_HEADERS } from "@/lib/net/request-headers";

import {
  extractVideoId,
  parseDurationSeconds,
  thumbnailUrl,
  watchUrl,
} from "./video-id";

/**
 * YouTube에 영상을 물어 정보를 받아온다. (설계 문서 14절)
 *
 * **서버에서만 돈다.** API 키가 필요하고 그 값은 브라우저로 나가면 안 된다.
 * 14절이 "키는 Next.js 서버 전용 환경변수로 보관한다"고 못 박았다.
 * Picker용 키와 **다른 키**다. (`NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`는
 * 브라우저로 나가는 값이라 이쪽에 쓸 수 없다)
 *
 * **후보를 늘어놓지 않는다.** 책이나 음악과 다른 점이다. 주소를 넣으면 그
 * 영상 하나가 특정되므로 고를 것이 없다. 대신 **어디서 온 값인지 밝힌다.**
 * 밝히지 않으면 "왜 제목이 이렇게 나오지"를 묻게 된다. (AGENTS.md 2절)
 *
 * **사용자 권한을 받지 않는다.** 공개 영상의 정보만 읽으므로 OAuth가 필요
 * 없다. 14절이 "공개 영상 메타데이터 조회에는 사용자 OAuth 권한을 추가하지
 * 않는다"고 한다. 권한을 더하면 그때부터 우리가 그 사람의 YouTube 계정에
 * 닿을 수 있게 되는데, 그럴 이유가 없다.
 *
 * 실패해도 던지지 않는다. **찾아오기가 안 되는 것은 영상을 담지 못할 이유가
 * 아니다.** 화면은 손으로 적는 길을 그대로 열어둔다.
 */

const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

/** 기다려 줄 시간. 사람이 단추를 누르고 기다리는 중이다. */
const TIMEOUT_MS = 6000;

export type VideoInfo = {
  videoId: string;
  title: string;
  channelName: string | null;
  /** 올라온 날. 기계가 찍는 값이라 늘 같은 모양으로 온다. */
  publishedAt: string | null;
  /** 초. 못 알아보면 비운다. 라이브는 길이가 뜻이 없다. */
  durationSeconds: number | null;
  /**
   * 앱 안에서 틀 수 있는가.
   *
   * `null`은 **모른다**는 뜻이다. false와 다르다. 모르는 것을 false로 담으면
   * 틀 수 있는 영상까지 바깥으로 내보내게 된다. (보안 원칙 7)
   */
  embeddable: boolean | null;
  thumbnailUrl: string;
  watchUrl: string;
};

export type VideoLookupResult =
  | { ok: true; video: VideoInfo }
  | { ok: false; message: string };

/**
 * 주소나 영상 번호로 영상 하나를 찾는다.
 *
 * **못 찾은 것과 못 물어본 것을 가른다.** 둘 다 "정보가 없다"로 끝나지만
 * 사용자가 할 일이 다르다. 앞의 것은 주소를 다시 보라는 뜻이고, 뒤의 것은
 * 잠시 뒤에 다시 눌러 보라는 뜻이다. 뭉뚱그리면 주소를 고치느라 시간을
 * 쓰게 된다. (AGENTS.md 6절 `밖에서 받아오는 기능을 만들 때`)
 */
export async function lookupVideo(input: string): Promise<VideoLookupResult> {
  const videoId = extractVideoId(input);

  if (!videoId) {
    return {
      ok: false,
      message:
        "YouTube 주소로 보이지 않습니다. 주소창의 주소를 그대로 붙여넣어 보세요.",
    };
  }

  const key = process.env.YOUTUBE_API_KEY?.trim();

  if (!key) {
    console.error("[ThreadMark] YOUTUBE_API_KEY가 설정되지 않았습니다.");

    return {
      ok: false,
      message: "지금은 YouTube에서 가져올 수 없습니다. 직접 적어 주세요.",
    };
  }

  /*
    필요한 것만 받는다.

    `snippet`은 제목과 채널, `contentDetails`는 길이, `status`는 퍼가기
    가능 여부다. 설명도 `snippet`에 함께 오지만 담지 않는다.
    (마이그레이션 머리말 참고)
  */
  const url = new URL(ENDPOINT);
  url.searchParams.set("part", "snippet,contentDetails,status");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", key);

  let payload: unknown;

  try {
    const response = await fetch(url, {
      headers: YOUTUBE_REQUEST_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      /*
        **응답 본문을 화면에 그대로 보내지 않는다.** 오류 본문에 우리가
        보낸 주소가 통째로 되비쳐 오는 일이 있고, 그 주소에는 API 키가
        들어 있다. 기록에도 상태 번호만 남긴다.
      */
      console.error("[ThreadMark] YouTube 조회 실패:", response.status);

      return {
        ok: false,
        message:
          response.status === 403
            ? "YouTube가 요청을 거절했습니다. 잠시 뒤에 다시 눌러 주세요."
            : "지금은 YouTube에 닿지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
      };
    }

    payload = await response.json();
  } catch (error) {
    console.error(
      "[ThreadMark] YouTube 조회 중 오류:",
      error instanceof Error ? error.name : "unknown",
    );

    return {
      ok: false,
      message: "지금은 YouTube에 닿지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    };
  }

  const item = firstItem(payload);

  if (!item) {
    /*
      영상이 없다. 지워졌거나 비공개이거나 주소가 틀렸다.

      **셋을 우리가 가려낼 수 없다.** API는 셋 다 빈 목록으로 답한다.
      그래서 셋을 다 적어 준다. 하나만 적으면 나머지 두 경우의 사용자가
      엉뚱한 곳을 고치게 된다.
    */
    return {
      ok: false,
      message:
        "그 영상을 찾지 못했습니다. 지워졌거나 비공개이거나 주소가 다를 수 있습니다.",
    };
  }

  return { ok: true, video: readVideo(videoId, item) };
}

/** 돌아온 값에서 첫 영상을 꺼낸다. 모양이 어긋나면 없는 것으로 본다. */
function firstItem(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const items = (payload as { items?: unknown }).items;

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const first: unknown = items[0];

  return typeof first === "object" && first !== null
    ? (first as Record<string, unknown>)
    : null;
}

function readVideo(
  videoId: string,
  item: Record<string, unknown>,
): VideoInfo {
  const snippet = readObject(item.snippet);
  const contentDetails = readObject(item.contentDetails);
  const status = readObject(item.status);

  const duration = readText(contentDetails?.duration);

  return {
    videoId,
    /*
      제목이 비어 오는 일은 없지만, 없으면 주소를 제목으로 쓴다.
      빈 제목으로 담기면 목록에서 그 줄이 사라진 것처럼 보인다.
    */
    title: readText(snippet?.title) ?? watchUrl(videoId),
    channelName: readText(snippet?.channelTitle),
    publishedAt: readIsoDate(snippet?.publishedAt),
    durationSeconds: duration === null ? null : parseDurationSeconds(duration),
    embeddable: readBoolean(status?.embeddable),
    /*
      미리보기 그림 주소는 **우리가 만든다.** 돌려주는 값은 영상마다 있는
      크기가 달라서(`maxres`가 없는 영상이 흔하다) 어느 것을 골랐는지에
      따라 빈 그림이 뜬다. (video-id.ts)
    */
    thumbnailUrl: thumbnailUrl(videoId),
    watchUrl: watchUrl(videoId),
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/**
 * 날짜로 담을 수 있는 값인가.
 *
 * **모양을 확인하고 넘긴다.** 데이터베이스가 `timestamptz`로 받으므로,
 * 알아볼 수 없는 값이 가면 저장이 통째로 실패한다. 영상 정보 전체가
 * 날짜 하나 때문에 안 담기는 것보다, 날짜만 비워 두는 편이 낫다.
 */
function readIsoDate(value: unknown): string | null {
  const text = readText(value);

  if (text === null) {
    return null;
  }

  return Number.isNaN(Date.parse(text)) ? null : text;
}

/** 모르는 값을 false로 읽지 않는다. (보안 원칙 7) */
function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
