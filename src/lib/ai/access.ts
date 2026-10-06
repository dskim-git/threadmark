/**
 * AI 기능을 지금 쓸 수 있는가. (19-F, 2026-10-06 사용자 요청)
 *
 * > 처음에 웹앱에 가입하면 AI 기능이 막혀있는채로 사용하도록 해주고 (…)
 * > 관리자의 사용자 관리 메뉴에서 그 사용자가 AI 기능을 사용할 수 있도록
 * > 버튼으로 허용해주는 식이지.
 *
 * 막히는 까닭이 둘이고 **답이 서로 다르다**
 *   `not_configured`  열쇠가 없다. 운영자가 환경변수를 넣어야 한다.
 *                     **쓰는 사람이 할 수 있는 일이 없다.**
 *   `not_allowed`     관리자가 아직 허용하지 않았다.
 *                     **요청하면 풀린다.**
 *
 *   한 가지 말로 뭉뚱그리면 "요청하면 되는 것"과 "기다려도 안 되는 것"을
 *   가를 수 없다. 쓰는 사람이 무엇을 해야 하는지 모른 채 남는다.
 *
 * 순서가 있다
 *   **설정이 먼저다.** 열쇠가 없으면 허용을 받아도 아무 일이 일어나지
 *   않는다. 그 상태에서 "허용받으세요"라고 말하면, 관리자가 허용해 준 뒤에도
 *   여전히 안 되고 아무도 까닭을 모른다.
 *
 * 데이터베이스를 물지 않는 순수 모듈이다
 *   판단만 들어 있어 단위 검사로 확인한다. 데이터베이스나 서버 모듈을 무는
 *   파일에 이 판단을 함께 두면 **그 판단은 검사되지 않는다.**
 *   (AGENTS.md 2절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 */

/** 지금 AI를 쓸 수 있는가, 못 쓴다면 왜인가. */
export type AiAvailability = "ok" | "not_configured" | "not_allowed";

/**
 * 관리자가 아직 허용하지 않았을 때 보여줄 말.
 *
 * **한 곳에 둔다.** 막는 자리가 다섯인데 저마다 다르게 적으면, 같은 일을
 * 겪고도 화면마다 다른 말을 듣는다. 그러면 쓰는 사람은 그것이 같은 까닭인지
 * 알 수 없다.
 */
export const AI_NOT_ALLOWED_MESSAGE =
  "AI 기능은 관리자가 허용한 사람만 쓸 수 있습니다. 관리자에게 요청해 주세요.";

/** 열쇠가 없을 때 보여줄 말. 쓰는 사람이 할 수 있는 일이 없다. */
export const AI_NOT_CONFIGURED_MESSAGE =
  "AI 기능이 아직 설정되지 않았습니다. 운영자에게 알려 주세요.";

/**
 * 지금 상태를 가린다.
 *
 * @param configured 열쇠가 있는가. 각 기능의 `isAi...Configured()`가 준다.
 * @param allowed 관리자가 이 사람에게 허용했는가. `account.aiEnabled`다.
 */
export function aiAvailability(input: {
  configured: boolean;
  allowed: boolean;
}): AiAvailability {
  if (!input.configured) {
    return "not_configured";
  }

  if (!input.allowed) {
    return "not_allowed";
  }

  return "ok";
}

/**
 * 못 쓰는 까닭을 사람이 읽을 말로 바꾼다. 쓸 수 있으면 `null`이다.
 *
 * `null`을 돌려주는 까닭은, 부르는 쪽이 `if (message)` 하나로 갈라지게
 * 하려는 것이다. 빈 글자를 돌려주면 "말이 없다"와 "쓸 수 있다"가 같은
 * 모양이 된다.
 */
export function aiBlockedMessage(
  availability: AiAvailability,
): string | null {
  switch (availability) {
    case "not_configured":
      return AI_NOT_CONFIGURED_MESSAGE;
    case "not_allowed":
      return AI_NOT_ALLOWED_MESSAGE;
    default:
      return null;
  }
}
