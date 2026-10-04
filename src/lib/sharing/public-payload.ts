/**
 * 문이 돌려준 것을 화면이 쓸 모양으로 바꾸고, **한 번 더 막는다.**
 *
 * **이 파일에 다른 것을 import하지 않는다.** 같은 묶음의 `public-fields.ts`만
 * 가져온다. 검사가 이 파일만 따로 들여다볼 수 있어야 한다.
 * (AGENTS.md 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 *
 * 왜 세 겹인가
 *   1. **SQL** — 나가는 칸을 글자로 적은 함수 하나 (`public_project`)
 *   2. **검사** — 그 글을 `public-fields.ts`의 목록과 견준다
 *   3. **여기** — 돌아온 값에 나가면 안 되는 열쇠가 섞여 있으면 **거부한다**
 *
 *   1과 2가 맞으면 3은 아무 일도 하지 않는다. 그래도 두는 까닭은, 이 자리가
 *   **틀렸을 때 남의 글이 밖으로 나가는 자리**라서다. 되돌릴 수 없다.
 *
 *   그리고 3은 다른 것을 잡는다. 1과 2는 **우리가 쓴 SQL**을 보는데, 3은
 *   **실제로 돌아온 값**을 본다. 함수를 손으로 고쳐 올렸거나, 마이그레이션이
 *   덜 적용된 데이터베이스를 보고 있으면 1과 2는 통과하고 3만 안다.
 *
 * 모르면 거부한다
 *   모양이 어긋나면 빈 것으로 넘기지 않고 `null`을 돌려준다. 화면은 "없는
 *   링크"와 같이 다룬다. **덜 보여주는 쪽이 더 보여주는 쪽보다 안전하다.**
 *   (AGENTS.md 5절 7번)
 */

import { NEVER_PUBLIC } from "./public-fields.ts";

/** 공개 화면이 보여주는 메모 하나. */
export type PublicNote = {
  content: string;
};

/** 자료에 딸린 서지. 유형마다 있는 것이 다르다. */
export type PublicProfiles = {
  paper: Record<string, unknown> | null;
  book: Record<string, unknown> | null;
  place: Record<string, unknown> | null;
  website: Record<string, unknown> | null;
  youtube: Record<string, unknown> | null;
  music: Record<string, unknown> | null;
  media: Record<string, unknown> | null;
};

/** 공개 화면이 보여주는 자료 하나. */
export type PublicSource = {
  type: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  captures: readonly PublicNote[];
  profiles: PublicProfiles;
};

/** 뼈대 자리 하나에 놓인 재료. */
export type PublicPlacement = {
  note: string | null;
  sourceTitle: string | null;
  captureContent: string | null;
};

/**
 * 뼈대 자리 하나.
 *
 * **번호가 없다.** `depth`와 목록 순서가 모양을 말한다. 나가는 것은 세워진
 * 모양이지 번호가 아니다.
 */
export type PublicOutlineNode = {
  depth: number;
  title: string | null;
  body: string | null;
  items: readonly PublicPlacement[];
};

export type PublicProject = {
  name: string;
  description: string | null;
  projectType: string | null;
  sources: readonly PublicSource[];
  notes: readonly PublicNote[];
  outline: readonly PublicOutlineNode[];
};

/**
 * 돌아온 값 어디에도 나오면 안 되는 열쇠 이름.
 *
 * `NEVER_PUBLIC`에서 만든다. **손으로 또 적지 않는다.** 두 곳에 적으면
 * 한쪽만 갱신되어 어긋난다.
 *
 * 표 전체를 못 박은 자리(`column`이 `*`)는 여기서 쓰지 않는다. 그쪽은 열쇠
 * 이름이 아니라 표 이름이고, 돌아온 값에는 표 이름이 나오지 않는다.
 */
const FORBIDDEN_KEYS: readonly string[] = NEVER_PUBLIC.filter(
  (field) => field.column !== "*",
).map((field) => field.column);

/**
 * 돌아온 값에 나가면 안 되는 열쇠가 있는가.
 *
 * 깊이를 따라 전부 훑는다. 하나라도 있으면 **그 줄 전체를 버린다.**
 * 그 열쇠만 지우지 않는 까닭은, 섞여 들어온 경로를 모르는 채로 일부만
 * 고치면 다른 자리에도 섞여 있을 수 있기 때문이다.
 */
export function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenKey(item));
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      return true;
    }

    if (hasForbiddenKey(child)) {
      return true;
    }
  }

  return false;
}

/** 글자만 받는다. 비어 있으면 `null`. */
function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    ([, child]) => child !== null && child !== undefined,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function notes(value: unknown): PublicNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => text(record(item)?.content))
    .filter((content): content is string => content !== null)
    .map((content) => ({ content }));
}

/**
 * 문이 돌려준 jsonb를 화면이 쓸 모양으로.
 *
 * **열쇠가 틀렸거나 모양이 어긋나면 `null`이다.** 화면은 그것을 "없는
 * 링크"와 같이 다룬다. 어느 경우인지 구분해 알리지 않는다. (보안 원칙 9)
 */
export function readPublicProject(value: unknown): PublicProject | null {
  const root = record(value);

  if (root === null) {
    return null;
  }

  /*
    **여기서 막는 것이 세 번째 겹이다.**

    돌아온 값에 원문이나 초록 같은 열쇠가 섞여 있으면 화면을 그리지 않는다.
    덜 보여주는 쪽이 더 보여주는 쪽보다 안전하다.
  */
  if (hasForbiddenKey(root)) {
    return null;
  }

  const project = record(root.project);
  const name = text(project?.name);

  // 이름이 없으면 보여줄 것이 없다. 그 자체로 모양이 어긋난 것이다.
  if (name === null) {
    return null;
  }

  const sources = Array.isArray(root.sources) ? root.sources : [];
  const outline = Array.isArray(root.outline) ? root.outline : [];

  return {
    name,
    description: text(project?.description),
    projectType: text(project?.project_type),
    notes: notes(root.notes),
    sources: sources
      .map((item) => record(item))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => ({
        type: text(row.type),
        title: text(row.title),
        subtitle: text(row.subtitle),
        description: text(row.description),
        captures: notes(row.captures),
        profiles: {
          paper: record(row.paper),
          book: record(row.book),
          place: record(row.place),
          website: record(row.website),
          youtube: record(row.youtube),
          music: record(row.music),
          media: record(row.media),
        },
      })),
    outline: outline
      .map((item) => record(item))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => ({
        depth: typeof row.depth === "number" ? row.depth : 0,
        title: text(row.title),
        body: text(row.body),
        items: (Array.isArray(row.items) ? row.items : [])
          .map((item) => record(item))
          .filter((item): item is Record<string, unknown> => item !== null)
          .map((item) => ({
            note: text(item.note),
            sourceTitle: text(item.source_title),
            captureContent: text(item.capture_content),
          }))
          /*
            아무것도 남지 않은 줄은 버린다. 놓아둔 재료가 **지운 것이거나
            기계가 쓴 것**이면 문이 그 값을 비워 돌려준다. 그때 빈 줄이
            화면에 남으면 보는 사람은 고장이라고 여긴다.
          */
          .filter(
            (item) =>
              item.note !== null ||
              item.sourceTitle !== null ||
              item.captureContent !== null,
          ),
      })),
  };
}

/**
 * 공개 화면이 "왜 이것은 안 보이는가"를 적을 때 쓰는 말.
 *
 * **보는 사람에게 없는 것을 없다고 말한다.** 파일 자리에 아무 말도 없으면
 * 올린 파일이 있었다는 것조차 알 수 없고, 올린 사람은 파일이 함께 나간 줄
 * 안다. 16-B.3절이 "파일 자리에는 올린 사람만 볼 수 있습니다라고 적는다"고
 * 정한 것이 이것이다.
 */
export const WITHHELD_NOTICE = [
  "인용한 원문과 번역문, 논문 초록은 공개되지 않습니다.",
  "표지 그림과 올린 파일은 올린 사람만 볼 수 있습니다.",
] as const;
