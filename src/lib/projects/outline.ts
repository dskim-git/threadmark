/**
 * 뼈대를 나무 모양으로 세운다. (19-A, 설계 문서 7.3절)
 *
 * 데이터베이스는 자리를 한 줄씩 담는다. `parent_id`와 `position`만 있고
 * **깊이도 번호도 담지 않는다.** 그것을 여기서 센다.
 *
 * 왜 담지 않는가
 *   깊이를 담으면 가지를 통째로 옮길 때마다 그 아래 전부를 다시 써야 한다.
 *   번호를 담으면 자리를 하나 옮길 때마다 뒤따르는 번호가 전부 어긋난다.
 *   둘 다 언제든 다시 셀 수 있는 값이라, 담아두면 어긋날 자리만 생긴다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** 검사가 이 셈만 따로 들여다볼
 * 수 있어야 한다. 뼈대가 잘못 세워지면 화면에서 자리가 사라지거나 엉뚱한
 * 곳에 붙는데, 그것을 브라우저에서 눈으로 찾는 것은 어렵다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 데이터베이스에서 그대로 읽어 온 자리 하나. */
export type OutlineRow = {
  id: string;
  parentId: string | null;
  title: string;
  body: string | null;
  position: number;
};

/** 화면이 그릴 자리 하나. 나무를 평평하게 펼쳐 놓은 것이다. */
export type OutlineItem = OutlineRow & {
  /** 맨 위가 0. */
  depth: number;
  /** `1`, `1.2`, `1.2.3`. 순서를 보고 센 것이라 담기지 않는다. */
  number: string;
  /** 아래에 자리가 몇이나 있는가. 자기 자신은 세지 않는다. */
  descendantCount: number;
};

/**
 * 한 줄씩 담긴 자리들을 **그릴 순서대로** 펼친다.
 *
 * 나무를 중첩된 모양으로 돌려주지 않고 평평한 목록으로 돌려준다. 화면이
 * 들여쓰기만 하면 되고, 깊이가 몇 단이든 재귀 없이 그릴 수 있다.
 * 깊이에 한계가 없으므로 **화면이 재귀로 그리면 깊어질수록 위태로워진다.**
 *
 * 부모를 찾지 못한 자리는 **맨 윗칸으로 올린다.** 버리지 않는다. 데이터가
 * 어긋났을 때 조용히 사라지는 것이 가장 나쁘다. 사용자는 지워진 줄 안다.
 */
export function buildOutline(
  rows: readonly OutlineRow[],
): readonly OutlineItem[] {
  const children = new Map<string | null, OutlineRow[]>();
  const known = new Set(rows.map((row) => row.id));

  for (const row of rows) {
    /*
      부모가 목록에 없으면 맨 윗칸으로 본다.

      정상이라면 생기지 않는다. 다만 자기 자신을 부모로 둔 행이나 끊어진
      가지가 있어도 화면에서 통째로 사라지지 않게 한다.
    */
    const parent =
      row.parentId !== null && known.has(row.parentId) && row.parentId !== row.id
        ? row.parentId
        : null;

    const group = children.get(parent);

    if (group) {
      group.push(row);
    } else {
      children.set(parent, [row]);
    }
  }

  // 형제끼리 순서대로. 같은 순서면 이름으로 가른다. 화면이 흔들리지 않게.
  for (const group of children.values()) {
    group.sort(
      (a, b) => a.position - b.position || a.title.localeCompare(b.title),
    );
  }

  const flat: OutlineItem[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: string) => {
    const group = children.get(parentId) ?? [];

    group.forEach((row, index) => {
      /*
        같은 자리를 두 번 그리지 않는다.

        고리가 있으면 영영 돈다. 데이터베이스가 막고 있지만 화면이 그것에만
        기대지 않는다. 그리다 멈추지 않는 화면은 새로고침으로도 못 고친다.
      */
      if (seen.has(row.id)) {
        return;
      }

      seen.add(row.id);

      const number = prefix === "" ? `${index + 1}` : `${prefix}.${index + 1}`;
      const at = flat.length;

      flat.push({ ...row, depth, number, descendantCount: 0 });

      walk(row.id, depth + 1, number);

      // 자기 뒤에 붙은 것이 곧 자손이다. 세느라 다시 훑지 않는다.
      flat[at].descendantCount = flat.length - at - 1;
    });
  };

  walk(null, 0, "");

  return flat;
}

/**
 * 화면에서 들여쓸 칸 수.
 *
 * **담는 깊이에는 한계가 없지만 들여쓰기에는 있다.** 좁은 화면에서 계속
 * 들여쓰면 글자가 설 자리가 없어진다. 일정 단을 넘으면 더 들여쓰지 않고
 * 자리는 그대로 이어 붙는다. (설계 문서 7.3절)
 */
export const MAX_INDENT_STEPS = 6;

export function indentSteps(depth: number): number {
  return Math.min(Math.max(depth, 0), MAX_INDENT_STEPS);
}

/**
 * 형제들 사이에서 한 칸 옮겼을 때의 새 순서.
 *
 * 자리를 옮기는 일은 **두 자리의 순서를 맞바꾸는 것**으로 한다. 전체를 다시
 * 매기지 않는 이유는, 그러면 옮길 때마다 형제 전부를 고쳐야 하고 그중 하나가
 * 실패하면 순서가 반쯤 어긋난 채로 남기 때문이다.
 *
 * 맨 끝에서 더 가려 하면 `null`이다. 부르는 쪽이 아무것도 하지 않는다.
 */
export function neighborToSwap(
  siblings: readonly OutlineRow[],
  id: string,
  direction: "up" | "down",
): OutlineRow | null {
  const ordered = [...siblings].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title),
  );

  const index = ordered.findIndex((row) => row.id === id);

  if (index < 0) {
    return null;
  }

  const target = direction === "up" ? index - 1 : index + 1;

  return ordered[target] ?? null;
}
