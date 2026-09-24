/**
 * 중요 표시(별)를 거르는 값. (설계 문서 5.2-1절, 6.2-1절)
 *
 * 자료 목록, 빠른 기록, 자료의 기록 목록, 읽기 화면의 기록 탭이 모두
 * 이 한 곳을 쓴다. 화면마다 `starred === "1"`을 따로 적으면 한 곳에서
 * 값을 바꿨을 때 나머지가 조용히 어긋난다.
 *
 * 주소에 남는 값이라 짧게 둔다. 정렬·보기와 같은 방식이다. (sorting.ts)
 * 새로고침해도 그대로 있고, "내 별 자료"를 즐겨찾기에 담을 수 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/** 주소에 쓰는 이름. */
export const STARRED_PARAM = "starred";

/** 켜졌을 때 주소에 넣는 값. */
export const STARRED_ON = "1";

/**
 * 주소에서 읽은 값이 "별 단 것만"인지.
 *
 * 켜진 값 하나만 인정한다. 모르는 값은 전부 꺼진 것으로 본다. 주소는
 * 사용자가 고쳐 쓸 수 있고, 켜진 것으로 잘못 읽으면 자료가 사라진 것처럼
 * 보인다. 꺼진 쪽으로 틀리면 전부 보일 뿐이라 잃는 것이 없다.
 */
export function readStarredOnly(value: unknown): boolean {
  return value === STARRED_ON;
}

/**
 * 별을 다는 단추가 보내는 값을 읽는다.
 *
 * 단추는 지금 상태가 아니라 **바꾸려는 상태**를 보낸다. 지금 상태를 보내면
 * 서버가 그것을 뒤집어야 하는데, 두 번 눌렸을 때 어느 쪽으로 가는지가
 * 누른 순서에 달리게 된다. 바꾸려는 상태를 보내면 몇 번을 눌러도 결과가 같다.
 */
export function readStarredInput(value: unknown): boolean | null {
  if (value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  return null;
}

/** 단추가 보낼 값. 지금 별이 달려 있으면 떼는 쪽이다. */
export function starredInputValue(starred: boolean): "on" | "off" {
  return starred ? "off" : "on";
}
