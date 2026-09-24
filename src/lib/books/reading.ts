/**
 * 읽기 기록의 값과 셈. (15-E-2a, 설계 문서 12절)
 *
 * 데이터베이스의 열거형과 같은 값을 쓴다. 두 곳에 나눠 적으면 한쪽만
 * 갱신되어 어긋나므로, 여기서 한 번 적고 화면과 검증이 이것을 본다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

import type { Database } from "@/lib/supabase/database.types";

/** `book_reading_status` 열거형과 같은 값. */
export const READING_STATUSES = [
  "unread",
  "reading",
  "finished",
] as const satisfies readonly Database["public"]["Enums"]["book_reading_status"][];

export type ReadingStatus = (typeof READING_STATUSES)[number];

/** `book_holding` 열거형과 같은 값. */
export const HOLDINGS = [
  "paper",
  "ebook",
  "borrowed",
] as const satisfies readonly Database["public"]["Enums"]["book_holding"][];

export type Holding = (typeof HOLDINGS)[number];

/**
 * 화면에 보이는 이름.
 *
 * `쌓아둠`이 아니라 `아직 안 읽음`으로 적는다. 사두고 안 읽은 것을 가리키는
 * 말이 재미있기는 해도, 도서관에서 빌려 오늘 담은 책에는 맞지 않는다.
 * 읽지 않았다는 사실만 말하는 쪽이 어느 경우에나 맞다.
 */
export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "아직 안 읽음",
  reading: "읽는 중",
  finished: "다 읽음",
};

export const HOLDING_LABELS: Record<Holding, string> = {
  paper: "종이책",
  ebook: "전자책",
  borrowed: "빌린 책",
};

/** 모르는 값을 상태로 받아들이지 않는다. */
export function isReadingStatus(value: unknown): value is ReadingStatus {
  return (
    typeof value === "string" &&
    (READING_STATUSES as readonly string[]).includes(value)
  );
}

export function isHolding(value: unknown): value is Holding {
  return (
    typeof value === "string" && (HOLDINGS as readonly string[]).includes(value)
  );
}

/**
 * 몇 퍼센트까지 읽었나. 셀 수 없으면 `null`이다.
 *
 * **셀 수 없는 경우를 0으로 돌려주지 않는다.** 0%는 "펴지도 않았다"는
 * 뜻이고 `null`은 "모른다"는 뜻이다. 둘을 같게 만들면 총 쪽수를 안 적은
 * 책이 전부 시작도 안 한 것처럼 보인다.
 *
 * 총 쪽수가 0인 책은 나눌 수 없다. 담을 수는 있는 값이라(0 이상) 여기서
 * 막아야 한다. 나누면 `Infinity`나 `NaN`이 막대 너비로 들어간다.
 */
export function readingProgress(
  currentPage: number | null,
  totalPages: number | null,
): number | null {
  if (
    currentPage === null ||
    totalPages === null ||
    !Number.isFinite(currentPage) ||
    !Number.isFinite(totalPages) ||
    totalPages <= 0 ||
    currentPage < 0
  ) {
    return null;
  }

  // 데이터베이스가 현재 쪽이 총 쪽수를 넘지 못하게 막지만, 화면이 그것에만
  // 기대지 않는다. 넘는 값이 들어와도 막대가 칸 밖으로 나가지 않는다.
  const ratio = Math.min(currentPage / totalPages, 1);

  return Math.round(ratio * 100);
}

/**
 * 며칠 걸렸나. 셀 수 없으면 `null`이다.
 *
 * 시작한 날과 끝낸 날을 **모두 센다.** 하루에 다 읽은 책이 0일이 아니라
 * 1일이어야 한다. 0일은 "안 읽었다"로 읽힌다.
 *
 * 날짜만 받는다(`YYYY-MM-DD`). 시각이 섞이면 같은 날도 0.5일이 되고,
 * 시간대에 따라 하루가 밀린다. 담는 칸이 `date`인 이유와 같다.
 */
export function readingDays(
  startedOn: string | null,
  finishedOn: string | null,
): number | null {
  if (!startedOn || !finishedOn) {
    return null;
  }

  const start = Date.parse(`${startedOn}T00:00:00Z`);
  const end = Date.parse(`${finishedOn}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const day = 24 * 60 * 60 * 1000;

  return Math.round((end - start) / day) + 1;
}
