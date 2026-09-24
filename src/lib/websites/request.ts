/**
 * 밖으로 보내는 헤더. (설계 문서 11.3절)
 *
 * `user-agent`로 우리가 누구인지 밝힌다. 밝히지 않으면 막는 사이트가 많고,
 * 무엇보다 **상대가 우리를 차단할 수 있어야 한다.** 받아오는 쪽이 일방적으로
 * 숨는 것은 예의가 아니다.
 *
 * **ASCII만 쓴다.**
 *
 * 처음에 user-agent에 `개인 지식 관리 도구`를 넣었더니 **모든 주소가
 * 실패했다.** HTTP 헤더 값에는 ASCII만 들어갈 수 있고, 한글이 섞이면 fetch가
 * 요청을 보내기도 전에 던진다. 주소가 멀쩡해도, 사이트가 멀쩡해도 던진다.
 *
 * 증상이 고약했다. 던져진 오류를 `network`로 뭉쳐 처리하고 있어서 화면에는
 * `지금은 그 사이트에 닿지 못했습니다`가 떴다. 사이트 문제처럼 보이는데
 * 실은 어느 사이트에서도 되지 않는 상태였다. 사용자가 발견했다.
 *
 * AGENTS.md 6절에 같은 함정이 이미 적혀 있었다. 리디렉션 주소에 한글을
 * 넣으면 응답이 깨진다는 것이고 이유가 똑같다. **적어둔 함정에 다시
 * 빠졌다는 뜻이다.** 그래서 말로 적는 대신 검사로 옮겼다.
 * (`tests/websites-request-headers.test.mjs`)
 *
 * 이 파일에 다른 것을 import하지 않는다. 검사가 이 값만 따로 들여다볼 수
 * 있어야 하고, 무언가를 끌어오면 그 사슬이 전부 따라온다.
 */
export const WEBSITE_REQUEST_HEADERS: Record<string, string> = {
  "user-agent": "ThreadMarkBot/1.0 (+https://thread-mark.vercel.app)",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "ko,en;q=0.8",
};
