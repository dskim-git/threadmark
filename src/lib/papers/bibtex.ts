/**
 * BibTeX를 읽는다. (설계 문서 8.5절의 "BibTeX 붙여넣기")
 *
 * 학술지 사이트와 Google Scholar가 내려주는 형식이다. 서지 정보가 이미
 * 조각으로 나뉘어 있어서, 우리가 글에서 읽어낼 것이 없다.
 *
 * 밖으로 나가는 요청이 없다. 붙여넣은 글을 읽기만 한다. 공짜이고 즉시 된다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import type { ImportedPaper } from "./crossref.ts";
import { MAX_ABSTRACT_LENGTH, MAX_AUTHORS, type PaperAuthor } from "./types.ts";

/**
 * 값을 감싼 중괄호나 따옴표를 벗긴다.
 *
 * BibTeX는 `{...}`, `"..."`, 그리고 숫자는 맨몸으로 적는다.
 * 안쪽에 중괄호가 또 있을 수 있다. `{The {PISA} Study}`가 그런 예인데,
 * 안쪽 것은 "대문자를 지켜라"는 뜻이라 지우고 글만 남긴다.
 */
function unwrap(value: string): string {
  let text = value.trim();

  // 바깥 껍질을 한 겹만 벗긴다. 짝이 맞을 때만.
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    text = text.slice(1, -1);
  }

  // 남은 중괄호는 서식 표시다. 글에는 필요 없다.
  return text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * 저자 하나를 읽는다.
 *
 * BibTeX에는 **정해진 규칙이 있다.** 그래서 여기서는 이름을 가른다.
 * 사용자가 직접 적은 글에서 가르지 않기로 한 것(schema.ts)과 다른 이유는,
 * 거기에는 규칙이 없고 여기에는 있기 때문이다. 추측과 규칙은 다르다.
 *
 *   "Zan, Rosetta"    쉼표가 있으면 앞이 성이다
 *   "Rosetta Zan"     쉼표가 없으면 마지막 낱말이 성이다
 *   "{한국교육과정평가원}"  중괄호로 감싸면 통째로 하나다
 *
 * 한글 이름은 보통 `{김대수}`처럼 통째로 오거나 공백 없이 온다.
 * 공백이 없으면 마지막 낱말이 곧 전체라, 가르지 않은 것과 같은 결과가 된다.
 */
export function parseBibtexAuthor(raw: string): PaperAuthor | null {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return null;
  }

  // 중괄호로 통째로 감싼 것은 기관 이름이다. 가르지 않는다.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const family = unwrap(trimmed);

    return family.length > 0 ? { family } : null;
  }

  const cleaned = unwrap(trimmed);

  if (cleaned.length === 0) {
    return null;
  }

  const comma = cleaned.indexOf(",");

  if (comma !== -1) {
    const family = cleaned.slice(0, comma).trim();
    const given = cleaned.slice(comma + 1).trim();

    if (family.length === 0) {
      return { family: cleaned };
    }

    return given.length > 0 ? { family, given } : { family };
  }

  const parts = cleaned.split(/\s+/);

  if (parts.length === 1) {
    return { family: cleaned };
  }

  const family = parts[parts.length - 1] as string;
  const given = parts.slice(0, -1).join(" ");

  return { family, given };
}

/** `Zan, Rosetta and Brown, Laurinda` 를 사람마다 나눈다. */
export function splitBibtexAuthors(value: string): PaperAuthor[] {
  return value
    // 낱말로서의 and만 나누는 기준이다. `Anderson`의 and를 자르면 안 된다.
    .split(/\s+and\s+/i)
    .map((part) => parseBibtexAuthor(part))
    .flatMap((author) => (author === null ? [] : [author]))
    .slice(0, MAX_AUTHORS);
}

/**
 * 항목 하나에서 `열쇠 = 값` 쌍을 모두 읽는다.
 *
 * 값 안에 중괄호와 쉼표가 들어 있어서 쉼표로 그냥 나눌 수 없다.
 * `title = {A, B}`를 쉼표로 자르면 제목이 두 동강 난다.
 * 그래서 중괄호 깊이를 세면서 한 글자씩 읽는다.
 */
function readFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();

  let depth = 0;
  let inQuote = false;
  let current = "";

  const flush = () => {
    const equals = current.indexOf("=");

    if (equals !== -1) {
      const key = current.slice(0, equals).trim().toLowerCase();
      const value = current.slice(equals + 1).trim();

      if (key.length > 0 && !fields.has(key)) {
        fields.set(key, value);
      }
    }

    current = "";
  };

  for (const character of body) {
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    } else if (character === '"' && depth === 0) {
      inQuote = !inQuote;
    }

    // 맨 바깥의 쉼표만 항목을 나눈다.
    if (character === "," && depth === 0 && !inQuote) {
      flush();
      continue;
    }

    current += character;
  }

  flush();

  return fields;
}

function field(fields: Map<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const raw = fields.get(name);

    if (raw !== undefined) {
      const value = unwrap(raw);

      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

/** BibTeX처럼 생겼는지. 붙여넣은 글의 종류를 가리는 데 쓴다. */
export function looksLikeBibtex(text: string): boolean {
  return /@[a-z]+\s*\{/i.test(text);
}

/**
 * 붙여넣은 BibTeX에서 첫 항목을 읽는다.
 *
 * 여러 항목이 있어도 첫 번째만 쓴다. 이 화면은 논문 하나의 서지 정보를
 * 적는 자리이고, 여러 편을 한 번에 등록하는 기능은 아직 없다.
 * 나중에 만들게 되면 여기서 목록을 돌려주면 된다.
 */
export function parseBibtex(text: string): ImportedPaper | null {
  const start = text.search(/@[a-z]+\s*\{/i);

  if (start === -1) {
    return null;
  }

  const open = text.indexOf("{", start);

  if (open === -1) {
    return null;
  }

  // 짝이 맞는 닫는 괄호를 찾는다. 안쪽에도 괄호가 있어서 세어야 한다.
  let depth = 0;
  let end = -1;

  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") {
      depth += 1;
    } else if (text[i] === "}") {
      depth -= 1;

      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  /*
    닫는 괄호가 없으면 잘려서 붙여넣어진 것이다. 끝까지를 항목으로 본다.
    반쯤 붙여넣은 것도 앞부분은 쓸모가 있다. 아무것도 안 주는 것보다 낫다.
  */
  const body = text.slice(open + 1, end === -1 ? text.length : end);

  // 첫 쉼표까지는 인용 열쇠다. 우리가 쓰지 않는다.
  const firstComma = body.indexOf(",");
  const fields = readFields(
    firstComma === -1 ? "" : body.slice(firstComma + 1),
  );

  const title = field(fields, "title");
  const doi = field(fields, "doi");

  if (title === null && doi === null) {
    return null;
  }

  const authors = fields.has("author")
    ? splitBibtexAuthors(fields.get("author") as string)
    : [];

  const abstract = field(fields, "abstract");

  return {
    title,
    authors,
    publicationYear: readYear(field(fields, "year", "date")),
    journalName: field(fields, "journal", "journaltitle", "booktitle"),
    volume: field(fields, "volume"),
    issue: field(fields, "number", "issue"),
    // BibTeX는 범위를 `113--121`로 적는다. 우리는 붙임표 하나로 담는다.
    pageRange: field(fields, "pages")?.replace(/-{2,}/g, "-") ?? null,
    doi: normalizeDoiValue(doi),
    issn: field(fields, "issn"),
    abstract: abstract ? abstract.slice(0, MAX_ABSTRACT_LENGTH) : null,
    originalLanguage: readLanguage(field(fields, "language", "langid")),
    source: "bibtex",
  };
}

/**
 * 연도를 읽는다.
 *
 * `2006`, `2006-10`, `2006/10/24` 같은 모양이 온다. 앞의 네 자리만 쓴다.
 * 네 자리 수가 없으면 비워 둔다. 틀린 연도보다 빈 연도가 낫다.
 */
export function readYear(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = value.match(/\d{4}/);

  if (match === null) {
    return null;
  }

  const year = Number(match[0]);

  return year >= 1000 && year <= 2200 ? year : null;
}

/** `10.`으로 시작하는 알맹이만 남긴다. 아니면 담지 않는다. */
export function normalizeDoiValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const text = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();

  return text.startsWith("10.") && text.length > 3 ? text : null;
}

/** 우리가 다루는 둘만 받는다. 나머지는 비워 둔다. */
export function readLanguage(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const text = value.trim().toLowerCase();

  if (text.startsWith("ko") || text.includes("korean") || text.includes("한국")) {
    return "ko";
  }

  if (text.startsWith("en") || text.includes("english")) {
    return "en";
  }

  return null;
}
