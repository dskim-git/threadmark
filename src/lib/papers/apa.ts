/**
 * APA 7판 참고문헌 만들기. (설계 문서 8.1절)
 *
 * 8.1절: "APA 문자열만 저장하지 않는다. 구조화된 메타데이터로 APA를 생성하고
 * 사용자가 수정한 override를 별도로 보관한다."
 *
 * 그래서 이 모듈이 있다. 저장된 조각으로 그때그때 만든다. 표기 규칙이 바뀌거나
 * 저자 이름에 오타를 발견해도 조각만 고치면 모든 참고문헌이 따라온다.
 *
 * 만들어 주는 것과 고쳐 쓰는 것은 다른 일이다. 여기서 만든 것이 어색하면
 * 사용자가 고칠 수 있고, 고친 것은 `citation_override`에 따로 남는다.
 * 다음에 다시 만들어도 고친 것이 덮어써지지 않는다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import {
  usesKoreanCitationStyle,
  type PaperAuthor,
} from "./types.ts";

/**
 * 저자가 21명을 넘으면 앞 19명과 마지막 한 명만 적는다. (APA 7판 §9.8)
 *
 * 20명까지는 모두 적는다. 21명부터 줄인다. 이 경계가 APA가 정한 것이다.
 */
const AUTHORS_SHOWN_WHEN_TRUNCATED = 19;
const AUTHOR_TRUNCATION_THRESHOLD = 20;

export type CitationInput = {
  authors: readonly PaperAuthor[];
  /** 발행 연도. 모르면 null. APA는 그 경우 `n.d.`로 적는다. */
  year: number | null;
  title: string;
  journalName: string | null;
  volume: string | null;
  issue: string | null;
  pageRange: string | null;
  /** `10.`으로 시작하는 알맹이. 주소 형태가 아니다. */
  doi: string | null;
  /** DOI가 없을 때 대신 적을 원문 주소. */
  url: string | null;
  /** 원문 언어. 한국어면 이름을 가르지 않는다. */
  language: string | null;
};

/**
 * 이름을 머리글자로 줄인다. `Daesoo` -> `D.`
 *
 * 띄어쓰기와 붙임표를 지킨다. APA는 `Dae Soo`를 `D. S.`로,
 * `Dae-Soo`를 `D.-S.`로 적는다. 붙임표를 공백으로 바꿔버리면 다른 이름이 된다.
 */
export function toInitials(given: string): string {
  const trimmed = given.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed
    .split(/\s+/)
    .map((part) =>
      part
        .split("-")
        .map((piece) => {
          const first = Array.from(piece)[0];

          return first ? `${first.toUpperCase()}.` : "";
        })
        .filter((piece) => piece.length > 0)
        .join("-"),
    )
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * 저자 한 사람을 적는다.
 *
 * 한국어 표기는 이름을 가르지 않고 그대로 붙여 적는다. `김대수`.
 * 영문 표기는 성을 앞으로 보내고 이름을 머리글자로 줄인다. `Kim, D.`
 *
 * `given`이 없으면 어느 쪽이든 `family`를 그대로 쓴다.
 * 기관 이름을 `한국교육과정평가원, 한.`으로 적을 수는 없다.
 */
export function formatAuthor(author: PaperAuthor, korean: boolean): string {
  const family = author.family.trim();
  const given = author.given?.trim() ?? "";

  if (given.length === 0) {
    return family;
  }

  if (korean) {
    return `${family}${given}`;
  }

  const initials = toInitials(given);

  return initials.length > 0 ? `${family}, ${initials}` : family;
}

/**
 * 저자 목록을 적는다.
 *
 * 영문은 마지막 저자 앞에 `&`를 넣는다. 한국어 표기에는 `&`를 쓰지 않고
 * 쉼표로만 잇는다. 국내 학술지 관행이 그렇다.
 */
export function formatAuthorList(
  authors: readonly PaperAuthor[],
  korean: boolean,
): string {
  const names = authors
    .filter((author) => author.family.trim().length > 0)
    .map((author) => formatAuthor(author, korean));

  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0] as string;
  }

  /*
    21명 이상이면 앞 19명을 적고 줄임표를 둔 뒤 마지막 한 명을 적는다.
    이때는 `&`를 쓰지 않는다. APA 7판이 그렇게 정했다.
  */
  if (names.length > AUTHOR_TRUNCATION_THRESHOLD) {
    const shown = names.slice(0, AUTHORS_SHOWN_WHEN_TRUNCATED);
    const last = names[names.length - 1] as string;

    return `${shown.join(", ")}, . . . ${last}`;
  }

  const last = names[names.length - 1] as string;
  const rest = names.slice(0, -1);

  if (korean) {
    return names.join(", ");
  }

  if (rest.length === 1) {
    return `${rest[0]}, & ${last}`;
  }

  return `${rest.join(", ")}, & ${last}`;
}

/**
 * 쪽 범위의 붙임표를 반각 대시로 바꾼다. `45-67` -> `45–67`
 *
 * APA는 범위에 en dash(–)를 쓴다. 자판으로는 치기 어려워 대부분 `-`로 적는데,
 * 그것 하나 때문에 사람이 손보게 두지 않는다.
 *
 * 범위로 보일 때만 바꾼다. `e012345`처럼 붙임표가 없는 값은 건드리지 않고,
 * 공백이 섞인 값도 그대로 둔다. 우리가 모양을 확신할 수 없는 값이다.
 */
export function normalizePageRange(pageRange: string): string {
  const trimmed = pageRange.trim();

  return /^\S+-\S+$/.test(trimmed) ? trimmed.replace("-", "–") : trimmed;
}

/** `10.1234/abcd` -> `https://doi.org/10.1234/abcd` */
export function toDoiUrl(doi: string): string {
  return `https://doi.org/${doi.trim()}`;
}

/**
 * 참고문헌 한 줄을 만든다.
 *
 * 영문 형태 (APA 7판 §10.1)
 *   Kim, D., & Lee, S. (2024). 제목. 학술지명, 12(3), 45–67. https://doi.org/…
 *
 * 한국어 형태
 *   김대수, 이서연 (2024). 제목. 학술지명, 12(3), 45-67.
 *
 * 기울임은 넣지 않는다. 글자만 돌려주므로 학술지명과 권 번호를 기울여 쓰는 일은
 * 붙여넣은 곳에서 해야 한다. 서식까지 담으면 붙여넣는 곳마다 다르게 깨진다.
 *
 * 제목의 대소문자는 건드리지 않는다. APA는 문장형 대문자를 요구하지만,
 * 고유명사와 약어를 우리가 가려낼 수 없다. 잘못 바꾼 제목은 사람이 알아채기
 * 어렵고, 알아채도 매번 고쳐야 한다. 적어준 그대로 둔다.
 */
export function formatApaCitation(input: CitationInput): string {
  const korean = usesKoreanCitationStyle(input.language);

  const parts: string[] = [];

  const authors = formatAuthorList(input.authors, korean);
  const year = input.year === null ? "n.d." : String(input.year);

  /*
    저자를 모르면 제목을 앞으로 보낸다. APA 7판 §9.12가 그렇게 한다.
    "저자 없음"이라고 적지 않는다.
  */
  const title = input.title.trim();

  if (authors.length > 0) {
    parts.push(`${authors} (${year}).`);
    parts.push(endWithPeriod(title));
  } else {
    parts.push(endWithPeriod(title));
    parts.push(`(${year}).`);
  }

  // 학술지명, 권(호), 쪽은 한 덩어리로 묶어 쉼표로 잇는다.
  const journalParts: string[] = [];

  const journalName = input.journalName?.trim() ?? "";

  if (journalName.length > 0) {
    journalParts.push(journalName);
  }

  const volume = input.volume?.trim() ?? "";
  const issue = input.issue?.trim() ?? "";

  if (volume.length > 0) {
    journalParts.push(issue.length > 0 ? `${volume}(${issue})` : volume);
  } else if (issue.length > 0) {
    // 권 없이 호만 있는 학술지가 있다. 괄호 없이 적는다.
    journalParts.push(`(${issue})`);
  }

  const pageRange = input.pageRange?.trim() ?? "";

  if (pageRange.length > 0) {
    journalParts.push(korean ? pageRange : normalizePageRange(pageRange));
  }

  if (journalParts.length > 0) {
    parts.push(endWithPeriod(journalParts.join(", ")));
  }

  /*
    DOI가 있으면 DOI를 적는다. 없으면 원문 주소를 적는다. 둘 다 있으면 DOI다.
    DOI는 주소가 바뀌어도 따라가는 값이라 더 오래 간다.
    주소 뒤에는 마침표를 찍지 않는다. 마침표까지 주소로 읽히는 일이 있다.
  */
  const doi = input.doi?.trim() ?? "";
  const url = input.url?.trim() ?? "";

  if (doi.length > 0) {
    parts.push(toDoiUrl(doi));
  } else if (url.length > 0) {
    parts.push(url);
  }

  return parts.join(" ");
}

/**
 * 마침표로 끝나게 한다.
 *
 * 이미 `?`나 `!`로 끝나면 그대로 둔다. `무엇이 문제인가?.`가 되지 않게 한다.
 */
function endWithPeriod(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * 화면에 보여줄 참고문헌을 고른다.
 *
 * 사람이 고쳐 쓴 것이 있으면 그것을 쓴다. 없으면 만들어 쓴다.
 * 어느 쪽인지를 함께 돌려준다. 화면이 "직접 고친 참고문헌입니다"를
 * 보여줄 수 있어야, 왜 자동 생성과 다른지 나중에 알 수 있다.
 */
export function resolveCitation(
  input: CitationInput,
  override: string | null,
): { text: string; edited: boolean } {
  const trimmed = override?.trim() ?? "";

  if (trimmed.length > 0) {
    return { text: trimmed, edited: true };
  }

  return { text: formatApaCitation(input), edited: false };
}
