/**
 * AI가 내놓은 답을 다듬고, 가리킨 번호를 확인한다. (설계 문서 19절)
 *
 * 19절: "검색 결과에는 관련 Capture와 출처 위치를 표시한다."
 *
 * 왜 번호를 다시 확인하는가
 *   답에 `[3]`이라고 적혀 있다고 3번 자료가 있다는 뜻이 아니다. 모델은
 *   없는 번호를 적을 수 있고, 넘긴 글 안에 심어둔 가짜 번호를 따라 적을
 *   수도 있다. (`fence.ts` 참고)
 *
 *   **가리킨 곳이 진짜 있는지는 우리가 센다.** 없는 번호를 화면에 그리면
 *   누를 데가 없는 줄이 생기고, 더 나쁘게는 **엉뚱한 자료를 근거라고
 *   보여주게 된다.** 근거가 틀리면 답 전체를 믿을 수 없다.
 *
 * 왜 짜인 모양(structured output)을 쓰지 않는가
 *   답은 사람이 읽을 글이다. 짜인 모양으로 받으면 그 틀에 맞춰 답이
 *   납작해지고, 틀이 깨졌을 때 아무것도 못 보여준다. 글로 받고 번호만
 *   따로 세는 편이 실패에 강하다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 답에서 자료를 가리키는 모양. `[3]`, `[1, 4]`, `[2][5]` 모두 받는다. */
const CITATION_PATTERN = /\[([0-9]+(?:\s*,\s*[0-9]+)*)\]/g;

/**
 * 답을 다듬는다.
 *
 * 앞뒤 빈 줄을 떼고, 세 줄 이상 이어진 빈 줄을 두 줄로 줄인다.
 * **글 안쪽은 건드리지 않는다.** 손대기 시작하면 무엇이 AI의 답인지
 * 알 수 없게 된다. (`tidyTranslationOutput`과 같은 생각)
 */
export function tidyAnswer(raw: string): string {
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 답이 가리킨 번호 중 **실제로 있는 것**만 골라 돌려준다.
 *
 * 번호는 1부터 센다. 사람이 읽는 글에 0번은 없다.
 * 나온 순서대로 돌려주고 같은 번호는 한 번만 넣는다.
 *
 * @param answer 모델이 내놓은 글
 * @param count  실제로 넘긴 자료의 개수
 */
export function citedIndices(answer: string, count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }

  const found: number[] = [];
  const seen = new Set<number>();

  for (const [, group] of answer.matchAll(CITATION_PATTERN)) {
    for (const piece of group.split(",")) {
      const value = Number.parseInt(piece.trim(), 10);

      if (!Number.isInteger(value) || value < 1 || value > count) {
        continue;
      }

      if (seen.has(value)) {
        continue;
      }

      seen.add(value);
      found.push(value);
    }
  }

  return found;
}

/**
 * 답이 가리켰지만 **없는 번호**를 돌려준다.
 *
 * 화면에 쓰려는 것이 아니라 서버 기록에 남기려는 것이다. 이 값이 계속
 * 나오면 지시문이 잘못되었거나 넘긴 글에 가짜 번호가 섞여 있다는 뜻이다.
 * **말없이 버리면 그것을 알 방법이 없다.**
 */
export function danglingIndices(answer: string, count: number): number[] {
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  const found: number[] = [];
  const seen = new Set<number>();

  for (const [, group] of answer.matchAll(CITATION_PATTERN)) {
    for (const piece of group.split(",")) {
      const value = Number.parseInt(piece.trim(), 10);

      if (!Number.isInteger(value) || seen.has(value)) {
        continue;
      }

      if (value >= 1 && value <= safeCount) {
        continue;
      }

      seen.add(value);
      found.push(value);
    }
  }

  return found;
}
