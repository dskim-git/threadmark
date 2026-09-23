/**
 * 사파리에 빠져 있는 `ReadableStream`의 `for await` 지원을 채운다.
 *
 * 2026-09-24에 아이패드에서 논문의 문장을 드래그할 수 없었다. 같은 파일이
 * 데스크톱과 안드로이드에서는 멀쩡했다. 화면에 뜬 이유는 이것이었다.
 *
 *   undefined is not a function (near '...t of e...')
 *
 * pdf.js가 글자를 꺼낼 때 스트림을 `for await ... of`로 읽는다.
 *
 *   const readableStream = this.streamTextContent(params);
 *   for await (const value of readableStream) { ... }
 *
 * 크롬과 파이어폭스는 `ReadableStream`을 그렇게 읽을 수 있는데 **사파리는
 * 아직 못 읽는다.** 규격에는 있고 구현이 없다. 그래서 반복하려는 순간
 * "그런 함수가 없다"가 된다. 줄여진 코드라 `'...t of e...'`로 보인다.
 *
 * 왜 그 한 줄을 피해 가지 않고 기능을 채우는가
 *   pdf.js 안에 같은 방식으로 읽는 곳이 하나 더 있다. 한 곳을 피하면 다른
 *   곳에서 다시 만난다. 라이브러리를 올릴 때마다 새로 생길 수도 있다.
 *   빠진 것은 규격에 있는 기능이므로, 없을 때만 채워 넣는다.
 *
 * 이미 있으면 건드리지 않는다. 사파리가 나중에 지원하면 그쪽이 쓰인다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

type StreamReader = {
  read(): Promise<{ done: boolean; value?: unknown }>;
  releaseLock(): void;
  cancel(reason?: unknown): Promise<unknown>;
};

type StreamPrototype = {
  getReader(): StreamReader;
  [Symbol.asyncIterator]?: unknown;
};

export type InstallOutcome = "installed" | "already" | "skipped";

/**
 * @param prototype `ReadableStream.prototype`. 없는 환경이면 undefined.
 * @returns 무엇을 했는지. 검사와 로그가 읽는다.
 */
export function installStreamAsyncIterator(
  prototype: object | undefined | null,
): InstallOutcome {
  if (!prototype) {
    // 서버에는 이 값이 없을 수 있다. 없는 것을 채우려 하지 않는다.
    return "skipped";
  }

  const target = prototype as StreamPrototype;

  if (typeof target[Symbol.asyncIterator] === "function") {
    return "already";
  }

  function values(this: StreamPrototype) {
    const reader = this.getReader();

    const iterator = {
      async next(): Promise<IteratorResult<unknown>> {
        const { done, value } = await reader.read();

        if (done) {
          // 다 읽었으면 놓아준다. 쥔 채로 두면 그 스트림을 다시 읽지 못한다.
          reader.releaseLock();

          return { done: true, value: undefined };
        }

        return { done: false, value };
      },

      /*
        중간에 그만둘 때다. `break`나 예외로 반복문을 빠져나오면 여기로 온다.
        읽던 것을 취소하고 놓아준다. 취소하지 않으면 뒤에서 계속 받아온다.
      */
      async return(value?: unknown): Promise<IteratorResult<unknown>> {
        await reader.cancel(value).catch(() => {});
        reader.releaseLock();

        return { done: true, value };
      },

      [Symbol.asyncIterator]() {
        return iterator;
      },
    };

    return iterator;
  }

  target[Symbol.asyncIterator] = values;

  /*
    `values()`라는 이름으로도 부를 수 있어야 한다. 규격이 둘을 같은 것으로
    정해두었고, 그 이름으로 부르는 코드가 있다.
  */
  if (typeof (target as { values?: unknown }).values !== "function") {
    (target as { values?: unknown }).values = values;
  }

  return "installed";
}
