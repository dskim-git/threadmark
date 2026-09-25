/**
 * 영화·드라마의 갈래와 값 다듬기. (설계 문서 15절)
 *
 * TMDB가 주는 값을 우리가 담을 모양으로 바꾸는 규칙만 여기 있다.
 * **밖에서 온 값이 그대로 들어오는 자리**라, 무엇을 버리고 무엇을 비워
 * 둘지가 여기서 정해진다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** 검사가 이 셈만 따로 들여다볼
 * 수 있어야 한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 영화인가 드라마인가. TMDB가 나누는 그대로다. */
export const MEDIA_KINDS = ["movie", "tv"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  movie: "영화",
  tv: "드라마",
};

export function isMediaKind(value: unknown): value is MediaKind {
  return (
    typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value)
  );
}

export function getMediaKindLabel(value: unknown): string {
  return isMediaKind(value) ? MEDIA_KIND_LABELS[value] : "작품";
}

/**
 * TMDB의 개봉일을 날짜로 다듬는다. 날짜가 아니면 `null`이다.
 *
 * **빈 글자가 온다.** 아직 개봉하지 않았거나 TMDB가 모르는 작품이 그렇다.
 * 그대로 넘기면 데이터베이스가 `date` 칸에 받지 못해 **작품 정보 전체가
 * 저장되지 않는다.** 날짜 하나 때문에 나머지를 잃는 것보다 비워 두는
 * 편이 낫다.
 *
 * 연도만 오는 일은 없다. TMDB는 `YYYY-MM-DD`이거나 빈 글자다. 그래서
 * 모양을 그대로 확인한다.
 */
export function normalizeReleaseDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return null;
  }

  /*
    모양이 맞아도 `2024-02-31`처럼 없는 날일 수 있다.

    **`Date.parse`만으로는 못 잡는다.** 그 값은 NaN이 아니라 조용히
    3월 2일로 넘어간다. 그대로 담으려 하면 PostgreSQL이 거절해서 **작품
    정보 전체가 저장되지 않고**, 화면에는 "저장하지 못했습니다" 한 줄만
    보인다. 어느 값이 문제였는지 알 수 없다.

    그래서 되읽어 견준다. 넘어간 날짜는 적은 것과 달라진다.
  */
  const parsed = new Date(`${trimmed}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

/** 개봉 연도만. 후보를 고를 때 같은 제목을 가르는 값이다. */
export function releaseYear(value: unknown): string | null {
  const date = normalizeReleaseDate(value);

  return date === null ? null : date.slice(0, 4);
}

/**
 * 0보다 크고 한계 안에 드는 정수만 남긴다. 아니면 `null`이다.
 *
 * **0을 그대로 담지 않는다.** TMDB는 모르는 길이를 0으로 주는 일이 있고,
 * 그러면 화면에 `0분`이 떠서 사용자는 잘못 담겼다고 생각한다.
 * 모르는 것은 모른다고 둔다. (보안 원칙 7과 같은 생각이다)
 */
export function positiveCount(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const whole = Math.floor(value);

  return whole > 0 && whole <= max ? whole : null;
}

/** 담을 수 있는 가장 긴 상영 시간(분). 24시간이다. */
export const MAX_RUNTIME_MINUTES = 1440;

/**
 * 길이를 사람이 보는 모양으로. `2시간 19분`, `49분`.
 *
 * 분으로만 적으면 `139분`이 얼마인지 세어야 한다. 한 시간이 안 되면
 * 시간 칸을 붙이지 않는다. `0시간 49분`은 읽기 어렵다.
 */
export function formatRuntime(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;

  if (hours === 0) {
    return `${rest}분`;
  }

  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/**
 * 이름 목록을 다듬는다. 빈 것과 너무 긴 것을 빼고 개수를 자른다.
 *
 * 장르와 출연진이 같은 규칙을 쓴다. 데이터베이스의 `book_names_valid`가
 * 같은 것을 보고, **걸리면 작품 정보 전체가 저장되지 않는다.** 밖에서
 * 온 값이라 빈 이름이 섞이는 일이 실제로 있다.
 */
export function cleanNames(
  values: unknown,
  limit: number,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (trimmed === "" || trimmed.length > 200) {
      continue;
    }

    // 같은 이름이 두 번 오는 일이 있다. 화면에 두 번 보일 이유가 없다.
    if (cleaned.includes(trimmed)) {
      continue;
    }

    cleaned.push(trimmed);

    if (cleaned.length >= limit) {
      break;
    }
  }

  return cleaned;
}

/** 담을 출연진 수. 화면이 한 줄로 보여줄 만큼이다. */
export const CAST_LIMIT = 10;

/** 담을 장르 수. 한 작품에 이보다 많이 붙는 일은 없다. */
export const GENRE_LIMIT = 10;

/**
 * TMDB의 포스터 주소를 만든다. 포스터가 없으면 `null`이다.
 *
 * TMDB는 `/abc.jpg`처럼 경로만 준다. 앞에 붙일 주소는 설정 조회로 받아올
 * 수도 있지만, **그 값은 거의 바뀌지 않고 한 번 더 왕복할 이유가 없다.**
 * 바뀌면 포스터가 안 뜨는 것으로 드러나고, 그때 이 한 줄을 고친다.
 *
 * `w500`은 목록과 자료 화면 양쪽에 넉넉한 크기다.
 */
export function posterUrl(posterPath: unknown): string | null {
  if (typeof posterPath !== "string" || !posterPath.startsWith("/")) {
    return null;
  }

  return `https://image.tmdb.org/t/p/w500${posterPath}`;
}

/** TMDB의 작품 페이지. 자료의 `original_url`이 된다. */
export function tmdbUrl(kind: MediaKind, tmdbId: number): string {
  return `https://www.themoviedb.org/${kind}/${tmdbId}`;
}

/**
 * 볼 수 있는 곳의 갈래. (15-E-2c-2)
 *
 * TMDB가 나누는 그대로다. **다섯을 나누는 이유는 사용자가 할 일이 다르기
 * 때문이다.** 이미 구독 중인 곳이면 바로 보면 되고 사야 하는 곳이면 돈을
 * 내야 한다. 뭉뚱그리면 눌러보고 나서야 안다.
 */
export const OFFER_KINDS = ["flatrate", "rent", "buy", "free", "ads"] as const;

export type OfferKind = (typeof OFFER_KINDS)[number];

const OFFER_KIND_LABELS: Record<OfferKind, string> = {
  flatrate: "구독",
  rent: "대여",
  buy: "구매",
  free: "무료",
  ads: "광고 보고 무료",
};

/**
 * 화면에 늘어놓을 차례.
 *
 * **돈이 덜 드는 쪽을 앞에 둔다.** 이미 구독 중인 곳에 있으면 그것으로
 * 끝이고, 없을 때에야 빌리거나 살지 생각한다. TMDB가 주는 순서는 같은
 * 갈래 안에서만 뜻이 있다.
 */
export const OFFER_KIND_ORDER: Record<OfferKind, number> = {
  free: 0,
  flatrate: 1,
  ads: 2,
  rent: 3,
  buy: 4,
};

export function isOfferKind(value: unknown): value is OfferKind {
  return (
    typeof value === "string" && (OFFER_KINDS as readonly string[]).includes(value)
  );
}

export function getOfferKindLabel(value: unknown): string {
  return isOfferKind(value) ? OFFER_KIND_LABELS[value] : "볼 수 있음";
}

/** 볼 수 있는 곳 한 줄. */
export type WatchProvider = {
  providerName: string;
  offerKind: OfferKind;
  displayOrder: number;
};

/**
 * 받아온 목록을 화면 차례대로 늘어놓는다.
 *
 * 갈래를 먼저 보고, 같은 갈래 안에서는 TMDB가 준 순서를 따른다. 그 순서에는
 * 뜻이 있어서(그 나라에서 많이 쓰는 곳이 앞) 우리가 다시 매기지 않는다.
 * 그래도 같으면 이름으로 가른다. **새로고침마다 차례가 달라지면 사용자는
 * 목록이 움직인다고 느낀다.** (`outline.ts`와 같은 판단)
 */
export function sortProviders<T extends WatchProvider>(
  providers: readonly T[],
): T[] {
  return [...providers].sort(
    (a, b) =>
      OFFER_KIND_ORDER[a.offerKind] - OFFER_KIND_ORDER[b.offerKind] ||
      a.displayOrder - b.displayOrder ||
      a.providerName.localeCompare(b.providerName),
  );
}
