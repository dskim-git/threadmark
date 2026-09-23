/**
 * Crossref가 돌려준 값을 우리 모양으로 바꾼다. (설계 문서 8.5절)
 *
 * Crossref는 출판사가 직접 등록한 서지 데이터를 돌려주는 곳이다. 무료이고
 * 키가 필요 없다. 무엇보다 **저자를 이미 성과 이름으로 갈라서 준다.**
 * 우리가 담는 모양과 같아서, 글에서 이름을 가르는 추측을 할 필요가 없다.
 *
 * 이 파일에는 네트워크가 없다. 받은 값을 바꾸는 일만 한다.
 * 실제 요청은 crossref-lookup.ts가 한다.
 *
 * 2026-09-23에 실제 응답을 확인하고 만들었다. 확인한 것들:
 *   - title과 container-title은 배열이다. 첫 번째만 쓴다.
 *   - issued.date-parts[0][0]이 발행 연도다.
 *   - ISSN은 배열이고 인쇄본·온라인본이 같이 온다.
 *   - abstract는 없을 때가 많고, 있으면 JATS 태그가 섞여 온다.
 *   - 기관 저자는 given/family 대신 name으로 온다.
 *   - **국내 논문은 영문 제목과 로마자 저자명으로 등록되어 있다.**
 *     한글 제목으로 검색하면 나오지 않고, DOI로 찾으면 로마자 이름이 온다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import {
  MAX_ABSTRACT_LENGTH,
  MAX_AUTHORS,
  type PaperAuthor,
} from "./types.ts";

export const CROSSREF_API = "https://api.crossref.org/works";

/** 가져오기로 채울 값들. 화면이 이것으로 입력란을 채운다. */
export type ImportedPaper = {
  title: string | null;
  authors: PaperAuthor[];
  publicationYear: number | null;
  journalName: string | null;
  volume: string | null;
  issue: string | null;
  pageRange: string | null;
  doi: string | null;
  issn: string | null;
  abstract: string | null;
  originalLanguage: string | null;
  /** 어디서 가져온 값인지. 화면이 출처를 밝히는 데 쓴다. */
  source: "crossref";
};

/** 제목으로 찾았을 때 고르게 할 후보 하나. */
export type ImportCandidate = ImportedPaper & {
  /** 목록에서 한눈에 알아보게 만든 한 줄. */
  summary: string;
};

/**
 * 초록에서 JATS 태그를 걷어낸다.
 *
 * Crossref의 abstract는 `<jats:p>…</jats:p>` 같은 XML로 온다. 그대로 담으면
 * 화면에 태그가 그대로 보인다. 태그만 지우고 글은 손대지 않는다.
 *
 * 태그를 지우고 나면 붙어버리는 말이 생기므로 자리에 공백을 넣고,
 * 늘어난 공백을 다시 줄인다.
 */
export function stripJats(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** 배열로 오는 값에서 쓸 만한 첫 번째를 고른다. */
function firstText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);

      if (text !== null) {
        return text;
      }
    }
  }

  return null;
}

/**
 * 저자 목록을 읽는다.
 *
 * Crossref는 사람 저자를 `{given, family}`로, 기관 저자를 `{name}`으로 준다.
 * 우리 모양에서는 둘 다 `family`에 담긴다. 기관을 위한 자리를 따로 두지
 * 않기로 한 결정이 여기서도 그대로 통한다. (설계 문서 8.1절 주석)
 *
 * `family`도 `name`도 없는 항목은 버린다. 적을 이름이 없는 저자다.
 */
export function readCrossrefAuthors(value: unknown): PaperAuthor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const authors: PaperAuthor[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;

    const family =
      typeof record.family === "string" && record.family.trim().length > 0
        ? record.family.trim()
        : typeof record.name === "string" && record.name.trim().length > 0
          ? record.name.trim()
          : null;

    if (family === null) {
      continue;
    }

    const given =
      typeof record.given === "string" && record.given.trim().length > 0
        ? record.given.trim()
        : null;

    /*
      기관 저자(name으로 온 것)에는 given이 없다. 사람 저자여도 given이
      없는 경우가 있다. 어느 쪽이든 family만 담으면 그대로 적힌다.
    */
    authors.push(given === null ? { family } : { family, given });

    if (authors.length >= MAX_AUTHORS) {
      break;
    }
  }

  return authors;
}

/**
 * 발행 연도를 읽는다.
 *
 * `issued.date-parts`는 `[[2006, 6, 20]]` 모양이다. 바깥 배열이 한 겹 더
 * 있는 것에 주의한다. 연도만 쓰고 월·일은 버린다. APA에 들어가지 않는다.
 *
 * `issued`가 없으면 `published-print`, `published-online` 순으로 본다.
 * 온라인 선공개와 인쇄본 발행이 해를 넘겨 갈리는 논문이 있는데, 그때는
 * 인쇄본 쪽이 인용에 쓰인다.
 */
export function readCrossrefYear(work: Record<string, unknown>): number | null {
  for (const key of ["issued", "published-print", "published-online"]) {
    const entry = work[key];

    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const parts = (entry as Record<string, unknown>)["date-parts"];

    if (!Array.isArray(parts) || !Array.isArray(parts[0])) {
      continue;
    }

    const year = parts[0][0];

    if (typeof year === "number" && Number.isInteger(year)) {
      return year;
    }
  }

  return null;
}

/**
 * Crossref의 work 하나를 우리 모양으로 바꾼다.
 *
 * 알아볼 수 없는 값은 담지 않는다. 비어 있는 것과 틀린 것 중에서는
 * 비어 있는 쪽이 낫다. 틀린 값은 그대로 참고문헌에 실린다.
 */
export function mapCrossrefWork(value: unknown): ImportedPaper | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const work = value as Record<string, unknown>;

  const doi =
    typeof work.DOI === "string" && work.DOI.trim().length > 0
      ? work.DOI.trim().toLowerCase()
      : null;

  const title = firstText(work.title);

  /*
    제목도 DOI도 없으면 쓸 수 없는 응답이다. 이런 값으로 입력란을 채우면
    사용자는 "찾았다"는 말만 보고 빈 칸을 받는다.
  */
  if (title === null && doi === null) {
    return null;
  }

  const abstract =
    typeof work.abstract === "string" ? stripJats(work.abstract) : null;

  return {
    title,
    authors: readCrossrefAuthors(work.author),
    publicationYear: readCrossrefYear(work),
    journalName: firstText(work["container-title"]),
    volume: firstText(work.volume),
    issue: firstText(work.issue),
    pageRange: firstText(work.page),
    doi,
    issn: firstText(work.ISSN),
    abstract:
      abstract && abstract.length > 0
        ? abstract.slice(0, MAX_ABSTRACT_LENGTH)
        : null,
    originalLanguage: readLanguage(work.language),
    source: "crossref",
  };
}

/**
 * 원문 언어를 우리가 아는 값으로 바꾼다.
 *
 * Crossref는 `en`, `ko` 같은 코드를 준다. 우리가 다루는 둘만 받고
 * 나머지는 비워둔다. 모르는 값을 담으면 참고문헌 표기가 영문으로 가는데,
 * 그것이 비워둘 때와 같은 결과다. 굳이 알 수 없는 값을 남기지 않는다.
 */
function readLanguage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const code = value.trim().toLowerCase();

  if (code.startsWith("ko")) {
    return "ko";
  }

  if (code.startsWith("en")) {
    return "en";
  }

  return null;
}

/** 후보 목록에서 한눈에 알아보게 만든 한 줄. */
export function summarizeCandidate(paper: ImportedPaper): string {
  const parts: string[] = [];

  const names = paper.authors
    .slice(0, 2)
    .map((author) => author.family)
    .join(", ");

  if (names.length > 0) {
    parts.push(paper.authors.length > 2 ? `${names} 외` : names);
  }

  if (paper.publicationYear !== null) {
    parts.push(String(paper.publicationYear));
  }

  if (paper.journalName) {
    parts.push(paper.journalName);
  }

  return parts.join(" · ");
}

/**
 * 한글이 섞여 있는지 본다.
 *
 * **Crossref는 한글 제목을 색인하지 않는다.** 적게 나오는 것이 아니라
 * `total: 0`이다. `query`, `query.title`, `query.bibliographic` 어느 쪽으로
 * 물어도 같다. 2026-09-23에 직접 확인했다.
 *
 * 그래서 한글이 섞인 검색어는 보내지 않는다. 보내봐야 빈손으로 돌아오고,
 * 사용자는 기다린 만큼을 잃는다. 못 찾는 것과 못 찾을 수밖에 없는 것은
 * 다르고, 뒤엣것은 미리 말해줄 수 있다.
 *
 * 한글 음절, 낱자, 옛한글 낱자 영역을 모두 본다.
 */
export function containsHangul(text: string): boolean {
  return /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(
    text,
  );
}

/** DOI 하나를 찾는 주소. 이 경로는 select를 받지 않는다. (2026-09-23 확인) */
export function doiLookupUrl(doi: string): string {
  return `${CROSSREF_API}/${encodeURIComponent(doi)}`;
}

/**
 * 제목으로 찾는 주소.
 *
 * `query.bibliographic`은 제목·저자·연도가 섞인 글을 받아 관련도 순으로
 * 돌려준다. 정확히 걸러주는 것이 아니라 **비슷한 것을 순서대로** 준다.
 * 그래서 결과를 그대로 쓰지 않고 사용자가 고르게 해야 한다.
 */
export function titleSearchUrl(query: string, rows: number): string {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(rows),
  });

  return `${CROSSREF_API}?${params.toString()}`;
}
