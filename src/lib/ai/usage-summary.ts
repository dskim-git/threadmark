/**
 * 장부에서 읽어온 줄을 사람별·갈래별로 세는 순수 셈. (설계 문서 19-E.4절)
 *
 * 왜 세는 일을 따로 떼어 두는가
 *   조회는 `usage-queries.ts`가 하고 판단은 `limits.ts`가 한다. 그 사이에
 *   "받아온 줄을 어떻게 묶는가"가 있고, 그것이 틀리면 **오류 없이 숫자만
 *   틀린다.** 그런 자리는 검사로 붙잡아야 해서 따로 뺐다.
 *
 * **이 파일은 아무것도 import하지 않는다.** `npm test`는 `node --test`로
 *   도는데 `@/` 별칭도 확장자 없는 상대 경로도 풀지 못한다. 검사가 부르는
 *   모듈은 잎사귀로 둔다. (AGENTS.md 2절)
 */

/**
 * 장부에 남는 갈래. 데이터베이스의 `ai_feature`와 같은 값이다.
 *
 * **여기와 데이터베이스가 어긋나면 장부에 못 쓴다.** 값을 더하려면
 * 마이그레이션을 따로 하나 만들고(`ALTER TYPE ... ADD VALUE`는 같은
 * 트랜잭션에서 쓸 수 없다), 그것을 올린 뒤 여기에 더한다.
 */
export const AI_FEATURES = ["translation", "search", "placement"] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

/**
 * 화면에 보일 이름.
 *
 * 갈래 이름을 영문 그대로 보여주지 않는다. 관리자가 보는 물음은 "얼마나
 * 썼는가" 하나가 아니라 **"왜 이 달에 많이 나왔는가"**이기도 해서,
 * 그 자리에서 읽히는 말이어야 한다.
 */
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  translation: "번역",
  search: "검색",
  placement: "자리 추천",
};

export type FeatureTally = {
  /** 몇 번 불렀는가. **모르는 갈래도 여기에 들어 있다.** */
  total: number;
  /** 아는 갈래별 횟수. */
  byFeature: Record<AiFeature, number>;
  /**
   * 우리가 모르는 갈래로 부른 횟수.
   *
   * 데이터베이스에 값이 먼저 늘고 코드가 아직 모를 때 생긴다. 갈래별
   * 칸에만 세면 그 줄이 **조용히 사라져** 합이 덜 나온다. 덜 나오는 것은
   * 틀린 것처럼 보이지 않는다. (AGENTS.md 7절) 그래서 따로 센다.
   */
  unknown: number;
};

/** 한 번도 부르지 않은 사람의 셈. */
export function emptyTally(): FeatureTally {
  return {
    total: 0,
    byFeature: { translation: 0, search: 0, placement: 0 },
    unknown: 0,
  };
}

function isAiFeature(value: string): value is AiFeature {
  return (AI_FEATURES as readonly string[]).includes(value);
}

/**
 * 장부 줄을 사람별로 묶어 갈래까지 센다.
 *
 * 줄이 없는 사람은 **열쇠 자체가 없다.** 0으로 채워 돌려주지 않는 까닭은,
 * 이 함수가 누가 있는지 모르기 때문이다. 사람 목록은 부르는 쪽이 안다.
 */
export function tallyByOwner(
  rows: readonly { owner_id: string; feature: string }[],
): Map<string, FeatureTally> {
  const tallies = new Map<string, FeatureTally>();

  for (const row of rows) {
    let tally = tallies.get(row.owner_id);

    if (!tally) {
      tally = emptyTally();
      tallies.set(row.owner_id, tally);
    }

    tally.total += 1;

    if (isAiFeature(row.feature)) {
      tally.byFeature[row.feature] += 1;
    } else {
      tally.unknown += 1;
    }
  }

  return tallies;
}

/**
 * 허용량 줄을 사람별로 더한다.
 *
 * **음수가 섞여 있다.** 잘못 준 것을 되돌린 줄이다. 지우는 대신 음수로 한
 * 줄 더 남기기로 했으므로(19-E.2), 그대로 더하면 되돌린 뒤의 값이 나온다.
 *
 * 합이 음수가 될 수 있다. 그것을 기본 한도 아래로 내려가지 않게 막는 일은
 * `limitWithGrants`가 한다. 여기서는 더하기만 한다.
 */
export function sumGrantsByOwner(
  rows: readonly { owner_id: string; extra_calls: number }[],
): Map<string, number> {
  const sums = new Map<string, number>();

  for (const row of rows) {
    sums.set(row.owner_id, (sums.get(row.owner_id) ?? 0) + row.extra_calls);
  }

  return sums;
}
