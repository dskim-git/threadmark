/**
 * 목록을 늘어놓는 방법. (자료 목록과 논문 목록)
 *
 * 화면이 이 정의로 고르는 줄을 그리고, 조회 계층이 같은 정의로 정렬한다.
 * 두 곳에 적으면 화면에는 있는데 눌러도 아무 일이 없는 항목이 생긴다.
 *
 * 주소에 남는 값이라 짧은 영문으로 둔다. 사람이 읽는 이름은 여기서 붙인다.
 * 모르는 값이 들어오면 기본값으로 본다. 주소는 사용자가 고쳐 쓸 수 있고,
 * 오래된 즐겨찾기에는 없어진 값이 남아 있을 수 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

export type SourceSort = "recent" | "updated" | "title" | "oldest";

export const SOURCE_SORTS: readonly {
  value: SourceSort;
  label: string;
  /** 데이터베이스 열과 방향. 조회 계층이 그대로 쓴다. */
  column: "created_at" | "updated_at" | "title";
  ascending: boolean;
}[] = [
  {
    value: "recent",
    label: "최근에 담은 순",
    column: "created_at",
    ascending: false,
  },
  {
    value: "updated",
    label: "최근에 손댄 순",
    column: "updated_at",
    ascending: false,
  },
  { value: "title", label: "제목순", column: "title", ascending: true },
  {
    value: "oldest",
    label: "오래된 순",
    column: "created_at",
    ascending: true,
  },
];

export const DEFAULT_SOURCE_SORT: SourceSort = "recent";

export function isSourceSort(value: unknown): value is SourceSort {
  return SOURCE_SORTS.some((sort) => sort.value === value);
}

/** 주소에서 읽은 값을 정렬로 바꾼다. 모르는 값은 기본값이다. */
export function readSourceSort(value: unknown): SourceSort {
  return isSourceSort(value) ? value : DEFAULT_SOURCE_SORT;
}

export function sourceSortOrder(sort: SourceSort) {
  const found = SOURCE_SORTS.find((item) => item.value === sort);

  // 목록에 없는 값이 여기까지 오지 않지만, 와도 기본 정렬로 돌려준다.
  return found ?? SOURCE_SORTS[0];
}

/**
 * 논문 목록의 정렬.
 *
 * 자료 목록과 항목이 다르다. 그 화면은 제목으로 찾고, 논문 목록은 참고문헌을
 * 보는 자리라 발행 연도가 먼저다. 같은 목록으로 묶으면 양쪽 모두 어정쩡해진다.
 */
export type PaperSort = "year_desc" | "year_asc" | "recent" | "citation";

export const PAPER_SORTS: readonly { value: PaperSort; label: string }[] = [
  { value: "year_desc", label: "발행 연도 최신순" },
  { value: "year_asc", label: "발행 연도 오래된 순" },
  { value: "recent", label: "최근에 담은 순" },
  { value: "citation", label: "참고문헌 가나다순" },
];

export const DEFAULT_PAPER_SORT: PaperSort = "year_desc";

export function isPaperSort(value: unknown): value is PaperSort {
  return PAPER_SORTS.some((sort) => sort.value === value);
}

export function readPaperSort(value: unknown): PaperSort {
  return isPaperSort(value) ? value : DEFAULT_PAPER_SORT;
}

/**
 * 목록을 보여주는 모양.
 *
 *   격자  한 눈에 여러 개가 들어온다. 자료가 적을 때 좋다.
 *   목록  제목이 잘리지 않고 아래로 훑기 좋다. 쌓이면 이쪽이다.
 */
export type ListView = "grid" | "list";

export const DEFAULT_LIST_VIEW: ListView = "grid";

export function readListView(value: unknown): ListView {
  return value === "list" ? "list" : DEFAULT_LIST_VIEW;
}
