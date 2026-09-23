/**
 * 논문 서지 정보 입력 검증. (설계 문서 8.1절)
 *
 * 데이터베이스 제약조건과 같은 규칙을 여기서도 확인한다.
 * 데이터베이스가 막아주더라도, 사용자에게는 무엇이 빠졌는지 알려주는 문구가 필요하다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import {
  MAX_ABSTRACT_LENGTH,
  MAX_AUTHORS,
  MAX_AUTHOR_NAME_LENGTH,
  MAX_CITATION_LENGTH,
  MAX_DOI_LENGTH,
  MAX_JOURNAL_NAME_LENGTH,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_PUBLICATION_YEAR,
  MIN_PUBLICATION_YEAR,
  PAPER_LANGUAGES,
  type PaperAuthor,
} from "./types.ts";

/**
 * 적어 넣은 저자 목록을 읽는다.
 *
 * 한 줄에 한 사람. 쉼표가 있으면 앞이 성, 뒤가 이름이다.
 *
 *   Kim, Daesoo         -> { family: "Kim", given: "Daesoo" }
 *   김대수               -> { family: "김대수" }
 *   한국교육과정평가원    -> { family: "한국교육과정평가원" }
 *
 * 쉼표가 없으면 가르지 않는다. 추측해서 가르면 틀린다. `Daesoo Kim`의 성이
 * 앞인지 뒤인지 우리가 알 방법이 없고, 기관 이름은 애초에 가를 것이 없다.
 * 가르지 못한 이름은 참고문헌에 그대로 적힌다. 그것이 틀린 경우에도
 * 사용자가 보면 바로 알아챌 수 있다. 잘못 갈라놓은 이름은 알아채기 어렵다.
 *
 * 쉼표가 둘 이상이면 첫 번째만 쓴다. `Kim, Daesoo, Jr.`의 뒷부분은 이름에 붙는다.
 */
export function parseAuthorsInput(value: string): PaperAuthor[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const comma = line.indexOf(",");

      if (comma === -1) {
        return { family: line };
      }

      const family = line.slice(0, comma).trim();
      const given = line.slice(comma + 1).trim();

      if (family.length === 0) {
        // 쉼표로 시작하는 줄. 가를 수 없으니 통째로 둔다.
        return { family: line.replace(/^,\s*/, "").trim() };
      }

      return given.length > 0 ? { family, given } : { family };
    })
    .filter((author) => author.family.length > 0);
}

/**
 * 저자 목록을 jsonb 칸에 담을 모양으로 바꾼다.
 *
 * `given`이 없는 저자는 그 열쇠를 **빼고** 담는다. 값이 `undefined`인 채로
 * 두지 않는다. JSON에는 `undefined`가 없어서, 그대로 보내면 어떤 경로에서는
 * `null`이 되고 어떤 경로에서는 열쇠가 사라진다. 데이터베이스의 모양 검사는
 * `given`이 있다면 문자열이기를 요구하므로, `null`이 들어가면 거부당한다.
 *
 * 열쇠를 빼는 것과 빈 값을 넣는 것은 다르다. 여기서는 빼는 쪽이다.
 */
export function toAuthorsJson(
  authors: readonly PaperAuthor[],
): Record<string, string>[] {
  return authors.map((author) => {
    const given = author.given?.trim() ?? "";
    const entry: Record<string, string> = { family: author.family };

    if (given.length > 0) {
      entry.given = given;
    }

    return entry;
  });
}

/** 저장된 저자 목록을 다시 입력란에 넣을 수 있는 글로 만든다. */
export function formatAuthorsInput(
  authors: readonly PaperAuthor[],
): string {
  return authors
    .map((author) =>
      author.given && author.given.trim().length > 0
        ? `${author.family}, ${author.given}`
        : author.family,
    )
    .join("\n");
}

/**
 * DOI를 알맹이만 남긴다.
 *
 * 사람들은 DOI를 여러 모양으로 복사해 온다. 전부 같은 값을 가리킨다.
 *
 *   https://doi.org/10.1234/abcd
 *   doi:10.1234/abcd
 *   10.1234/abcd
 *
 * 다른 모양으로 담아 두면 같은 논문을 두 번 등록했는지 찾을 수 없다.
 * 보여줄 때 주소를 다시 만들면 되므로, 담을 때는 알맹이만 남긴다.
 *
 * 소문자로 바꾼다. DOI는 대소문자를 가리지 않는 값이라 이렇게 해야 견줄 수 있다.
 *
 * `10.`으로 시작하지 않으면 DOI가 아니다. 그 경우 null을 돌려준다.
 * 모르면 거부한다. 틀린 값을 담아두면 나중에 그것이 DOI인 줄 알고 주소를 만든다.
 */
export function normalizeDoi(value: string): string | null {
  let text = value.trim();

  if (text.length === 0) {
    return null;
  }

  // 주소 형태의 앞부분을 떼어낸다.
  text = text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  // `doi:` 또는 `DOI: ` 형태의 앞머리를 떼어낸다.
  text = text.replace(/^doi:\s*/i, "");

  text = text.trim().toLowerCase();

  if (!text.startsWith("10.")) {
    return null;
  }

  return text.length <= MAX_DOI_LENGTH ? text : null;
}

/**
 * 키워드를 읽는다. 쉼표로 나눈다.
 *
 * 줄바꿈도 나누는 기준으로 본다. 논문 초록에서 키워드를 그대로 복사해 오면
 * 줄이 섞여 들어오는 일이 잦다.
 */
export function parseKeywordsInput(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(/[,\n\r]+/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && keyword.length <= MAX_KEYWORD_LENGTH)
    // 같은 키워드를 두 번 담지 않는다.
    .filter((keyword) => {
      const key = keyword.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .slice(0, MAX_KEYWORDS);
}

function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label}은(는) ${max}자를 넘을 수 없습니다.`)
    .transform((value) => (value.length > 0 ? value : null));
}

const languageCodes = PAPER_LANGUAGES.map((language) => language.code);

export const paperProfileSchema = z.object({
  authors: z
    .array(
      z.object({
        family: z
          .string()
          .trim()
          .min(1)
          .max(MAX_AUTHOR_NAME_LENGTH, "저자 이름이 너무 깁니다."),
        given: z
          .string()
          .trim()
          .max(MAX_AUTHOR_NAME_LENGTH, "저자 이름이 너무 깁니다.")
          .optional(),
      }),
    )
    .max(MAX_AUTHORS, `저자는 ${MAX_AUTHORS}명까지 담을 수 있습니다.`),

  /*
    연도는 비워둘 수 있다. 아직 게재되지 않은 논문이나 연도를 모르는 자료가 있다.
    APA는 그 경우 `n.d.`로 적는다. 비어 있다는 것과 잘못 적은 것은 다르다.
  */
  publicationYear: z
    .number()
    .int("발행 연도는 숫자로 적어 주세요.")
    .min(MIN_PUBLICATION_YEAR, "발행 연도를 확인해 주세요.")
    .max(MAX_PUBLICATION_YEAR, "발행 연도를 확인해 주세요.")
    .nullable(),

  journalName: optionalText(MAX_JOURNAL_NAME_LENGTH, "학술지명"),
  volume: optionalText(50, "권"),
  issue: optionalText(50, "호"),
  pageRange: optionalText(50, "쪽"),

  /*
    DOI는 모양을 확인한다. 다른 값들과 달리 "적힌 그대로 담기"가 아니라
    "DOI인지 확인하고 담기"다. 주소를 만들어 여는 데 쓰이기 때문이다.
  */
  doi: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? normalizeDoi(value) : null))
    .nullable(),

  issn: optionalText(20, "ISSN"),
  abstract: optionalText(MAX_ABSTRACT_LENGTH, "초록"),

  keywords: z
    .array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH))
    .max(MAX_KEYWORDS, `키워드는 ${MAX_KEYWORDS}개까지 담을 수 있습니다.`),

  originalLanguage: z
    .enum(languageCodes as [string, ...string[]])
    .nullable()
    .catch(null),

  /** 사람이 고쳐 쓴 참고문헌. 비어 있으면 만들어 쓴다. */
  citationOverride: optionalText(MAX_CITATION_LENGTH, "참고문헌"),
});

export type PaperProfileInput = z.infer<typeof paperProfileSchema>;

/**
 * 폼에서 받은 값을 스키마가 읽을 수 있는 모양으로 바꾼다.
 *
 * 폼은 모든 값을 글자로 보낸다. 연도만 숫자로 바꾸면 되는데, 비어 있는 것과
 * `0`을 구분해야 한다. 빈 칸은 "모른다"이지 "0년"이 아니다.
 */
export function readPaperProfileForm(values: {
  authors: string;
  publicationYear: string;
  journalName: string;
  volume: string;
  issue: string;
  pageRange: string;
  doi: string;
  issn: string;
  abstract: string;
  keywords: string;
  originalLanguage: string;
  citationOverride: string;
}) {
  const year = values.publicationYear.trim();

  return paperProfileSchema.safeParse({
    authors: parseAuthorsInput(values.authors),
    publicationYear: year.length > 0 ? Number(year) : null,
    journalName: values.journalName,
    volume: values.volume,
    issue: values.issue,
    pageRange: values.pageRange,
    doi: values.doi,
    issn: values.issn,
    abstract: values.abstract,
    keywords: parseKeywordsInput(values.keywords),
    originalLanguage:
      values.originalLanguage.trim().length > 0
        ? values.originalLanguage.trim()
        : null,
    citationOverride: values.citationOverride,
  });
}

/**
 * DOI를 적었는데 알아볼 수 없는 경우를 가린다.
 *
 * 스키마는 알아볼 수 없는 DOI를 null로 바꾼다. 그대로 두면 사용자는 적었는데
 * 조용히 사라진 것을 보게 된다. 무엇이 왜 안 담겼는지 알려줘야 한다.
 */
export function doiWasRejected(raw: string): boolean {
  return raw.trim().length > 0 && normalizeDoi(raw) === null;
}
