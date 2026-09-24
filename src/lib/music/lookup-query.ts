/**
 * 음악 검색어를 만든다. (설계 문서 13.3절)
 *
 * MusicBrainz는 Lucene 문법으로 묻는다. **칸을 나눠 물어야 한다.**
 *
 *   못 쓴다:  아이유 밤편지
 *   쓴다:     recording:"밤편지"
 *
 * 처음에 뭉뚱그려 넣었더니 `붉은 노을 이문세`에 MC 스나이퍼의 판이 왔고
 * `BTS Dynamite`에 남이 부른 커버가 왔다. 칸을 나눠 묻자 한글 제목과 한글
 * 아티스트가 그대로 나왔다. **이 모듈이 있는 이유가 그것이다.**
 *
 * 아티스트는 없어도 된다. `밤편지`만으로 찾힌다. 오히려 `아이유`를 함께
 * 넣으면 못 찾는다. MusicBrainz에 그 이름이 `IU`로 올라가 있기 때문이다.
 * 사용자가 그것을 알 필요는 없으므로, **아티스트를 적었을 때만** 조건에 넣고
 * 그래도 못 찾으면 제목만으로 다시 묻는다. (lookup.ts)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 이보다 짧은 제목으로는 묻지 않는다. 한 글자로 물으면 아무 곡이나 온다. */
export const MIN_QUERY_LENGTH = 2;

/** 검색어 길이 상한. 붙여넣기로 문단이 들어오는 것을 막는다. */
export const MAX_QUERY_LENGTH = 200;

/**
 * Lucene이 뜻을 가진 글자로 읽는 것들.
 *
 * 그대로 넘기면 검색이 깨지거나, 더 나쁘게는 **우리가 의도하지 않은 조건**이
 * 된다. 제목에 `:`이 들어간 곡(`Track 1: Intro`)은 흔하고, 그 콜론이
 * 칸 이름을 가리키는 글자로 읽힌다.
 */
const LUCENE_SPECIALS = /[+\-&|!(){}[\]^"~*?:\\/]/gu;

/** Lucene이 글자로 읽게 만든다. */
export function escapeLucene(value: string): string {
  return value.replace(LUCENE_SPECIALS, (match) => `\\${match}`);
}

export type QueryCheck =
  | { ok: true; title: string; artist: string | null }
  | { ok: false; message: string };

/**
 * 사용자가 적은 것을 확인하고 다듬는다.
 *
 * 제목은 반드시 있어야 한다. 아티스트는 없어도 된다.
 */
export function checkLookupInput(
  title: unknown,
  artist: unknown,
): QueryCheck {
  const cleanTitle = clean(title);

  if (cleanTitle.length < MIN_QUERY_LENGTH) {
    return {
      ok: false,
      message: `곡 이름을 ${MIN_QUERY_LENGTH}글자 이상 적어 주세요.`,
    };
  }

  if (cleanTitle.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: "곡 이름이 너무 깁니다." };
  }

  const cleanArtist = clean(artist);

  return {
    ok: true,
    title: cleanTitle,
    artist: cleanArtist.length > 0 ? cleanArtist.slice(0, MAX_QUERY_LENGTH) : null,
  };
}

/**
 * MusicBrainz에 보낼 Lucene 질의.
 *
 * 제목은 따옴표로 묶는다. 묶지 않으면 `주저하는 연인들을 위해`가 낱말
 * 넷으로 쪼개져, 그중 하나만 맞는 곡까지 잔뜩 온다.
 */
export function buildRecordingQuery(
  title: string,
  artist: string | null,
): string {
  const parts = [`recording:"${escapeLucene(title)}"`];

  if (artist) {
    parts.push(`artist:"${escapeLucene(artist)}"`);
  }

  return parts.join(" AND ");
}

/**
 * iTunes에 보낼 검색어.
 *
 * 이쪽은 Lucene이 아니라 그냥 낱말을 받는다. 제목과 아티스트를 붙여서 낸다.
 * **`country`를 붙이지 않는다.** `country=KR`로 물으면 무엇을 물어도 0건이
 * 돌아온다. 확인해보고 알았다. 붙이지 않으면 기본 창구로 가고, 그쪽에도
 * 한국 음악이 있다. 다만 제목이 영문으로 바뀌어 온다. (13.3-1절)
 */
export function buildItunesTerm(title: string, artist: string | null): string {
  return artist ? `${title} ${artist}` : title;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}
