/**
 * 검색어를 데이터베이스에 넘길 모양으로 바꾼다. (설계 문서 22절 "기본 키워드 검색")
 *
 * 왜 전문 검색(full-text search)이 아니라 글자 포함 검색인가
 *   PostgreSQL의 전문 검색은 말을 토막 내고 어간을 찾아 견준다. 그 사전이
 *   영어에는 있고 **한국어에는 없다.** 사전 없이 돌리면 띄어쓰기로만 토막
 *   나는데, 그러면 `모델링`으로 `수학적모델링`을 찾지 못한다. 반대로 글자
 *   포함 검색은 붙여 쓰든 띄어 쓰든 찾는다.
 *
 *   느리다는 단점이 있다. 색인을 타지 못하고 줄을 하나씩 본다. 개인이 쌓는
 *   자료의 양에서는 문제가 되지 않고, 느려지면 그때 `pg_trgm` 색인을 건다.
 *
 * 왜 이 파일이 따로 있는가
 *   검색어에는 `%`나 `,`처럼 **뜻이 있는 글자**가 섞여 들어온다. 그대로
 *   넘기면 조용히 틀린다. `50%`를 찾으면 `%`가 아무 글자나 되는 표시로
 *   읽혀서 엉뚱한 것이 딸려 나오고, 쉼표가 들어가면 조건 자체가 쪼개진다.
 *   오류가 나지 않고 **결과만 틀리기 때문에** 알아채기 어렵다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/** 한 글자로도 찾는다. `김`이나 `AI`처럼 짧은 말이 실제로 쓰인다. */
export const MIN_SEARCH_LENGTH = 1;

/**
 * 너무 긴 검색어는 자른다. 문단을 통째로 붙여넣는 경우가 있는데,
 * 그런 검색어는 어차피 아무것도 찾지 못하면서 질의만 무거워진다.
 */
export const MAX_SEARCH_LENGTH = 100;

/**
 * 사람이 적은 검색어를 다듬는다.
 *
 * 앞뒤 공백을 떼고, 가운데 여러 칸은 한 칸으로 줄인다. 붙여넣기로 들어오는
 * 줄바꿈과 탭도 같이 정리한다. 찾을 것이 없으면 null이다.
 */
export function normalizeSearchTerm(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);

  return text.length >= MIN_SEARCH_LENGTH ? text : null;
}

/**
 * 글자 포함 검색에 쓸 무늬를 만든다.
 *
 * `%`는 아무 글자나, `_`는 한 글자를 뜻한다. 사람이 적은 `%`는 그 뜻이
 * 아니라 퍼센트 기호이므로 앞에 `\`를 붙여 글자 그대로로 만든다.
 * `\` 자체도 마찬가지다.
 */
export function toLikePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (character) => `\\${character}`);

  return `%${escaped}%`;
}

/**
 * PostgREST의 `or` 조건 한 줄을 만든다.
 *
 * `제목.ilike.무늬,설명.ilike.무늬` 모양이고, **쉼표가 조건을 가르는
 * 표시다.** 검색어에 쉼표가 있으면 거기서 조건이 쪼개져 엉뚱한 열 이름이
 * 생긴다. 그래서 값을 큰따옴표로 감싼다. 감싼 안에서는 `"`와 `\`가 다시
 * 뜻을 가지므로 그 둘만 한 번 더 막는다.
 *
 * 막는 순서가 중요하다. 무늬를 먼저 만들고(`%` 막기) 그다음에 감싼다.
 * 반대로 하면 무늬를 만들며 넣은 `\`가 감싸는 쪽에서 다시 먹혀 사라진다.
 */
export function buildIlikeFilter(
  columns: readonly string[],
  term: string,
): string {
  const pattern = toLikePattern(term);
  const quoted = `"${pattern.replace(/[\\"]/g, (character) => `\\${character}`)}"`;

  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
