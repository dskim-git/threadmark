/**
 * 문의할 곳. (17-B)
 *
 * **소스 코드에 주소를 적지 않는다.** 이 저장소는 공개되어 있고,
 * `tests/migration-invariants.test.mjs`가 운영자 메일 주소가 코드에 들어가는
 * 것을 막는다. 관리자 판정을 이메일로 하지 않기 위해 둔 검사인데, 주소를
 * 코드에 박지 않는다는 규칙 자체는 여기에도 그대로 맞다.
 *
 * 실제로 여기서 한 번 걸렸다. 방침 글에 주소를 상수로 적었다가 `npm test`가
 * 실패했다. **검사가 맞았다.** `/pending` 화면이 이미 환경변수에서 읽고
 * 있었는데 그 방식을 따르지 않았다.
 *
 * 값이 없으면 `null`이다. 화면은 그때 주소 대신 다른 안내를 보여준다.
 * 없는 값을 빈 `mailto:` 링크로 그리면 눌러도 아무 일이 일어나지 않고,
 * 사용자는 자기 기기를 의심하게 된다.
 */
export function contactEmail(): string | null {
  const value = process.env.SUPPORT_EMAIL?.trim();

  return value && value.length > 0 ? value : null;
}
