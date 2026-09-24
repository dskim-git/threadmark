/**
 * 밖으로 보내는 헤더가 ASCII인지 확인한다.
 *
 * **HTTP 헤더 값에는 ASCII만 들어갈 수 있다.** 한글이 섞이면 `fetch`가 요청을
 * 보내기도 전에 던진다. 주소가 멀쩡해도, 사이트가 멀쩡해도 던진다.
 *
 * 실제로 그렇게 만들었다. user-agent에 `개인 지식 관리 도구`를 넣었더니
 * **모든 주소가 실패했다.** 던져진 오류를 `network`로 뭉쳐 처리하고 있어서
 * 화면에는 `지금은 그 사이트에 닿지 못했습니다`가 떴다. 사이트 문제처럼
 * 보이는데 실은 어느 사이트에서도 되지 않는 상태였다. 사용자가 발견했다.
 *
 * AGENTS.md 6절에 같은 함정이 이미 적혀 있었다. 리디렉션 주소에 한글을
 * 넣으면 응답이 깨진다는 것이고, 이유가 똑같다. **적어둔 함정에 다시
 * 빠졌다는 뜻이다.** 그래서 말로 적는 대신 검사로 옮긴다.
 *
 * 이 저장소의 글은 대부분 한글이라 이 실수는 되풀이될 여지가 크다.
 * 헤더에 넣는 글만 ASCII여야 한다는 것이 눈에 보이지 않는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { WEBSITE_REQUEST_HEADERS as headers } from "../src/lib/websites/request.ts";

test("헤더 이름과 값이 모두 ASCII다", () => {
  for (const [name, value] of Object.entries(headers)) {
    assert.ok(
      /^[\x20-\x7e]*$/u.test(name),
      `헤더 이름에 ASCII가 아닌 글자가 있다: ${name}`,
    );

    assert.ok(
      /^[\x20-\x7e]*$/u.test(value),
      `헤더 \`${name}\`의 값에 ASCII가 아닌 글자가 있다. HTTP 헤더는 ASCII만 받으므로 fetch가 요청을 보내기도 전에 던진다: ${value}`,
    );
  }
});

test("브라우저가 실제로 그 헤더를 받아들인다", () => {
  /*
    글자 범위를 우리가 재는 것으로 끝내지 않고, 헤더를 만드는 쪽에 직접
    물어본다. 규칙을 흉내 내다 어긋나면 검사는 통과하고 실제로는 던진다.
  */
  assert.doesNotThrow(() => new Headers(headers));
});

test("우리가 누구인지 밝힌다", () => {
  // 상대가 우리를 차단할 수 있어야 한다. 일방적으로 숨지 않는다.
  assert.ok(headers["user-agent"]);
  assert.match(headers["user-agent"], /ThreadMark/u);
  assert.match(headers["user-agent"], /https?:\/\//u, "닿을 곳을 함께 적는다");
});

test("HTML을 달라고 말한다", () => {
  assert.match(headers.accept, /text\/html/u);
});
