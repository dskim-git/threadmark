import {
  containsHangul,
  doiLookupUrl,
  mapCrossrefWork,
  summarizeCandidate,
  titleSearchUrl,
  type ImportCandidate,
  type ImportedPaper,
} from "./crossref";

/**
 * Crossref에 실제로 물어보는 곳. (설계 문서 8.5절)
 *
 * 값을 바꾸는 일은 crossref.ts가 한다. 여기서는 요청만 보낸다.
 *
 * **서버에서만 부른다.** 브라우저에서 직접 부르면 사용자의 IP로 요청이 나가고,
 * 우리가 예의를 지키는지 확인할 방법도 없어진다.
 *
 * 키가 필요 없고 값도 치르지 않는다. 대신 Crossref는 요청에 누구인지 밝히기를
 * 권한다. 밝히면 더 여유 있는 쪽(polite pool)으로 보내준다.
 * 밝히지 않아도 동작하므로, 설정이 없을 때도 막지 않는다.
 */

/** 저장소 주소를 밝힌다. 연락처가 설정되어 있으면 함께 보낸다. */
function userAgent(): string {
  const contact = (process.env.SUPPORT_EMAIL ?? "").trim();
  const base = "ThreadMark/0.1 (https://github.com/dskim-git/threadmark)";

  return contact.length > 0 ? `${base} (mailto:${contact})` : base;
}

/**
 * 기다려 줄 시간.
 *
 * 사람이 버튼을 누르고 결과를 기다리는 중이다. 오래 붙들고 있느니
 * 안 됐다고 알려주고 손으로 적게 하는 편이 낫다.
 */
const TIMEOUT_MS = 10_000;

/** 제목으로 찾을 때 보여줄 후보 수. 너무 많으면 고르기가 일이 된다. */
export const MAX_CANDIDATES = 5;

export type LookupFailureReason =
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "failed";

export type LookupResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: LookupFailureReason; message: string };

async function requestJson(url: string): Promise<LookupResult<unknown>> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent(),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 서지 정보는 잘 바뀌지 않지만, 사용자가 방금 고친 것을 다시 볼 수도 있다.
      cache: "no-store",
    });
  } catch (error) {
    console.error(
      "[ThreadMark] Crossref 요청 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return {
      ok: false,
      reason: "unavailable",
      message: "서지 정보 서비스에 닿지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      reason: "not_found",
      message: "그 DOI로 등록된 논문을 찾지 못했습니다.",
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!response.ok) {
    console.error("[ThreadMark] Crossref 응답 오류:", response.status);

    return {
      ok: false,
      reason: "failed",
      message: "서지 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  try {
    return { ok: true, value: await response.json() };
  } catch {
    return {
      ok: false,
      reason: "failed",
      message: "서지 정보를 읽지 못했습니다.",
    };
  }
}

/** DOI 하나로 찾는다. 있거나 없거나 둘 중 하나다. */
export async function lookupByDoi(
  doi: string,
): Promise<LookupResult<ImportedPaper>> {
  const result = await requestJson(doiLookupUrl(doi));

  if (!result.ok) {
    return result;
  }

  const body = result.value as { message?: unknown };
  const paper = mapCrossrefWork(body?.message);

  if (paper === null) {
    return {
      ok: false,
      reason: "not_found",
      message: "그 DOI로 쓸 만한 서지 정보를 찾지 못했습니다.",
    };
  }

  return { ok: true, value: paper };
}

/**
 * 제목으로 찾는다. 후보를 여럿 돌려준다.
 *
 * Crossref의 제목 검색은 **거르는 것이 아니라 비슷한 순서로 주는 것**이다.
 * 맨 위가 맞는다는 보장이 없어서, 하나를 골라 바로 채우지 않는다.
 *
 * **한글 제목으로는 아예 나오지 않는다.** 적게 나오는 것이 아니라 0건이다.
 * 국내 논문이 영문 제목과 로마자 저자명으로 등록되어 있기 때문이다.
 * (2026-09-23에 query, query.title, query.bibliographic 모두 확인)
 *
 * 그래서 한글이 섞이면 보내지 않고 바로 알려준다. 보내봐야 빈손으로 돌아오고,
 * 그동안 사용자는 되는 줄 알고 기다린다. 국내 논문은 PDF에서 DOI를 찾는
 * 쪽이 맞고, 그 길이 잘 듣는다.
 */
export async function searchByTitle(
  query: string,
): Promise<LookupResult<ImportCandidate[]>> {
  if (containsHangul(query)) {
    return {
      ok: false,
      reason: "not_found",
      message:
        "제목 검색은 한글로는 찾지 못합니다. 국내 논문도 영문 제목으로 등록되어 있기 때문입니다. PDF에서 찾기를 쓰거나, DOI 또는 영문 제목으로 해보세요.",
    };
  }

  const result = await requestJson(titleSearchUrl(query, MAX_CANDIDATES));

  if (!result.ok) {
    return result;
  }

  const body = result.value as { message?: { items?: unknown } };
  const items = body?.message?.items;

  const candidates = (Array.isArray(items) ? items : []).flatMap((item) => {
    const paper = mapCrossrefWork(item);

    return paper === null
      ? []
      : [{ ...paper, summary: summarizeCandidate(paper) } satisfies ImportCandidate];
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "not_found",
      message:
        "비슷한 논문을 찾지 못했습니다. 영문 제목이나 DOI로 해보세요.",
    };
  }

  return { ok: true, value: candidates };
}
