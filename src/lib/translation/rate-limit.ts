/**
 * 밖으로 나가는 요청의 횟수 제한.
 *
 * 처음에는 번역만을 위한 것이었다(13-C). 14-C에서 Crossref 조회가 생기면서
 * 세는 규칙을 한 곳에 두고 숫자만 달리 주는 모양으로 바꿨다.
 *
 * 밖으로 나가는 요청 하나하나에 돈이 든다. 길이 제한(types.ts)이 한 건의
 * 크기를 막고, 이것이 건수를 막는다.
 *
 * 무엇을 막는 것이 아닌가
 *   이것은 "이번 달에 얼마를 썼는가"를 세지 않는다. 그 장부는 16단계에서
 *   AI 기능과 함께 만든다. 여기서 하는 일은 버튼을 연타하거나 화면을 거치지
 *   않고 요청을 쏟아붓는 경우를 막는 것뿐이다.
 *
 * 얼마나 믿을 수 있는가
 *   세는 자리가 서버 프로세스의 기억이다. 서버가 여럿이면 각자 따로 센다.
 *   Vercel처럼 요청마다 다른 곳에서 실행될 수 있는 환경에서는 이 한도가
 *   생각보다 헐겁게 걸린다. **진짜 상한은 16단계에서 데이터베이스에 둔다.**
 *   이 모듈을 그 이상으로 믿지 않는다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/** 세는 구간. */
export const TRANSLATION_WINDOW_MS = 60_000;

/**
 * 한 구간에 허용할 건수.
 *
 * 읽으면서 문장을 옮기는 속도를 생각하면 1분에 10번이면 넉넉하다.
 * 사람이 읽고 판단하는 시간이 있어서 그보다 빨라지기 어렵다.
 */
export const TRANSLATION_MAX_PER_WINDOW = 10;

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  /** 막혔을 때 얼마나 기다리면 되는지. 통과했으면 0. */
  retryAfterMs: number;
  /** 이번 판단을 반영한 새 기록. 부르는 쪽이 이것으로 갈아 끼운다. */
  next: readonly number[];
};

/**
 * 한 자리를 쓸 수 있는지 판단한다.
 *
 * 기록을 고쳐 쓰지 않고 새 배열을 돌려준다. 그래야 같은 입력에 늘 같은
 * 결과가 나오고, 검사에서 시각을 직접 넘겨 확인할 수 있다.
 *
 * @param history 지난 요청 시각들. 오래된 것이 앞에 온다.
 * @param now     지금 시각.
 */
export function takeSlot(
  history: readonly number[],
  now: number,
  options: RateLimitOptions,
): RateLimitDecision {
  // 구간을 벗어난 기록은 버린다. 버리지 않으면 기억이 끝없이 늘어난다.
  const recent = history.filter((at) => now - at < options.windowMs);

  if (recent.length < options.max) {
    return { allowed: true, retryAfterMs: 0, next: [...recent, now] };
  }

  // 가장 오래된 기록이 구간을 벗어나야 자리가 하나 생긴다.
  const oldest = recent[0] ?? now;

  return {
    allowed: false,
    retryAfterMs: Math.max(0, options.windowMs - (now - oldest)),
    // 막힌 요청은 세지 않는다. 세면 계속 누르는 동안 영영 풀리지 않는다.
    next: recent,
  };
}

/**
 * 번역 요청용 한도.
 *
 * 세는 규칙은 위의 takeSlot과 같고 숫자만 다르다. 밖으로 나가는 요청이
 * 번역 말고도 생기면서(14-C의 Crossref) 규칙을 한 곳에 두게 됐다.
 */
export function takeTranslationSlot(
  history: readonly number[],
  now: number,
): RateLimitDecision {
  return takeSlot(history, now, {
    windowMs: TRANSLATION_WINDOW_MS,
    max: TRANSLATION_MAX_PER_WINDOW,
  });
}
