/**
 * 밖으로 보내는 요청의 헤더. **한 곳에 모아 둔다.**
 *
 * 모아 둔 이유는 하나다. **검사가 전부를 한 번에 들여다볼 수 있게** 하려는
 * 것이다. 새 연동을 더하면서 여기에 한 줄 더하면, 그 헤더도 자동으로 검사를
 * 받는다. 파일마다 따로 두면 새로 만든 것만 빠진다.
 *
 * **ASCII만 쓴다.**
 *
 * 15-C에서 `user-agent`에 `개인 지식 관리 도구`를 넣었다가 **모든 주소가
 * 실패했다.** HTTP 헤더 값에는 ASCII만 들어갈 수 있고, 한글이 섞이면 fetch가
 * 요청을 보내기도 전에 던진다. 주소가 멀쩡해도, 사이트가 멀쩡해도 던진다.
 *
 * 증상이 남을 의심하게 만들었다. 화면에 `지금은 그 사이트에 닿지 못했습니다`가
 * 떠서 사이트 문제처럼 보였는데, 실은 어느 사이트에서도 되지 않는 상태였다.
 *
 * AGENTS.md 6절에 같은 함정이 이미 적혀 있었다. 리디렉션 주소에 한글을 넣으면
 * 응답이 깨진다는 것이고 이유가 똑같다. **적어둔 함정에 다시 빠졌다는 뜻이라
 * 말로 적는 대신 검사로 옮겼다.** (`tests/outgoing-headers.test.mjs`)
 *
 * 이 파일에 다른 것을 import하지 않는다. 검사가 이 값만 따로 들여다볼 수
 * 있어야 하고, 무언가를 끌어오면 그 사슬이 전부 따라온다.
 *
 * **우리가 누구인지 밝힌다.** 밝히지 않으면 막는 곳이 많고, 무엇보다
 * 상대가 우리를 차단할 수 있어야 한다. MusicBrainz는 연락할 곳을 함께 적기를
 * 이용 규칙으로 요구한다.
 */

const USER_AGENT = "ThreadMarkBot/1.0 (+https://thread-mark.vercel.app)";

/** 웹사이트 자료를 읽을 때. (설계 문서 11.3절) */
export const WEBSITE_REQUEST_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  accept: "text/html,application/xhtml+xml",
  "accept-language": "ko,en;q=0.8",
};

/** MusicBrainz에 곡을 물을 때. (설계 문서 13.3절) */
export const MUSICBRAINZ_REQUEST_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  accept: "application/json",
};

/** iTunes에 곡을 물을 때. */
export const ITUNES_REQUEST_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  // iTunes는 `text/javascript`로 돌려주지만 내용은 JSON이다.
  accept: "application/json,text/javascript",
};

/**
 * 검사가 훑는 목록.
 *
 * **새 헤더 묶음을 만들면 여기에도 넣는다.** 넣지 않으면 그것만 검사를
 * 받지 않고, 한글이 섞여도 아무것도 막지 못한다.
 */
export const OUTGOING_HEADER_SETS: Record<string, Record<string, string>> = {
  website: WEBSITE_REQUEST_HEADERS,
  musicbrainz: MUSICBRAINZ_REQUEST_HEADERS,
  itunes: ITUNES_REQUEST_HEADERS,
};
