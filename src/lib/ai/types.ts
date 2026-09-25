/**
 * AI 물어보기의 말과 모양. (설계 문서 19절)
 *
 * 번역이 그랬듯이(`src/lib/translation/types.ts`) **이 파일에는 어느 회사도
 * 등장하지 않는다.** 바깥에서 보이는 모양은 여기에 적힌 것 하나다.
 *
 * 네트워크 호출과 환경변수 읽기는 여기에 두지 않는다. 단위 검사로 검증한다.
 */

/** 넘길 자료 하나. 자료든 기록이든 같은 모양으로 넘긴다. */
export type AskItem = {
  /** 1부터. 답에서 이 번호로 가리킨다. */
  index: number;
  /** 자료인가 기록인가. 화면에서 어디로 보낼지 가른다. */
  kind: "source" | "capture";
  /**
   * `source:<id>` 또는 `capture:<id>`.
   *
   * **`href`로는 모자란다.** 기록의 `href`는 그 기록이 달린 **자료**의
   * 화면을 가리킨다. 기록 자체를 가리키는 값이 따로 있어야 뼈대의 자리에
   * 놓을 수 있다. (19-D의 `이 자리에 어울리는 것`)
   */
  value: string;
  /** 눌렀을 때 갈 곳. 없으면 누를 수 없다. */
  href: string | null;
  /** 어디서 나온 것인가. 사람이 읽을 한 줄. */
  origin: string;
  /** 넘길 글. */
  text: string;
};

export type AskRequest = {
  question: string;
  items: readonly AskItem[];
};

export type AskFailureReason =
  /** 키가 없다. 기능을 보여주지 않는다. */
  | "not_configured"
  /** 이번 달 한도를 다 썼다. */
  | "over_limit"
  /** 모델이 답하지 않기로 했다. */
  | "refused"
  /** 요청이 몰렸다. 잠시 후 다시. */
  | "rate_limited"
  /** 그 밖의 실패. */
  | "failed";

export type AskResult =
  | {
      ok: true;
      answer: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      ok: false;
      reason: AskFailureReason;
      message: string;
      model: string;
      /**
       * 실패해도 글자 수를 남긴다.
       *
       * **실패한 요청에도 돈이 든다.** 빼면 장부가 적게 센다.
       * 알 수 없으면 0이다. (`ai_usage_events` 마이그레이션 참고)
       */
      inputTokens: number;
      outputTokens: number;
    };

/** 밖에 물어보는 쪽. 나중에 다른 곳을 붙이면 이 모양만 맞추면 된다. */
export type AskProvider = {
  name: string;
  model: string;
  ask(request: AskRequest): Promise<AskResult>;
};
