/**
 * AI를 지금 쓸 수 있는가를 가리는 판단의 단위 검사. (19-F)
 *
 * **틀려도 오류가 나지 않는 자리다.** 거꾸로 가리면 허용 못 받은 사람에게
 * 기능이 열리고, 그때 나가는 것은 돈이다. 반대로 과하게 막으면 허용받은
 * 사람이 못 쓰는데 **화면에는 "설정되지 않았습니다"가 뜬다.** 관리자는
 * 허용을 이미 줬으므로 무엇을 더 해야 할지 모른다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_NOT_ALLOWED_MESSAGE,
  AI_NOT_CONFIGURED_MESSAGE,
  aiAvailability,
  aiBlockedMessage,
} from "../src/lib/ai/access.ts";

test("열쇠가 있고 허용받았으면 쓸 수 있다", () => {
  assert.equal(
    aiAvailability({ configured: true, allowed: true }),
    "ok",
  );
});

test("허용받지 못했으면 허용이 없다고 말한다", () => {
  assert.equal(
    aiAvailability({ configured: true, allowed: false }),
    "not_allowed",
  );
});

test("열쇠가 없으면 설정이 없다고 말한다", () => {
  assert.equal(
    aiAvailability({ configured: false, allowed: true }),
    "not_configured",
  );
});

test("둘 다 없으면 설정 쪽을 먼저 말한다", () => {
  /*
    **순서가 뜻을 가진다.** 열쇠가 없으면 허용을 받아도 아무 일이 안
    일어난다. 그 상태에서 "허용받으세요"라고 말하면, 관리자가 허용해 준
    뒤에도 여전히 안 되고 아무도 까닭을 모른다.
  */
  assert.equal(
    aiAvailability({ configured: false, allowed: false }),
    "not_configured",
  );
});

test("쓸 수 있으면 보여줄 말이 없다", () => {
  /*
    빈 글자가 아니라 `null`이다. 빈 글자를 돌려주면 "말이 없다"와 "쓸 수
    있다"가 같은 모양이 되어, 부르는 쪽이 `if (message)` 하나로 가를 수 없다.
  */
  assert.equal(aiBlockedMessage("ok"), null);
});

test("막힌 까닭마다 다른 말을 준다", () => {
  assert.equal(aiBlockedMessage("not_allowed"), AI_NOT_ALLOWED_MESSAGE);
  assert.equal(
    aiBlockedMessage("not_configured"),
    AI_NOT_CONFIGURED_MESSAGE,
  );

  /*
    **두 말이 같으면 가른 뜻이 없다.** 한쪽은 요청하면 풀리고 한쪽은
    기다려도 안 되는데, 같은 말을 들으면 무엇을 해야 할지 알 수 없다.
  */
  assert.notEqual(AI_NOT_ALLOWED_MESSAGE, AI_NOT_CONFIGURED_MESSAGE);
});

test("허용이 없다는 말은 무엇을 하면 되는지 알려준다", () => {
  /*
    이 말만 보고 다음 걸음을 알 수 있어야 한다. `관리자`라는 낱말이 없으면
    누구에게 말해야 하는지 모른다.
  */
  assert.match(AI_NOT_ALLOWED_MESSAGE, /관리자/);
  assert.match(AI_NOT_CONFIGURED_MESSAGE, /운영자/);
});
