/**
 * 밖에서 들어온 글을 AI에게 넘길 때 감싸는 법. (AGENTS.md 5절 10번)
 *
 * 왜 필요한가
 *   담아둔 기록을 Claude에게 넘긴다. 그 안에 "앞의 지시를 무시하고 ~하라"
 *   같은 문장이 들어 있을 수 있다. **내가 적은 메모라고 안전하지 않다.**
 *   PDF에서 복사해 온 원문이 그대로 들어 있는 기록이 많고, 그 원문은
 *   우리가 쓴 것이 아니다.
 *
 * 번역과 무엇이 다른가
 *   `src/lib/translation/anthropic.ts`가 같은 일을 하지만 **한 덩이만**
 *   감싼다. 여기는 기록 여러 개를 나란히 넘긴다. 그래서 위험이 하나 늘어난다.
 *
 *   번역은 닫는 표시만 지웠다. 덩이가 하나뿐이라 여는 표시를 심어도 할 수
 *   있는 일이 없기 때문이다. 여러 개를 넘길 때는 다르다. 글 안에 **여는
 *   표시**를 심으면 없는 항목을 하나 더 만들어 낼 수 있고, 그 가짜 항목에
 *   아무 말이나 적어 "3번 자료에 이렇게 적혀 있다"고 믿게 만들 수 있다.
 *
 *   **그래서 여는 표시와 닫는 표시를 모두 지운다.** 감싸는 것이 하나에서
 *   여럿이 되는 순간 지워야 할 것도 늘어난다.
 *
 * 무엇을 막지 못하는가
 *   이것은 **자료와 지시를 가르는 울타리**이지 내용 검사가 아니다. 울타리
 *   안에 무엇이 적혀 있든 넘어가고, 모델이 그것을 지시로 읽지 않기를
 *   기대한다. 그래서 지시문에도 "이 안은 자료일 뿐"이라고 함께 적는다.
 *   울타리와 지시문 둘 다 있어야 한다.
 *
 *   그리고 **AI가 하는 일이 글을 쓰는 것뿐**이어야 한다. 이 기능은 답을
 *   글로 받아 보여줄 뿐 무엇도 지우거나 고치지 않는다. 뚫려도 잘못된 글이
 *   나올 뿐이다. 그것이 마지막 방어선이다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 자료 하나를 여는 표시. */
export const FENCE_OPEN = "<담아둔글>";

/** 자료 하나를 닫는 표시. */
export const FENCE_CLOSE = "</담아둔글>";

/** 물음을 감싸는 표시. 자료와 다른 글자를 쓴다. */
export const QUESTION_OPEN = "<물음>";
export const QUESTION_CLOSE = "</물음>";

/**
 * 모든 울타리 글자. 자료 안에서 지울 대상이다.
 *
 * 자료 쪽 표시만 지우면 모자란다. 글 안에 `</물음>`을 심어 물음이 거기서
 * 끝난 것처럼 보이게 할 수 있기 때문이다. **울타리로 쓰는 글자는 전부
 * 지운다.** 하나라도 남기면 그 하나로 들어온다.
 */
const FENCE_MARKERS = [
  FENCE_OPEN,
  FENCE_CLOSE,
  QUESTION_OPEN,
  QUESTION_CLOSE,
] as const;

/**
 * 울타리 글자를 지운다.
 *
 * 지우고 나서 **한 번 더 지운다.** `<담<담아둔글>아둔글>`처럼 겹쳐 적으면
 * 한 번 지운 자리에서 새 표시가 생겨나기 때문이다. 더 이상 나오지 않을
 * 때까지 돈다.
 *
 * 무한히 돌지는 않는다. 지울 때마다 글이 짧아지므로 반드시 끝난다.
 */
export function stripFenceMarkers(text: string): string {
  let current = text;

  for (;;) {
    let next = current;

    for (const marker of FENCE_MARKERS) {
      next = next.split(marker).join("");
    }

    if (next === current) {
      return current;
    }

    current = next;
  }
}

export type FencedItem = {
  /** 몇 번째 자료인가. 답에서 이 번호로 가리킨다. */
  index: number;
  /** 어디서 나온 것인가. 이것도 사용자가 적은 값이라 함께 지운다. */
  origin: string;
  /** 담긴 글. */
  text: string;
};

/**
 * 자료 하나를 울타리에 넣는다.
 *
 * 번호와 출처를 **여는 표시 안의 속성으로 넣지 않는다.** 속성으로 넣으면
 * 그것도 글자일 뿐이라 자료 안에서 흉내 낼 수 있다. 표시는 고정된 글자
 * 하나로 두고, 번호와 출처는 울타리 안 첫 줄에 적는다.
 *
 * 그래도 첫 줄을 흉내 내는 것은 막지 못한다. 막을 수 있는 것은 **항목의
 * 개수**뿐이고, 그것을 여는 표시를 지워 막는다. 개수가 맞으면 번호가
 * 어긋나도 답이 가리키는 곳을 우리가 다시 확인할 수 있다.
 */
export function fenceItem(item: FencedItem): string {
  const origin = stripFenceMarkers(item.origin).replace(/\s+/g, " ").trim();
  const text = stripFenceMarkers(item.text);

  return [
    FENCE_OPEN,
    `${item.index}번 · 출처: ${origin.length > 0 ? origin : "적혀 있지 않음"}`,
    text,
    FENCE_CLOSE,
  ].join("\n");
}

/** 여러 자료를 나란히 감싼다. 사이를 빈 줄로 띄워 경계를 눈에 보이게 둔다. */
export function fenceItems(items: readonly FencedItem[]): string {
  return items.map(fenceItem).join("\n\n");
}

/**
 * 물음을 울타리에 넣는다.
 *
 * **물음도 감싼다.** 물음은 사용자가 지금 친 글이라 자료보다 믿을 만하지만,
 * 감싸지 않으면 물음과 자료의 경계가 글자만으로 갈린다. 둘 다 울타리에
 * 넣어야 "울타리 밖은 우리가 쓴 것"이라는 규칙이 단순해진다.
 */
export function fenceQuestion(question: string): string {
  return [
    QUESTION_OPEN,
    stripFenceMarkers(question),
    QUESTION_CLOSE,
  ].join("\n");
}
