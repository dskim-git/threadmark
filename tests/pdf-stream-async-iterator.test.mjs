/**
 * 사파리에 빠진 스트림 읽기를 채우는 코드의 단위 검사.
 *
 * 2026-09-24에 아이패드에서 논문의 문장을 드래그할 수 없었다. 데스크톱과
 * 안드로이드에서는 멀쩡했다. pdf.js가 글자를 꺼낼 때 스트림을
 * `for await ... of`로 읽는데 사파리가 아직 그렇게 읽지 못한다.
 *
 * 여기서 검사하는 것은 **채워 넣은 것이 규격대로 도는가**다. 잘못 채우면
 * 증상이 고약하다. 글자를 꺼내다 중간에 멈추거나, 스트림을 쥔 채 놓지 않아
 * 다음 쪽을 읽지 못한다. 둘 다 오류 없이 조용히 일어난다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { installStreamAsyncIterator } from "../src/lib/pdf/stream-async-iterator.ts";

/**
 * `ReadableStream`인 척하는 물건.
 *
 * 진짜를 쓰지 않는 이유는 Node의 `ReadableStream`에는 이미 `for await`가
 * 있어서다. 그러면 채워 넣는 길로 들어가지 않아 아무것도 검사하지 못한다.
 * 사파리처럼 **빠져 있는** 것을 흉내 내야 한다.
 */
function makeStreamPrototype(chunks) {
  const log = { released: 0, cancelled: [] };

  const prototype = {
    getReader() {
      let index = 0;

      return {
        async read() {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }

          const value = chunks[index];
          index += 1;

          return { done: false, value };
        },
        releaseLock() {
          log.released += 1;
        },
        async cancel(reason) {
          log.cancelled.push(reason);
        },
      };
    },
  };

  return { prototype, log };
}

test("빠져 있으면 채운다", () => {
  const { prototype } = makeStreamPrototype([]);

  assert.equal(installStreamAsyncIterator(prototype), "installed");
  assert.equal(typeof prototype[Symbol.asyncIterator], "function");
});

test("이미 있으면 건드리지 않는다", () => {
  /*
    사파리가 나중에 지원하면 그쪽이 쓰여야 한다. 우리 것으로 덮어쓰면
    브라우저가 고친 것을 되돌리는 셈이다.
  */
  const { prototype } = makeStreamPrototype([]);
  const original = function original() {};

  prototype[Symbol.asyncIterator] = original;

  assert.equal(installStreamAsyncIterator(prototype), "already");
  assert.equal(prototype[Symbol.asyncIterator], original);
});

test("없는 환경에서는 아무것도 하지 않는다", () => {
  // 서버에는 ReadableStream이 없을 수 있다.
  assert.equal(installStreamAsyncIterator(undefined), "skipped");
  assert.equal(installStreamAsyncIterator(null), "skipped");
});

test("끝까지 읽는다", async () => {
  /*
    pdf.js는 이 반복으로 글자 조각을 모은다. 하나라도 빠뜨리면 문장의
    일부만 꺼내지고, 사용자는 드래그한 것과 저장된 것이 다른 것을 본다.
  */
  const { prototype } = makeStreamPrototype(["가", "나", "다"]);

  installStreamAsyncIterator(prototype);

  const stream = Object.create(prototype);
  const read = [];

  for await (const value of stream) {
    read.push(value);
  }

  assert.deepEqual(read, ["가", "나", "다"]);
});

test("다 읽으면 쥐고 있던 것을 놓는다", async () => {
  // 놓지 않으면 그 스트림을 다시 읽지 못한다.
  const { prototype, log } = makeStreamPrototype(["가"]);

  installStreamAsyncIterator(prototype);

  const stream = Object.create(prototype);

  for await (const value of stream) {
    assert.equal(value, "가");
  }

  assert.equal(log.released, 1);
});

test("중간에 그만두면 취소하고 놓는다", async () => {
  /*
    `break`로 빠져나오는 경우다. 취소하지 않으면 뒤에서 계속 받아온다.
    PDF를 구간별로 받고 있어서 그대로 두면 쓸데없는 왕복이 이어진다.
  */
  const { prototype, log } = makeStreamPrototype(["가", "나", "다"]);

  installStreamAsyncIterator(prototype);

  const stream = Object.create(prototype);

  for await (const value of stream) {
    if (value === "나") {
      break;
    }
  }

  assert.equal(log.cancelled.length, 1);
  assert.equal(log.released, 1);
});

test("빈 스트림도 읽는다", async () => {
  const { prototype, log } = makeStreamPrototype([]);

  installStreamAsyncIterator(prototype);

  const stream = Object.create(prototype);
  const read = [];

  for await (const value of stream) {
    read.push(value);
  }

  assert.deepEqual(read, []);
  assert.equal(log.released, 1);
});

test("values로도 부를 수 있다", async () => {
  // 규격이 둘을 같은 것으로 정해두었고, 그 이름으로 부르는 코드가 있다.
  const { prototype } = makeStreamPrototype(["가"]);

  installStreamAsyncIterator(prototype);

  const stream = Object.create(prototype);
  const read = [];

  for await (const value of stream.values()) {
    read.push(value);
  }

  assert.deepEqual(read, ["가"]);
});
