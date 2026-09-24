/**
 * 두 곳에서 받아온 응답을 같은 모양의 후보로 바꾼다. (설계 문서 13.3절)
 *
 * 13.3절이 "후보 목록에서 정확한 버전 선택"이라고 한다. **우리가 하나를
 * 골라주지 않는다.** 실제로 받아보니 그러면 안 되는 이유가 분명했다.
 *
 *   붉은 노을 / 이문세  →  iTunes는 BIGBANG의 판을 준다
 *   Dynamite / BTS      →  iTunes는 Live 버전을 준다
 *   시인과 촌장         →  iTunes는 `Towner & Town Chief`로 기계번역해 준다
 *
 * 사람이 보고 고르지 않으면 틀린 값이 조용히 들어간다.
 *
 * 두 곳의 성격이 다르다.
 *
 *   MusicBrainz  한글 제목·아티스트를 그대로 준다. 표지와 장르가 약하다
 *   iTunes       표지·장르·발매일이 좋다. 이름을 영문으로 바꿔 준다
 *
 * 그래서 둘을 함께 보여주고, 어디서 온 것인지 밝힌다. 밝히지 않으면
 * "왜 영문으로 나오지"를 묻게 된다.
 *
 * **받아온 것은 남이 쓴 글이다.** 길이를 자르고, 주소는 http와 https만
 * 받는다. 여기서 나온 값은 화면의 칸에 들어가고 사용자가 고칠 수 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 * 받아온 JSON을 그대로 넣어 검사할 수 있다.
 */

/** 화면 칸에 넣을 값의 길이 상한. 데이터베이스 제약조건과 같다. */
const MAX_FIELD_LENGTH = 300;

export type CandidateSource = "musicbrainz" | "itunes";

export type MusicCandidate = {
  source: CandidateSource;
  /** 화면에서 줄을 가리는 열쇠. 두 곳의 값이 겹치지 않게 앞에 출처를 붙인다. */
  key: string;
  title: string;
  artist: string | null;
  albumName: string | null;
  albumArtist: string | null;
  /** 적혀 있는 그대로. 날짜로 바꾸지 않는다. */
  releasedOn: string | null;
  trackNumber: number | null;
  durationSeconds: number | null;
  genre: string | null;
  artworkUrl: string | null;
  /**
   * 들을 수 있는 곳. (설계 문서 13.6절)
   *
   * iTunes가 `trackViewUrl`로 Apple Music 주소를 함께 준다. 이미 받아오는
   * 응답 안에 있어서 요청이 늘지 않는다.
   *
   * MusicBrainz는 **한국 곡에 이 값이 없다.** 서비스 링크를 자원봉사자가
   * 따로 채워야 하는데 국내 곡에는 거의 채워져 있지 않다. 녹음과 판 양쪽에
   * `inc=url-rels`로 물어봤고 둘 다 0개였다. (13.3-1절)
   * 요청을 한 번 더 보내 빈 결과를 받을 이유가 없어서 묻지 않는다.
   */
  listenUrl: string | null;
  /** MusicBrainz가 준 정확도(0~100). iTunes는 주지 않는다. */
  score: number | null;
};

/**
 * MusicBrainz의 recording 응답을 후보로 바꾼다.
 *
 * 앨범은 `releases`의 첫 번째를 쓴다. 한 녹음이 여러 판에 실리는데
 * (정규 앨범, 베스트, 리마스터), 검색은 대개 가장 잘 맞는 것을 앞에 준다.
 * 어느 판인지는 사용자가 고른 뒤 고칠 수 있다.
 *
 * 표지는 Cover Art Archive에서 온다. 그 주소는 판(release)의 id로 만든다.
 * **있는지 미리 확인하지 않는다.** 확인하려면 판마다 요청을 한 번 더 보내야
 * 하는데, 후보가 다섯이면 요청이 다섯 번 늘어난다. 없으면 그림이 안 뜰
 * 뿐이고 화면이 그것을 감춘다.
 */
export function readMusicBrainzCandidates(payload: unknown): MusicCandidate[] {
  const recordings = readArray(payload, "recordings");

  return recordings.flatMap((entry) => {
    const title = text(read(entry, "title"));

    if (!title) {
      return [];
    }

    const id = text(read(entry, "id")) ?? title;
    const release = readArray(entry, "releases")[0];
    const releaseId = release ? text(read(release, "id")) : null;
    const lengthMs = number(read(entry, "length"));

    return [
      {
        source: "musicbrainz" as const,
        key: `musicbrainz:${id}`,
        title,
        artist: joinArtistCredit(entry),
        albumName: release ? text(read(release, "title")) : null,
        albumArtist: null,
        releasedOn: release ? text(read(release, "date")) : null,
        // 검색 응답에는 트랙 번호가 없다. 없는 값을 지어내지 않는다.
        trackNumber: null,
        durationSeconds:
          lengthMs === null ? null : Math.round(lengthMs / 1000),
        // 장르는 이쪽에서 잘 오지 않는다. 비워 두고 iTunes 후보가 채운다.
        genre: null,
        artworkUrl: releaseId
          ? `https://coverartarchive.org/release/${releaseId}/front-250`
          : null,
        // 한국 곡에는 없다. 물어봐도 0개다. (위의 주석 참고)
        listenUrl: null,
        score: number(read(entry, "score")),
      },
    ];
  });
}

/**
 * iTunes의 search 응답을 후보로 바꾼다.
 *
 * 표지 주소가 100픽셀로 온다. 그 주소의 `100x100`을 `300x300`으로 바꾸면
 * 큰 그림을 받는다. 오래된 규칙이지만 지금도 그대로 동작한다. 바뀌어도
 * 그림 하나가 안 뜰 뿐이다.
 */
export function readItunesCandidates(payload: unknown): MusicCandidate[] {
  const results = readArray(payload, "results");

  return results.flatMap((entry) => {
    const title = text(read(entry, "trackName"));

    if (!title) {
      return [];
    }

    const id = number(read(entry, "trackId"));
    const millis = number(read(entry, "trackTimeMillis"));
    const artwork = text(read(entry, "artworkUrl100"));

    return [
      {
        source: "itunes" as const,
        key: `itunes:${id ?? title}`,
        title,
        artist: text(read(entry, "artistName")),
        albumName: text(read(entry, "collectionName")),
        albumArtist: text(read(entry, "collectionArtistName")),
        releasedOn: datePart(text(read(entry, "releaseDate"))),
        trackNumber: integerInRange(read(entry, "trackNumber"), 1, 999),
        durationSeconds: millis === null ? null : Math.round(millis / 1000),
        genre: text(read(entry, "primaryGenreName")),
        artworkUrl: artwork ? httpOnly(artwork.replace("100x100", "300x300")) : null,
        listenUrl: urlOrNull(read(entry, "trackViewUrl")),
        score: null,
      },
    ];
  });
}

/**
 * 후보를 늘어놓을 순서.
 *
 * **MusicBrainz를 앞에 둔다.** 한글 이름을 그대로 주기 때문이다. 13.3절이
 * "MusicBrainz를 기본 공개 메타데이터 공급자로 우선 검토한다"고 한 것과도
 * 맞는다. 그 안에서는 정확도가 높은 것부터다.
 *
 * iTunes는 뒤에 둔다. 표지와 장르를 보태려고 있는 것이고, 이름은 대개
 * 영문이라 먼저 눌리면 안 된다.
 */
export function sortCandidates(
  candidates: readonly MusicCandidate[],
): MusicCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "musicbrainz" ? -1 : 1;
    }

    return (b.score ?? 0) - (a.score ?? 0);
  });
}

// -----------------------------------------------------------------------------
// 받아온 값을 다루는 도우미
// -----------------------------------------------------------------------------
// 전부 `unknown`에서 시작한다. 밖에서 온 JSON이라 모양을 믿지 않는다.
// 하나라도 던지면 후보 목록이 통째로 안 그려진다.

function read(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function readArray(value: unknown, key: string): unknown[] {
  const found = read(value, key);

  return Array.isArray(found) ? found : [];
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/gu, " ").trim();

  return cleaned.length === 0 ? null : cleaned.slice(0, MAX_FIELD_LENGTH);
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const found = number(value);

  return found !== null && Number.isInteger(found) && found >= min && found <= max
    ? found
    : null;
}

/** `2017-03-24T07:00:00Z`에서 날짜만. 시각은 발매일에 뜻이 없다. */
function datePart(value: string | null): string | null {
  return value === null ? null : value.slice(0, 10);
}

/** 받아온 값이 쓸 만한 주소인지. http와 https만 받는다. */
function urlOrNull(value: unknown): string | null {
  const found = text(value);

  if (found === null || found.length > 2000) {
    return null;
  }

  return httpOnly(found);
}

/** 그림 주소는 http와 https만. 화면의 img에 들어가는 값이다. */
function httpOnly(value: string): string | null {
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : null;
}

function joinArtistCredit(entry: unknown): string | null {
  const credits = readArray(entry, "artist-credit");

  const names = credits.flatMap((credit) => {
    const direct = text(read(credit, "name"));

    if (direct) {
      return [direct];
    }

    // 이름이 한 겹 더 안에 있는 경우가 있다.
    const nested = text(read(read(credit, "artist"), "name"));

    return nested ? [nested] : [];
  });

  return names.length > 0 ? text(names.join(", ")) : null;
}
