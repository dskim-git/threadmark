import {
  ITUNES_REQUEST_HEADERS,
  MUSICBRAINZ_REQUEST_HEADERS,
} from "@/lib/net/request-headers";

import {
  readItunesCandidates,
  readMusicBrainzCandidates,
  sortCandidates,
  type MusicCandidate,
} from "./candidates";
import {
  buildItunesTerm,
  buildRecordingQuery,
  checkLookupInput,
} from "./lookup-query";

/**
 * 두 곳에 곡을 물어 후보를 모은다. (설계 문서 13.3절)
 *
 * **서버에서만 돈다.** MusicBrainz는 이용 규칙으로 연락할 곳을 밝히기를
 * 요구하고, 브라우저에서 보내면 그 값을 우리가 정할 수 없다.
 *
 * 어디에 무엇을 맡기는가
 *
 *   MusicBrainz  한글 제목·아티스트·앨범·재생시간·발매일
 *   iTunes       표지·장르·발매일. 이름은 대개 영문으로 온다
 *
 * 13.3절이 "MusicBrainz를 기본 공개 메타데이터 공급자로 우선 검토한다"고
 * 하고, Apple Music은 "선택적 공급자"라고 한다. 그래서 MusicBrainz를 앞에
 * 두고 iTunes를 곁들인다. **한쪽이 죽어도 나머지로 굴러간다.** 같은 절이
 * "특정 상용 서비스 하나에 종속되지 않게 한다"고 하는 것이 그것이다.
 *
 * **우리가 하나를 골라주지 않는다.** 받아보니 그러면 안 되는 이유가
 * 분명했다. `붉은 노을 / 이문세`에 iTunes는 BIGBANG의 판을 주고,
 * `Dynamite / BTS`에는 Live 버전을 준다. 사람이 보고 고른다.
 */

/** 한 곳에서 받아올 후보 수. 많으면 고르기 어렵고 적으면 맞는 것이 빠진다. */
const LIMIT = 5;

/** 한 곳에 허용하는 시간. */
const TIMEOUT_MS = 6000;

export type LookupResult =
  | { ok: true; candidates: MusicCandidate[]; notice: string | null }
  | { ok: false; message: string };

/**
 * 곡 이름(과 아티스트)으로 후보를 찾는다.
 *
 * 실패해도 던지지 않는다. 찾아오기가 안 되는 것은 곡을 담지 못할 이유가
 * 아니다. 화면은 손으로 적는 길을 그대로 열어둔다.
 */
export async function lookupMusic(
  title: unknown,
  artist: unknown,
): Promise<LookupResult> {
  const checked = checkLookupInput(title, artist);

  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  /*
    두 곳에 동시에 묻는다. 차례로 물으면 기다리는 시간이 두 배가 된다.
    한쪽이 실패해도 나머지 것을 쓴다. `allSettled`가 그것을 해준다.
  */
  const [mb, itunes] = await Promise.all([
    askMusicBrainz(checked.title, checked.artist),
    askItunes(checked.title, checked.artist),
  ]);

  let candidates = sortCandidates([...mb, ...itunes]);
  let notice: string | null = null;

  /*
    아티스트를 적었는데 아무것도 못 찾았으면 **제목만으로 다시 묻는다.**

    `밤편지`에 `아이유`를 함께 넣으면 못 찾는다. MusicBrainz에 그 이름이
    `IU`로 올라가 있기 때문이다. 사용자가 그것을 알 필요는 없다.
    실제로 받아보고 알게 된 것이라 여기 적어둔다.
  */
  if (candidates.length === 0 && checked.artist) {
    const [mbAgain, itunesAgain] = await Promise.all([
      askMusicBrainz(checked.title, null),
      askItunes(checked.title, null),
    ]);

    candidates = sortCandidates([...mbAgain, ...itunesAgain]);

    if (candidates.length > 0) {
      notice = `\`${checked.artist}\`로는 찾지 못해 곡 이름만으로 찾았습니다. 아래에서 맞는 것을 골라 주세요.`;
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        "찾지 못했습니다. 곡 이름을 바꿔 보시거나 직접 적어 주세요. 아주 최근에 나온 곡이나 국내 인디 음악은 아직 등록되지 않은 경우가 있습니다.",
    };
  }

  return { ok: true, candidates, notice };
}

/**
 * MusicBrainz에 묻는다.
 *
 * 실패하면 빈 목록을 돌려준다. 던지지 않는 이유는, 한쪽이 죽었을 때
 * 나머지 한쪽으로도 굴러가야 하기 때문이다.
 */
async function askMusicBrainz(
  title: string,
  artist: string | null,
): Promise<MusicCandidate[]> {
  const query = buildRecordingQuery(title, artist);
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${LIMIT}`;

  const payload = await askJson(url, MUSICBRAINZ_REQUEST_HEADERS, "MusicBrainz");

  return payload === null ? [] : readMusicBrainzCandidates(payload);
}

/** iTunes에 묻는다. `country`를 붙이지 않는 이유는 lookup-query.ts에 적었다. */
async function askItunes(
  title: string,
  artist: string | null,
): Promise<MusicCandidate[]> {
  const term = buildItunesTerm(title, artist);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${LIMIT}`;

  const payload = await askJson(url, ITUNES_REQUEST_HEADERS, "iTunes");

  return payload === null ? [] : readItunesCandidates(payload);
}

/**
 * JSON을 받아온다. 안 되면 null이다.
 *
 * 실패한 까닭을 남긴다. Node의 네트워크 오류는 겉면이 늘
 * `TypeError: fetch failed`이고 진짜 까닭은 `cause` 안에 있다. 겉면만
 * 남기면 무엇이 잘못되었는지 알 수 없다. 15-C에서 그것으로 한참 헤맸다.
 *
 * 검색어는 남기지 않는다. 사용자가 무엇을 찾았는지가 기록에 쌓이면 그
 * 자체가 남의 자료가 된다.
 */
async function askJson(
  url: string,
  headers: Record<string, string>,
  who: string,
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 쿠키를 보내지도 받지도 않는다.
      credentials: "omit",
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[ThreadMark] ${who} 응답 상태:`, response.status);

      return null;
    }

    /*
      `response.json()`을 쓰지 않는다. iTunes는 `text/javascript`로
      돌려주는데 내용은 JSON이다. 종류를 보고 거절하는 구현을 만나면
      멀쩡한 응답이 버려진다. 글로 받아 우리가 읽는다.
    */
    return JSON.parse(await response.text());
  } catch (error) {
    logFailure(who, error);

    return null;
  }
}

function logFailure(who: string, error: unknown): void {
  if (!(error instanceof Error)) {
    console.error(`[ThreadMark] ${who} 조회 실패:`, error);

    return;
  }

  const cause = error.cause;
  const detail =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : typeof cause === "string"
        ? cause
        : "";

  console.error(
    `[ThreadMark] ${who} 조회 실패: ${error.name}: ${error.message}${detail ? ` (${detail})` : ""}`,
  );
}
