/**
 * 물음에서 찾을 낱말을 뽑는다. (설계 문서 19절)
 *
 * 19절의 흐름은 `키워드 검색 + 벡터 검색 → 관련 Capture 선별`이다. 벡터
 * 검색은 미뤘으므로(16-A) 키워드 검색이 후보를 모으는 일을 혼자 맡는다.
 *
 * 왜 물음을 그대로 넣지 못하는가
 *   글자 포함 검색은 넣은 글자가 통째로 들어 있는 것을 찾는다.
 *   `수학적 모델링에서 학생들이 자주 하는 오류가 뭐야`를 그대로 넣으면
 *   그 문장이 통째로 적힌 기록을 찾게 되고, 그런 것은 없다. **오류가 나지
 *   않고 0건이 나온다.** 낱말로 쪼개야 한다.
 *
 * 왜 조사를 떼면서 뗀 것도 남기는가
 *   `모델링에서`로는 `모델링`이 적힌 기록을 찾지 못한다. 글자 포함 검색은
 *   붙여 쓴 말 안에서도 찾지만, 넣은 글자 쪽이 더 길면 소용이 없다.
 *
 *   그렇다고 뗀 것만 쓰면 잘못 뗐을 때 되돌릴 길이 없다. `시에서`의 `에서`를
 *   떼면 `시`가 남는데, 진짜 낱말이 `시에서`인 경우도 있다. **그래서 둘 다
 *   넣는다.** 조건을 `또는`으로 잇기 때문에 넓어질 뿐 좁아지지 않는다.
 *
 *   AGENTS.md 2절의 "좁혀서 못 찾으면 넓혀서 다시 묻는다"와 같은 생각이다.
 *   여기서는 아예 처음부터 둘 다 묻는다. 어차피 그다음에 AI가 걸러낸다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 물음의 최대 길이. 이 값이 한 번에 보내는 물음의 크기를 정한다. */
export const MAX_QUESTION_LENGTH = 300;

/** 물음의 최소 길이. 한 글자로는 무엇을 묻는지 알 수 없다. */
export const MIN_QUESTION_LENGTH = 2;

/**
 * 후보를 모을 때 쓸 낱말의 최대 개수.
 *
 * 많을수록 조건이 길어지고 결과가 넓어진다. 넓어지는 것 자체는 괜찮지만
 * 질의가 무거워진다. 긴 물음에서도 앞쪽 낱말이 대개 핵심이다.
 */
export const MAX_KEYWORDS = 12;

/**
 * 뜻이 없는 말.
 *
 * 물음에는 묻는 말이 섞인다. `뭐야`, `알려줘` 같은 것으로 기록을 찾으면
 * 엉뚱한 것이 딸려 온다. **자주 쓰는 것만 적는다.** 목록이 길어질수록
 * 진짜 낱말을 잘못 지울 위험이 커진다.
 */
const STOP_WORDS = new Set([
  "무엇",
  "무엇인가",
  "뭐",
  "뭐야",
  "뭔가",
  "어떤",
  "어떻게",
  "어디",
  "언제",
  "누가",
  "왜",
  "알려줘",
  "알려",
  "정리해줘",
  "정리해",
  "설명해줘",
  "설명해",
  "찾아줘",
  "찾아",
  "해줘",
  "있나",
  "있어",
  "있는",
  "관한",
  "대한",
  "대해",
  "그리고",
  "그런데",
  "하지만",
  "the",
  "and",
  "for",
  "what",
  "which",
  "about",
]);

/**
 * 떼어 볼 조사와 어미.
 *
 * 긴 것부터 본다. `에서는`을 `는`으로 먼저 떼면 `에서`가 남는다.
 * 한 번만 뗀다. 여러 번 떼면 남는 글자가 너무 짧아져 아무 데나 걸린다.
 */
const PARTICLES = [
  "에서는",
  "에게서",
  "으로는",
  "이라는",
  "라는",
  "에서",
  "에게",
  "으로",
  "까지",
  "부터",
  "보다",
  "처럼",
  "마다",
  "조차",
  "이나",
  "과는",
  "와는",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "도",
  "만",
  "과",
  "와",
  "로",
];

/** 조사를 뗀 뒤 남아야 하는 최소 길이. 한 글자는 아무 데나 걸린다. */
const MIN_STEM_LENGTH = 2;

/**
 * 사람이 친 물음을 다듬는다.
 *
 * 앞뒤 공백을 떼고 가운데 여러 칸을 한 칸으로 줄인다. 줄바꿈도 정리한다.
 * 물을 것이 없으면 null이다. `normalizeSearchTerm`과 같은 모양이다.
 */
export function normalizeQuestion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);

  return text.length >= MIN_QUESTION_LENGTH ? text : null;
}

/** 한글이 섞여 있는가. 조사를 떼어볼지 가른다. */
function hasHangul(token: string): boolean {
  return /[가-힣]/.test(token);
}

/**
 * 물음에서 찾을 낱말을 뽑는다.
 *
 * 돌려주는 목록에는 조사를 뗀 것과 떼지 않은 것이 함께 들어 있다.
 * 겹치는 것은 한 번만 넣는다.
 */
export function extractKeywords(question: string): string[] {
  /*
    글자와 숫자만 남기고 가른다. 물음표·쉼표·따옴표가 낱말에 붙어 오면
    그대로 검색어가 되어 아무것도 찾지 못한다.

    하이픈은 남긴다. `COVID-19`처럼 낱말의 일부인 경우가 있다.
  */
  const tokens = question
    .split(/[^\p{Letter}\p{Number}-]+/u)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 0);

  const found: string[] = [];
  const seen = new Set<string>();

  const add = (token: string) => {
    const key = token.toLowerCase();

    if (seen.has(key) || STOP_WORDS.has(key)) {
      return;
    }

    seen.add(key);
    found.push(token);
  };

  for (const token of tokens) {
    if (STOP_WORDS.has(token.toLowerCase())) {
      continue;
    }

    add(token);

    if (!hasHangul(token)) {
      continue;
    }

    for (const particle of PARTICLES) {
      if (
        token.endsWith(particle) &&
        token.length - particle.length >= MIN_STEM_LENGTH
      ) {
        add(token.slice(0, -particle.length));
        break;
      }
    }
  }

  return found.slice(0, MAX_KEYWORDS);
}

/**
 * 낱말이 자료 갈래의 이름과 맞는지 본다. (19-D-2를 쓰다가 찾음)
 *
 * 왜 필요한가
 *   **`드라마`라는 낱말은 어디에도 저장되어 있지 않다.** 드라마 자료의
 *   제목은 작품 이름이고(`브레이킹 배드`), 갈래는 `media`라는 값으로만
 *   담긴다. `영화·드라마`라는 이름은 코드에만 있다.
 *
 *   그래서 `내가 재미있게 보는 드라마는`이라는 자리에 아무것도 추천되지
 *   않았다. 담아둔 드라마가 있는데도 그랬다. 사용자가 찾았다.
 *
 *   **글자로 찾는 것만으로는 갈래를 물을 수 없다.** 그 자리를 여기서 메운다.
 *
 * 왜 짧은 낱말을 조심하는가
 *   `이미지`라는 이름은 `이`를 품고 있다. 한 글자짜리 낱말로 갈래를 맞추면
 *   `이`가 든 물음마다 이미지가 전부 딸려 온다.
 *
 *   그래서 **두 글자 이상일 때만 품고 있는지 보고**, 한 글자는 이름과
 *   똑같을 때만 맞는 것으로 본다. `책`은 그 길로 맞는다.
 *
 * 넓어지는 것 자체는 괜찮다. 좁히는 일은 그다음에 AI가 한다.
 * (AGENTS.md 2절 `좁혀서 못 찾으면 넓혀서 다시 묻는다`)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 *
 * @param labels 갈래 값과 그 이름의 짝. 부르는 쪽이 넘긴다.
 */
export function matchingTypes<T extends string>(
  keywords: readonly string[],
  labels: Readonly<Record<T, string>>,
): T[] {
  const found: T[] = [];

  for (const [type, label] of Object.entries(labels) as [T, string][]) {
    const hit = keywords.some(
      (keyword) =>
        keyword === label || (keyword.length >= 2 && label.includes(keyword)),
    );

    if (hit) {
      found.push(type);
    }
  }

  return found;
}
