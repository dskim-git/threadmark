import { TMDB_REQUEST_HEADERS } from "@/lib/net/request-headers";

import {
  CAST_LIMIT,
  GENRE_LIMIT,
  OFFER_KINDS,
  MAX_RUNTIME_MINUTES,
  cleanNames,
  isMediaKind,
  normalizeReleaseDate,
  positiveCount,
  posterUrl,
  releaseYear,
  tmdbUrl,
  type MediaKind,
  type OfferKind,
} from "./works";

/**
 * TMDB에 영화·드라마를 묻는다. (설계 문서 15절)
 *
 * **서버에서만 돈다.** v4 토큰이 필요하고 그 값은 브라우저로 나가면 안
 * 된다. 15절이 "TMDB 자격 증명은 Next.js 서버 전용 환경변수로 저장하고
 * 브라우저 코드나 저장소에 노출하지 않는다"고 못 박았다.
 *
 * **우리가 하나를 골라주지 않는다.** 후보를 늘어놓고 사람이 고른다.
 * 책과 음악에서 배운 것이다. 같은 제목의 영화가 여럿이고(리메이크, 같은
 * 이름의 다른 작품), 영화와 드라마가 같은 이름을 쓰는 일도 흔하다.
 *
 * **두 번 묻는다.**
 *
 *   찾기    제목으로 후보를 받는다. 고르기에 필요한 것만 온다
 *   자세히  고른 것 하나의 장르·출연진·시즌을 받는다
 *
 * 한 번에 받을 수 없다. 찾기 응답에는 장르 **번호**만 오고 출연진은 아예
 * 오지 않는다. 후보 열 개의 자세한 정보를 미리 받으면 **아홉 번은 버리는
 * 왕복**이 된다.
 *
 * 실패해도 던지지 않는다. **찾아오기가 안 되는 것은 작품을 담지 못할
 * 이유가 아니다.** 화면은 손으로 적는 길을 그대로 열어둔다.
 *
 * 출처 표기는 `/credits`에 있다. (15.1절, `src/lib/legal/attribution.ts`)
 */

const BASE = "https://api.themoviedb.org/3";

/** 보여줄 후보 수. 많으면 고르기가 일이 되고 적으면 맞는 것이 빠진다. */
const LIMIT = 8;

/** 기다려 줄 시간. 사람이 단추를 누르고 기다리는 중이다. */
const TIMEOUT_MS = 6000;

/** 찾을 말의 길이 한계. 작품 제목이 이보다 길 일은 없다. */
const MAX_QUERY_LENGTH = 200;

export type WorkCandidate = {
  tmdbId: number;
  kind: MediaKind;
  /** 우리말 제목이 있으면 그것, 없으면 원제. */
  title: string;
  originalTitle: string | null;
  /** 개봉 연도. 같은 제목을 가르는 값이다. */
  year: string | null;
  /** 줄거리. 없는 작품이 흔하다. */
  overview: string | null;
  posterUrl: string | null;
};

export type WorkDetail = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  releasedOn: string | null;
  genres: string[];
  castNames: string[];
  runtimeMinutes: number | null;
  /** 드라마만. 영화에서는 비어 있다. */
  seasonCount: number | null;
  episodeCount: number | null;
  posterUrl: string | null;
  tmdbUrl: string;
};

export type SearchResult =
  | { ok: true; candidates: WorkCandidate[] }
  | { ok: false; message: string };

export type DetailResult =
  | { ok: true; work: WorkDetail }
  | { ok: false; message: string };

/**
 * 제목으로 영화와 드라마를 함께 찾는다.
 *
 * `search/multi`를 쓴다. 영화와 드라마를 따로 물으면 왕복이 둘이 되고,
 * **어느 쪽을 먼저 보여줄지를 우리가 정하게 된다.** TMDB가 섞어서 맞는
 * 순서로 준다. 사람(배우·감독)도 함께 오는데 그것은 걸러낸다.
 */
export async function searchWorks(query: string): Promise<SearchResult> {
  const trimmed = query.trim();

  if (trimmed === "") {
    return { ok: false, message: "찾을 제목을 적어 주세요." };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: "찾을 말이 너무 깁니다." };
  }

  const url = new URL(`${BASE}/search/multi`);

  url.searchParams.set("query", trimmed);
  /*
    우리말로 받는다. 없으면 TMDB가 원어로 준다.

    `include_adult`는 끈다. 기본값이 이미 꺼져 있지만, 기본값에 기대면
    그쪽이 바뀌었을 때 조용히 달라진다.
  */
  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("include_adult", "false");

  const payload = await request(url);

  if (!payload.ok) {
    return payload;
  }

  const results = readArray(payload.data, "results");
  const candidates: WorkCandidate[] = [];

  for (const item of results) {
    const row = readObject(item);

    if (!row) {
      continue;
    }

    /*
      **사람은 거른다.** `search/multi`는 배우와 감독도 돌려준다.
      `media_type`이 `person`인 것들이며, 그것을 작품으로 담으면 제목이
      사람 이름인 자료가 생긴다.
    */
    const kind = row.media_type;

    if (!isMediaKind(kind)) {
      continue;
    }

    const tmdbId = positiveCount(row.id, 100_000_000);

    if (tmdbId === null) {
      continue;
    }

    /*
      영화와 드라마가 칸 이름이 다르다.

        영화    title,  original_title,  release_date
        드라마  name,   original_name,   first_air_date

      **이것이 TMDB를 다룰 때 가장 자주 걸리는 자리다.** 한쪽만 읽으면
      드라마의 제목이 통째로 비어 목록에 빈 줄이 뜬다.
    */
    const title = readText(kind === "movie" ? row.title : row.name);
    const originalTitle = readText(
      kind === "movie" ? row.original_title : row.original_name,
    );
    const date = kind === "movie" ? row.release_date : row.first_air_date;

    // 제목이 없으면 고를 수가 없다. 원제라도 있으면 그것을 쓴다.
    const shown = title ?? originalTitle;

    if (shown === null) {
      continue;
    }

    candidates.push({
      tmdbId,
      kind,
      title: shown,
      originalTitle,
      year: releaseYear(date),
      overview: readText(row.overview),
      posterUrl: posterUrl(row.poster_path),
    });

    if (candidates.length >= LIMIT) {
      break;
    }
  }

  return { ok: true, candidates };
}

/**
 * 고른 작품 하나의 자세한 정보를 받는다.
 *
 * `append_to_response=credits`로 출연진을 함께 받는다. 따로 물으면 왕복이
 * 하나 더 늘고, 둘 중 하나만 성공했을 때 무엇을 보여줄지 정해야 한다.
 */
export async function fetchWorkDetail(
  kind: MediaKind,
  tmdbId: number,
): Promise<DetailResult> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { ok: false, message: "작품 번호를 확인해 주세요." };
  }

  const url = new URL(`${BASE}/${kind}/${tmdbId}`);

  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("append_to_response", "credits");

  const payload = await request(url);

  if (!payload.ok) {
    return payload;
  }

  const row = readObject(payload.data);

  if (!row) {
    return {
      ok: false,
      message: "그 작품을 찾지 못했습니다. 다시 골라 주세요.",
    };
  }

  const title = readText(kind === "movie" ? row.title : row.name);
  const originalTitle = readText(
    kind === "movie" ? row.original_title : row.original_name,
  );
  const shown = title ?? originalTitle;

  if (shown === null) {
    return {
      ok: false,
      message: "그 작품의 제목을 읽지 못했습니다.",
    };
  }

  return {
    ok: true,
    work: {
      tmdbId,
      kind,
      title: shown,
      originalTitle,
      overview: readText(row.overview),
      releasedOn: normalizeReleaseDate(
        kind === "movie" ? row.release_date : row.first_air_date,
      ),
      genres: cleanNames(
        readArray(row, "genres").map((genre) => readObject(genre)?.name),
        GENRE_LIMIT,
      ),
      castNames: cleanNames(
        readArray(readObject(row.credits) ?? {}, "cast").map(
          (member) => readObject(member)?.name,
        ),
        CAST_LIMIT,
      ),
      runtimeMinutes: readRuntime(kind, row),
      // 시즌과 회차는 드라마에만 있다. 영화에 담으면 데이터베이스가 막는다.
      seasonCount:
        kind === "tv" ? positiveCount(row.number_of_seasons, 1000) : null,
      episodeCount:
        kind === "tv" ? positiveCount(row.number_of_episodes, 100_000) : null,
      posterUrl: posterUrl(row.poster_path),
      tmdbUrl: tmdbUrl(kind, tmdbId),
    },
  };
}

/**
 * 길이를 읽는다.
 *
 * 영화는 `runtime`에 한 값으로 오고, **드라마는 `episode_run_time`에
 * 목록으로 온다.** 회차마다 달라서다. 우리는 첫 값만 담는다.
 * "대충 몇 분짜리인가"에 답하는 값이고 그 이상으로 쓰지 않는다.
 */
function readRuntime(
  kind: MediaKind,
  row: Record<string, unknown>,
): number | null {
  if (kind === "movie") {
    return positiveCount(row.runtime, MAX_RUNTIME_MINUTES);
  }

  const times = row.episode_run_time;

  if (!Array.isArray(times) || times.length === 0) {
    return null;
  }

  return positiveCount(times[0], MAX_RUNTIME_MINUTES);
}

type RequestResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * TMDB에 한 번 묻는다.
 *
 * **토큰을 헤더로 보낸다.** 주소에 넣으면 그 주소가 기록에 남고, 오류
 * 본문에 되비쳐 오는 일도 있다.
 */
async function request(url: URL): Promise<RequestResult> {
  const token = process.env.TMDB_API_READ_TOKEN?.trim();

  if (!token) {
    console.error("[ThreadMark] TMDB_API_READ_TOKEN이 설정되지 않았습니다.");

    return {
      ok: false,
      message: "지금은 TMDB에서 가져올 수 없습니다. 직접 적어 주세요.",
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        ...TMDB_REQUEST_HEADERS,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      /*
        **응답 본문을 화면에 그대로 보내지 않는다.** 오류 본문에 우리가
        보낸 것이 되비쳐 올 수 있다. 기록에도 상태 번호만 남긴다.
      */
      console.error("[ThreadMark] TMDB 조회 실패:", response.status);

      if (response.status === 404) {
        return { ok: false, message: "그 작품을 찾지 못했습니다." };
      }

      return {
        ok: false,
        message:
          response.status === 401
            ? "TMDB가 요청을 거절했습니다. 토큰을 확인해 주세요."
            : "지금은 TMDB에 닿지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    console.error(
      "[ThreadMark] TMDB 조회 중 오류:",
      error instanceof Error ? error.name : "unknown",
    );

    return {
      ok: false,
      message: "지금은 TMDB에 닿지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    };
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown, key: string): unknown[] {
  const row = readObject(value);
  const found = row?.[key];

  return Array.isArray(found) ? found : [];
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/**
 * 한국에서 볼 수 있는 곳을 받아온다. (설계 문서 15절)
 *
 * **JustWatch가 모은 자료다.** TMDB가 중계하며, 쓰려면 출처를 JustWatch로
 * 밝혀야 한다. 화면의 글과 `/credits`가 그 일을 한다.
 * (`src/lib/legal/attribution.ts`)
 *
 * **영상 자체는 다루지 않는다.** 15절이 "OTT 영상 자체를 임베드하거나
 * 다운로드하지 않는다"고 못 박았다. 받아오는 것은 **어디서 볼 수 있는지와
 * 그곳으로 가는 주소**뿐이다.
 *
 * 한국(`KR`)만 본다. 다른 나라 것을 함께 담으면 "내가 볼 수 있는 곳"이
 * 아닌 줄이 섞이고, 사용자가 눌러보고 나서야 안다.
 */

/** 어느 나라 기준인가. */
export const WATCH_REGION = "KR";

export type WatchOffer = {
  providerName: string;
  offerKind: OfferKind;
  /** TMDB가 준 차례. 그 나라에서 많이 쓰는 곳이 앞이다. */
  displayOrder: number;
};

export type WatchResult =
  | {
      ok: true;
      offers: WatchOffer[];
      /** JustWatch의 그 작품 페이지. 없을 수 있다. */
      link: string | null;
    }
  | { ok: false; message: string };

export async function fetchWatchProviders(
  kind: MediaKind,
  tmdbId: number,
): Promise<WatchResult> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { ok: false, message: "작품 번호를 확인해 주세요." };
  }

  const url = new URL(`${BASE}/${kind}/${tmdbId}/watch/providers`);

  const payload = await request(url);

  if (!payload.ok) {
    return payload;
  }

  const results = readObject(readObject(payload.data)?.results);
  const region = readObject(results?.[WATCH_REGION]);

  if (!region) {
    /*
      **없는 것과 못 받은 것을 가른다.** 한국에서 볼 수 있는 곳이 하나도
      없는 작품은 흔하다. 그것을 실패로 알리면 사용자가 다시 눌러 보게
      된다. 빈 목록으로 돌려주고 화면이 "없다"고 말하게 한다.
    */
    return { ok: true, offers: [], link: null };
  }

  const offers: WatchOffer[] = [];

  for (const kindName of OFFER_KINDS) {
    const list = region[kindName];

    if (!Array.isArray(list)) {
      continue;
    }

    for (const item of list) {
      const row = readObject(item);
      const name = readText(row?.provider_name);

      if (name === null) {
        continue;
      }

      offers.push({
        providerName: name,
        offerKind: kindName,
        /*
          차례가 없으면 맨 뒤로 보낸다. 0으로 두면 맨 앞으로 오는데,
          모르는 값이 가장 잘 보이는 자리를 차지할 이유가 없다.
        */
        displayOrder: positiveCount(row?.display_priority, 10_000) ?? 9_999,
      });
    }
  }

  /*
    `link`는 JustWatch의 그 작품 페이지다. 화면이 "더 보기"로 쓴다.
    **주소 자리에는 https만 받는다.** 밖에서 온 값이 화면의 링크에
    그대로 들어간다. 데이터베이스도 같은 것을 보지만 여기서 먼저 거른다.
  */
  const link = readText(region.link);

  return {
    ok: true,
    offers,
    link: link !== null && link.startsWith("https://") ? link : null,
  };
}
