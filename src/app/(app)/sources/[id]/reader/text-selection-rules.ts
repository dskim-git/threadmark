/**
 * 선택을 어느 쪽으로 늘리는 중인가. (2026-10-04)
 *
 * `text-selection.ts`가 덮개를 어디에 둘지 정할 때 쓴다. 앞으로 늘리는
 * 중이면 고르는 글자 **앞**에, 뒤로 늘리는 중이면 **뒤**에 둔다. 반대로
 * 두면 선택이 그 글자를 건너뛰거나 앞으로 튄다. 바로 그 고장을 고치려고
 * 만든 것이다.
 *
 * **이 파일은 아무것도 import하지 않는다.** `window`도 `document`도 만지지
 * 않아 검사가 직접 부를 수 있다. 브라우저를 만지는 쪽과 판단하는 쪽을
 * 나눠 두면, 나눈 만큼이 검사에 들어온다.
 * (`AGENTS.md` 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 */

/**
 * 범위의 경계 둘을 견주는 데 쓰는 값.
 *
 * `Range.END_TO_END`와 `START_TO_END`다. **숫자를 그대로 적는다.**
 * `Range`는 브라우저에만 있어서, 상수를 거기서 읽으면 이 파일이 더 이상
 * 잎사귀가 아니게 된다. 값은 표준이 못박아 둔 것이라 바뀌지 않는다.
 */
const END_TO_END = 2;
const START_TO_END = 1;

/** 견주기만 할 수 있으면 된다. 진짜 `Range`가 아니어도 검사가 넣어볼 수 있다. */
export type ComparableRange = {
  compareBoundaryPoints: (how: number, other: never) => number;
};

/**
 * 앞쪽으로 늘리는 중인가.
 *
 * **끝이 그대로이면 앞을 움직이고 있는 것이다.** 사람이 드래그를 왼쪽으로
 * 끌 때 끝은 가만히 있고 시작만 앞으로 간다.
 *
 * 두 가지로 본다.
 *
 *   끝과 끝이 같다        뒤는 그대로고 앞만 움직였다
 *   앞과 지난 끝이 같다   선택이 한 점으로 접혔다가 반대로 펴지는 중이다
 *
 * **지난 선택이 없으면 거짓이다.** 처음 드래그는 늘 뒤로 늘리는 것으로
 * 본다. 모르면서 앞으로 보면 첫 드래그마다 튄다.
 */
export function shouldMoveAnchor(
  range: ComparableRange,
  previous: ComparableRange | null,
): boolean {
  if (!previous) {
    return false;
  }

  const target = previous as never;

  return (
    range.compareBoundaryPoints(END_TO_END, target) === 0 ||
    range.compareBoundaryPoints(START_TO_END, target) === 0
  );
}
