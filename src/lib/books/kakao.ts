import { KAKAO_REQUEST_HEADERS } from "@/lib/net/request-headers";

import { looksLikeIsbn, normalizeIsbn, splitIsbn } from "./isbn";
import { readNames, readPublishedOn, readText, readWebUrl } from "./metadata";

/**
 * Kakao에 책을 물어 후보를 모은다. (설계 문서 12절)
 *
 * **서버에서만 돈다.** REST API 키가 필요하고, 그 값은 브라우저로 나가면
 * 안 된다. 블루프린트 12절이 "REST API 키는 서버 전용 환경변수에 저장하고
 * 브라우저 코드나 저장소에 노출하지 않는다"고 못 박았다.
 *
 * **우리가 하나를 골라주지 않는다.** 후보를 늘어놓고 사람이 고른다.
 * 음악에서 배운 것이다. `붉은 노을`에 다른 가수의 판이 오고 `Dynamite`에
 * 커버가 왔다. 책도 같은 제목의 다른 판, 개정판, 번역본이 흔하다.
 *
 * **어디서 온 값인지 밝힌다.** 밝히지 않으면 "왜 이 출판사로 나오지"를
 * 묻게 된다. (AGENTS.md 2절)
 *
 * 서점 페이지를 긁지 않는다. 12절이 "교보문고는 공식 공개 API에 의존하지
 * 않는다", "서점 페이지를 임의로 스크래핑하지 않는다"고 한다. 교보는 검색
 * 바로가기와 사용자가 직접 넣는 주소로 다룬다.
 */

const ENDPOINT = "https://dapi.kakao.com/v3/search/book";

/** 보여줄 후보 수. 많으면 고르기가 일이 되고 적으면 맞는 것이 빠진다. */
const LIMIT = 5;

/** 기다려 줄 시간. 사람이 단추를 누르고 기다리는 중이다. */
const TIMEOUT_MS = 6000;

/** 찾을 말의 길이 한계. 책 제목이 이보다 길 일은 없다. */
const MAX_QUERY_LENGTH = 200;

export type BookCandidate = {
  title: string;
  /** 책 소개. 긴 글이 오므로 화면이 줄여 보여준다. */
  contents: string | null;
  authors: string[];
  translators: string[];
  publisher: string | null;
  /** 출판일. `YYYY-MM-DD`로 다듬되 못 알아보면 온 그대로 둔다. */
  publishedOn: string | null;
  isbn10: string | null;
  isbn13: string | null;
  thumbnailUrl: string | null;
  /** 상세 페이지 주소. 사용자가 원하면 자료의 주소로 쓴다. */
  detailUrl: string | null;
};

export type BookLookupResult =
  | { ok: true; candidates: BookCandidate[]; notice: string | null }
  | { ok: false; message: string };

/**
 * 제목이나 ISBN으로 책을 찾는다.
 *
 * 실패해도 던지지 않는다. **찾아오기가 안 되는 것은 책을 담지 못할 이유가
 * 아니다.** 화면은 손으로 적는 길을 그대로 열어둔다. 웹사이트 담기에서
 * 읽어 오기가 실패해도 담을 수 있게 한 것과 같다.
 */
export async function lookupBooks(query: unknown): Promise<BookLookupResult> {
  if (typeof query !== "string" || query.trim().length === 0) {
    return { ok: false, message: "찾을 책 제목이나 ISBN을 적어 주세요." };
  }

  const term = query.trim();

  if (term.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: "찾는 말이 너무 깁니다." };
  }

  const key = process.env.KAKAO_REST_API_KEY?.trim();

  if (!key) {
    console.error("[ThreadMark] KAKAO_REST_API_KEY가 설정되지 않았습니다.");

    return {
      ok: false,
      message: "책 찾기가 아직 준비되지 않았습니다. 손으로 적어 주세요.",
    };
  }

  /*
    ISBN으로 적었으면 ISBN으로 묻는다.

    칸을 둘로 나누지 않는 이유는 음악에서와 같다. 사용자가 "어느 칸에 적어야
    하지"를 정하게 만들지 않는다. 숫자 열세 자리를 제목으로 물으면 0건이 온다.

    하이픈을 지워 보낸다. Kakao는 `978-89-...`를 찾지 못한다.
  */
  const byIsbn = looksLikeIsbn(term);
  const sent = byIsbn ? (normalizeIsbn(term) ?? term) : term;

  const url =
    `${ENDPOINT}?query=${encodeURIComponent(sent)}` +
    `&size=${LIMIT}` +
    (byIsbn ? "&target=isbn" : "&target=title");

  const payload = await askJson(url, key);

  if (payload === null) {
    return {
      ok: false,
      message: "지금은 책 정보를 가져오지 못했습니다. 손으로 적어도 됩니다.",
    };
  }

  const candidates = readCandidates(payload);

  if (candidates.length === 0) {
    return {
      ok: true,
      candidates: [],
      notice: byIsbn
        ? "그 ISBN으로 찾은 책이 없습니다. 제목으로도 찾아보세요."
        : "찾은 책이 없습니다. 제목을 줄이거나 ISBN으로 찾아보세요.",
    };
  }

  return { ok: true, candidates, notice: null };
}

/**
 * 응답에서 후보를 읽는다. **모르는 모양은 버린다.**
 *
 * 받아온 값은 전부 남이 쓴 글이다. 모양을 하나하나 확인하고, 아닌 것은
 * 조용히 빼낸다. 하나가 이상해서 전부를 못 쓰게 만들지 않는다.
 */
function readCandidates(payload: unknown): BookCandidate[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const documents = (payload as { documents?: unknown }).documents;

  if (!Array.isArray(documents)) {
    return [];
  }

  return documents
    .map(readCandidate)
    .filter((candidate): candidate is BookCandidate => candidate !== null)
    .slice(0, LIMIT);
}

function readCandidate(value: unknown): BookCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const title = readText(row.title);

  // 제목이 없으면 고를 수가 없다. 화면에 빈 단추가 생긴다.
  if (!title) {
    return null;
  }

  const isbn = splitIsbn(row.isbn);

  return {
    title,
    contents: readText(row.contents),
    authors: readNames(row.authors),
    translators: readNames(row.translators),
    publisher: readText(row.publisher),
    publishedOn: readPublishedOn(row.datetime),
    isbn10: isbn.isbn10,
    isbn13: isbn.isbn13,
    thumbnailUrl: readWebUrl(row.thumbnail),
    detailUrl: readWebUrl(row.url),
  };
}

/**
 * JSON을 받아온다. 안 되면 `null`이다.
 *
 * **열쇠는 부를 때만 붙인다.** 공유하는 헤더 묶음에 비밀값을 두지 않는다.
 * 그 묶음은 검사가 훑고 다니는 목록이다.
 *
 * 실패한 까닭을 남기되 **검색어와 열쇠는 남기지 않는다.** 무엇을 찾았는지가
 * 기록에 쌓이면 그 자체가 남의 자료가 된다. (15-E)
 */
async function askJson(url: string, key: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: {
        ...KAKAO_REQUEST_HEADERS,
        authorization: `KakaoAK ${key}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 쿠키를 보내지도 받지도 않는다.
      credentials: "omit",
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[ThreadMark] Kakao 책 검색 응답 상태:", response.status);

      return null;
    }

    return await response.json();
  } catch (error) {
    /*
      Node의 네트워크 오류는 겉면이 늘 `TypeError: fetch failed`이고 진짜
      까닭은 `cause` 안에 있다. 겉면만 남기면 무엇이 잘못되었는지 모른다.
      15-C에서 그것으로 한참 헤맸다.
    */
    const detail =
      error instanceof Error && error.cause instanceof Error
        ? ` (${error.cause.name}: ${error.cause.message})`
        : "";

    console.error(
      "[ThreadMark] Kakao 책 검색 실패:",
      error instanceof Error ? `${error.name}: ${error.message}` : "알 수 없는 오류",
      detail,
    );

    return null;
  }
}
