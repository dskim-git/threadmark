/**
 * RIS를 읽는다. (설계 문서 8.5절의 "RIS 가져오기")
 *
 * EndNote·RefWorks·DBpia·RISS가 내려주는 형식이다. 국내 학술지 사이트가
 * 많이 쓴다. BibTeX와 달리 한 줄에 한 항목씩 적는 단순한 모양이다.
 *
 * 밖으로 나가는 요청이 없다. 붙여넣은 글을 읽기만 한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import { normalizeDoiValue, readLanguage, readYear } from "./bibtex.ts";
import type { ImportedPaper } from "./crossref.ts";
import { MAX_ABSTRACT_LENGTH, MAX_AUTHORS, type PaperAuthor } from "./types.ts";

/**
 * RIS 한 줄의 모양.
 *
 *   TY  - JOUR
 *   AU  - Zan, Rosetta
 *
 * 두 글자 태그, 공백, 붙임표, 공백, 값이다. 만드는 곳마다 공백 수가 달라서
 * 느슨하게 받는다. 붙임표가 없는 파일도 있다.
 */
const RIS_LINE = /^([A-Z][A-Z0-9])\s{0,2}-?\s*(.*)$/;

/** RIS처럼 생겼는지. 붙여넣은 글의 종류를 가리는 데 쓴다. */
export function looksLikeRis(text: string): boolean {
  return /^\s*TY\s{0,2}-\s*\S/m.test(text);
}

/**
 * 줄을 태그별로 모은다.
 *
 * 같은 태그가 여러 번 올 수 있다. 저자(AU)와 키워드(KW)가 그렇다.
 * 그래서 값을 덮어쓰지 않고 쌓는다.
 *
 * 태그 없이 들여 쓴 줄은 앞 줄의 이어짐이다. 초록이 길면 그렇게 온다.
 * 이어 붙이지 않으면 초록이 첫 줄만 남는다.
 */
function readTags(text: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  let lastTag: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(RIS_LINE);

    if (match === null) {
      // 앞 줄의 이어짐. 공백 하나로 잇는다.
      if (lastTag !== null) {
        const values = tags.get(lastTag);
        const last = values?.[values.length - 1];

        if (values && last !== undefined) {
          values[values.length - 1] = `${last} ${line.trim()}`.trim();
        }
      }

      continue;
    }

    const tag = match[1] as string;
    const value = (match[2] as string).trim();

    // ER은 항목의 끝이다. 여러 편이 붙어 있으면 첫 편만 읽는다.
    if (tag === "ER") {
      break;
    }

    const values = tags.get(tag) ?? [];

    values.push(value);
    tags.set(tag, values);
    lastTag = tag;
  }

  return tags;
}

function first(tags: Map<string, string[]>, ...names: string[]): string | null {
  for (const name of names) {
    const value = tags.get(name)?.[0]?.trim();

    if (value !== undefined && value.length > 0) {
      return value;
    }
  }

  return null;
}

/**
 * 저자를 읽는다.
 *
 * RIS는 `성, 이름` 으로 적는 것이 규칙이다. 쉼표가 없으면 가르지 않는다.
 * BibTeX와 달리 "마지막 낱말이 성"이라는 규칙이 없기 때문이다.
 * 규칙이 없는 곳에서는 추측하지 않는다. 가르지 않은 이름은 그대로 적히고,
 * 틀렸다면 사람이 보고 알아챌 수 있다.
 */
export function parseRisAuthor(raw: string): PaperAuthor | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");

  if (cleaned.length === 0) {
    return null;
  }

  const comma = cleaned.indexOf(",");

  if (comma === -1) {
    return { family: cleaned };
  }

  const family = cleaned.slice(0, comma).trim();
  const given = cleaned.slice(comma + 1).trim();

  if (family.length === 0) {
    return { family: cleaned.replace(/^,\s*/, "").trim() };
  }

  return given.length > 0 ? { family, given } : { family };
}

/**
 * 붙여넣은 RIS에서 첫 항목을 읽는다.
 *
 * 여러 편이 붙어 있으면 첫 편만 쓴다. BibTeX와 같은 이유다.
 */
export function parseRis(text: string): ImportedPaper | null {
  if (!looksLikeRis(text)) {
    return null;
  }

  const tags = readTags(text);

  const title = first(tags, "TI", "T1", "CT");
  const doi = normalizeDoiValue(first(tags, "DO", "DI"));

  if (title === null && doi === null) {
    return null;
  }

  const authors = (tags.get("AU") ?? tags.get("A1") ?? [])
    .map((value) => parseRisAuthor(value))
    .flatMap((author) => (author === null ? [] : [author]))
    .slice(0, MAX_AUTHORS);

  /*
    쪽은 시작(SP)과 끝(EP)이 따로 온다. 둘 다 있으면 범위로 잇고,
    시작만 있으면 그것만 적는다. 온라인 전용 논문은 끝쪽이 없다.
  */
  const startPage = first(tags, "SP");
  const endPage = first(tags, "EP");

  const pageRange =
    startPage !== null && endPage !== null
      ? `${startPage}-${endPage}`
      : startPage;

  const abstract = first(tags, "AB", "N2");

  return {
    title,
    authors,
    publicationYear: readYear(first(tags, "PY", "Y1", "DA")),
    // 학술지명은 만드는 곳마다 다른 태그를 쓴다. 흔한 순서대로 본다.
    journalName: first(tags, "JO", "JF", "T2", "JA"),
    volume: first(tags, "VL"),
    issue: first(tags, "IS"),
    pageRange,
    doi,
    issn: first(tags, "SN"),
    abstract: abstract ? abstract.slice(0, MAX_ABSTRACT_LENGTH) : null,
    originalLanguage: readLanguage(first(tags, "LA")),
    source: "ris",
  };
}
