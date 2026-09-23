/**
 * 논문 서지 정보의 말과 모양. (설계 문서 8.1절)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/**
 * 저자 한 사람.
 *
 * 이름을 통짜 문자열로 담지 않는 이유가 참고문헌에 있다.
 * APA 7판은 영문 저자를 `Kim, D.`처럼 성과 이름을 갈라 적는다.
 * "Daesoo Kim"만 들고 있으면 어디까지가 성인지 알 방법이 없다.
 * 사람 이름은 규칙으로 가를 수 없다. 넣을 때 갈라 받아야 한다.
 *
 * `given`이 없으면 그 이름을 그대로 쓴다. 기관 저자와 외자 이름이 그렇다.
 * 기관을 위한 자리를 따로 두지 않는다. "이름을 가를 수 없는 저자"는
 * 기관이든 사람이든 다루는 방법이 같다.
 */
export type PaperAuthor = {
  family: string;
  given?: string;
};

export const MAX_AUTHORS = 100;
export const MAX_AUTHOR_NAME_LENGTH = 200;
export const MAX_KEYWORDS = 50;
export const MAX_KEYWORD_LENGTH = 100;
export const MAX_JOURNAL_NAME_LENGTH = 300;
export const MAX_ABSTRACT_LENGTH = 10000;
export const MAX_DOI_LENGTH = 300;
export const MAX_CITATION_LENGTH = 2000;

/** 사람이 쓴 글에 붙는 연도의 범위. 위아래로 넉넉히 두되 오타는 거른다. */
export const MIN_PUBLICATION_YEAR = 1000;
export const MAX_PUBLICATION_YEAR = 2200;

/**
 * 원문 언어.
 *
 * 참고문헌 표기가 이 값에 따라 갈린다. 지금 쓰는 둘만 둔다.
 * 다른 말로 쓰인 논문을 담게 되면 그때 늘린다.
 */
export const PAPER_LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "영어" },
] as const;

export type PaperLanguageCode = (typeof PAPER_LANGUAGES)[number]["code"];

export function isPaperLanguage(value: unknown): value is PaperLanguageCode {
  return (
    typeof value === "string" &&
    PAPER_LANGUAGES.some((language) => language.code === value)
  );
}

export function getPaperLanguageLabel(code: string): string {
  return (
    PAPER_LANGUAGES.find((language) => language.code === code)?.label ?? code
  );
}

/**
 * 한국어 표기를 쓸지 정한다.
 *
 * 모르면 영문 표기로 간다. 한국어 표기는 이름을 가르지 않고 그대로 적는데,
 * 영문 이름에 그것을 적용하면 `Daesoo Kim (2024)`처럼 APA가 아닌 것이 나온다.
 * 반대로 한국어 이름에 영문 표기를 적용하면 `김, 대.`가 되어 더 나쁘다.
 * 둘 다 틀릴 수 있다면 고칠 엄두가 나는 쪽으로 틀리는 편이 낫다.
 */
export function usesKoreanCitationStyle(language: string | null): boolean {
  return typeof language === "string" && language.toLowerCase().startsWith("ko");
}
