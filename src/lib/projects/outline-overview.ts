/**
 * 조망이 답하는 "지금 어디까지 했나". (19-C, 설계 문서 7.5절)
 *
 * 뼈대를 펼쳐 보여주는 것만으로는 모자란다. 자리가 스물이면 스크롤하면서
 * 세게 되고, 세다 보면 **무엇을 세고 있었는지를 잊는다.** 맨 위 한 줄이
 * 그 답을 먼저 준다.
 *
 * **비어 있다고 말할 자리를 고르는 것이 이 파일의 전부다.**
 *
 * 아래로 나뉜 자리는 비었다고 세지 않는다. `2. 이론적 배경`이 그 아래
 * `2.1`·`2.2`로 나뉘어 있으면 거기에 글이 없는 것이 정상이다. 글은 나뉜
 * 쪽에 있다. 그것을 빈 자리로 세면 **아무 문제 없는 뼈대가 절반이 비었다고
 * 나온다.** 그렇게 한 번 거짓말한 숫자는 그 뒤로 아무도 보지 않는다.
 *
 * 그래서 **끝자리만 센다.** 나뉘지 않은 자리, 곧 글이 거기 있어야 하는
 * 자리다. 세 갈래로 나뉘고 셋을 더하면 끝자리 수가 된다. 어긋날 자리가 없다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** `outline.ts`와 같은 이유다.
 * 검사가 이 셈만 따로 들여다볼 수 있어야 하고, 셈이 틀리면 화면의 숫자가
 * 조용히 틀린다. 숫자는 틀려도 화면이 멀쩡해 보여서 눈으로 잡기 어렵다.
 *
 * 받는 값을 `OutlineItem`으로 적지 않고 필요한 칸만 적은 이유도 그것이다.
 * `placement-queries`는 데이터베이스를 물고 있어서 여기로 끌어올 수 없다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 이 셈에 필요한 것만. `OutlineItem`이 그대로 들어맞는다. */
export type ProgressRow = {
  id: string;
  body: string | null;
  /** 아래에 자리가 몇이나 있는가. 0이면 끝자리다. */
  descendantCount: number;
};

/**
 * 자리 하나가 어떤 상태인가.
 *
 * | 값 | 뜻 |
 * | --- | --- |
 * | `written` | 글을 썼다 |
 * | `material-only` | 재료는 놓았는데 글이 아직 없다 |
 * | `branch` | 아래로 나뉘어 있다. 글은 나뉜 쪽에 있다 |
 * | `empty` | 아직 아무것도 없다 |
 *
 * `branch`가 따로 있는 것이 핵심이다. 없으면 나뉜 자리가 `empty`로 묶여
 * **뚫린 곳과 나뉜 곳이 화면에서 같아 보인다.**
 */
export type NodeState = "written" | "material-only" | "branch" | "empty";

export function nodeState(row: ProgressRow, placedCount: number): NodeState {
  /*
    글이 먼저다. 나뉜 자리에도 글을 쓸 수 있고, 썼으면 쓴 것이다.
    나뉘었는지를 먼저 보면 써둔 글이 `branch`에 묻힌다.
  */
  if (hasText(row.body)) {
    return "written";
  }

  if (row.descendantCount > 0) {
    return "branch";
  }

  return placedCount > 0 ? "material-only" : "empty";
}

/** 맨 위 한 줄이 쓰는 값들. */
export type OutlineProgress = {
  /** 자리 전부. 나뉜 것까지 센다. */
  total: number;
  /** 글이 있는 자리 전부. 끝자리인지는 보지 않는다. */
  withBody: number;
  /** 놓인 재료 전부. */
  placedTotal: number;

  /*
    아래 넷은 **끝자리만** 센다. `written + materialOnly + empty === leaves`가
    늘 참이다. 화면이 이 넷으로 막대를 그린다.
  */
  /** 글이 거기 있어야 하는 자리. 나뉘지 않은 자리다. */
  leaves: number;
  written: number;
  materialOnly: number;
  empty: number;
};

export function summarizeOutline(
  rows: readonly ProgressRow[],
  placedCounts: ReadonlyMap<string, number>,
): OutlineProgress {
  const progress: OutlineProgress = {
    total: rows.length,
    withBody: 0,
    placedTotal: 0,
    leaves: 0,
    written: 0,
    materialOnly: 0,
    empty: 0,
  };

  for (const row of rows) {
    const placed = placedCounts.get(row.id) ?? 0;

    progress.placedTotal += placed;

    if (hasText(row.body)) {
      progress.withBody += 1;
    }

    // 나뉜 자리는 갈래 셈에서 뺀다. 이 파일 머리말이 그 이유다.
    if (row.descendantCount > 0) {
      continue;
    }

    progress.leaves += 1;

    switch (nodeState(row, placed)) {
      case "written":
        progress.written += 1;
        break;
      case "material-only":
        progress.materialOnly += 1;
        break;
      default:
        progress.empty += 1;
    }
  }

  return progress;
}

/**
 * 글이 있다고 볼 것인가.
 *
 * **빈칸과 줄바꿈만 있는 것은 없는 것으로 본다.** 글 칸을 열었다 닫으면
 * 줄바꿈 하나가 남는 일이 있는데, 그것을 글로 세면 **쓰지 않은 자리가
 * 썼다고 나온다.** 조망이 거짓말하는 쪽이 아무것도 안 하는 쪽보다 나쁘다.
 */
function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
