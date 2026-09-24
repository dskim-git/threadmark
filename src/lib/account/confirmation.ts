/**
 * 계정 삭제 확인 글자 맞추기.
 *
 * 되돌릴 수 없는 일 앞에서는 **한 번 더 손을 쓰게 만든다.** 단추 하나로
 * 끝나면 잘못 누른 것과 마음먹고 누른 것을 구분할 방법이 없다.
 *
 * 무엇을 적게 할지는 고민이 있었다. `삭제`처럼 짧은 낱말은 손이 먼저
 * 움직여 버리고, 한글은 입력기 상태에 따라 엉뚱한 글자가 섞인다.
 * **자기 메일 주소**는 화면에 그대로 떠 있어 보고 적을 수 있고, 영문이라
 * 입력기와 상관이 없으며, 무엇보다 **지금 지우려는 계정이 어느 것인지를
 * 눈으로 확인하게 만든다.** 여러 계정을 쓰는 사람에게 이것이 마지막 방패다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 적어 넣은 글자가 이 계정의 메일 주소와 같은지 본다.
 *
 * 앞뒤 공백과 대소문자는 무시한다. 휴대폰 자판이 첫 글자를 멋대로 크게
 * 바꾸는 일이 흔하고, 그것 때문에 삭제가 막히면 사용자는 "왜 안 되지"만
 * 남는다. 메일 주소의 대소문자는 실제로도 구분하지 않는 것이 보통이다.
 *
 * **메일 주소를 모르면 맞다고 하지 않는다.** (보안 원칙 7) 확인할 기준이
 * 없는데 통과시키면 확인 절차가 있는 척만 하는 셈이 된다. 그 경우 화면은
 * 폼 대신 문의 안내를 보여준다.
 */
export function matchesAccountEmail(
  typed: unknown,
  email: string | null | undefined,
): boolean {
  if (typeof email !== "string") {
    return false;
  }

  const expected = normalize(email);

  if (expected.length === 0) {
    return false;
  }

  if (typeof typed !== "string") {
    return false;
  }

  return normalize(typed) === expected;
}

/**
 * 견주기 전에 모양을 고른다.
 *
 * `toLocaleLowerCase`가 아니라 `toLowerCase`를 쓴다. 터키어 자리에서는
 * `I`가 `ı`로 내려가 같은 주소가 서로 달라진다. 메일 주소는 어느 나라에서
 * 적든 같은 글자여야 한다.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}
