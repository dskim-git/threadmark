/**
 * Source 유형·상태 정의와 화면 표시 이름.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 * 데이터베이스의 source_type, source_status 열거형과 어긋나면 컴파일 단계에서
 * 드러나도록 생성된 타입에 satisfies로 묶어둔다.
 */

import type { Database } from "@/lib/supabase/database.types";

type DatabaseSourceType = Database["public"]["Enums"]["source_type"];
type DatabaseSourceStatus = Database["public"]["Enums"]["source_status"];

/** 설계 문서 5.1절의 자료 유형. 순서는 화면에 보여줄 순서다. */
export const SOURCE_TYPES = [
  "paper",
  "book",
  "website",
  "music",
  "youtube",
  "media",
  "pdf",
  "image",
  "drawing",
  "audio",
  "note",
] as const satisfies readonly DatabaseSourceType[];

export type SourceType = (typeof SOURCE_TYPES)[number];

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  paper: "논문",
  book: "책",
  website: "웹사이트",
  music: "음악",
  youtube: "YouTube",
  media: "영화·드라마",
  pdf: "PDF",
  image: "이미지",
  drawing: "손글씨·그림",
  audio: "음성",
  note: "메모",
};

/**
 * 알 수 없는 값을 자료 유형으로 받아들이지 않는다.
 *
 * 생성된 타입은 컴파일 시점의 약속일 뿐이다. 마이그레이션 후 타입을 다시
 * 생성하지 않으면 코드와 실제 스키마가 어긋날 수 있으므로 한 번 더 확인한다.
 */
export function isSourceType(value: unknown): value is SourceType {
  return (
    typeof value === "string" &&
    (SOURCE_TYPES as readonly string[]).includes(value)
  );
}

export function getSourceTypeLabel(value: unknown): string {
  return isSourceType(value) ? SOURCE_TYPE_LABELS[value] : "기타";
}

/**
 * 자료 상태. (설계 문서 8.4절)
 *
 *   active            손에 있는 자료. 보통의 자료다.
 *   reading_candidate 아직 등록하지 않은 논문. 제목만 담아둔 것.
 *
 * 후보를 따로 둔 표가 아니라 상태 하나로 두는 이유는, 담아두는 순간부터
 * 관계로 이을 수 있고 서지 정보와 분석 서식도 그대로 쓰기 때문이다.
 * 정식 자료로 바꾸는 것은 상태를 바꾸는 일이고, 옮겨 담을 것이 없다.
 *
 * 되돌릴 수는 없다. 데이터베이스 가드가 후보에서 정식으로 가는 방향만 받는다.
 */
export const SOURCE_STATUSES = [
  "active",
  "reading_candidate",
] as const satisfies readonly DatabaseSourceStatus[];

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  active: "정식 자료",
  reading_candidate: "읽을 후보",
};

/**
 * 알 수 없는 값을 자료 상태로 받아들이지 않는다.
 *
 * 화면에서는 모르는 상태를 만나면 보통의 자료로 본다. 상태는 접근 통제가
 * 아니라 표시에만 쓰이고, 여기서 막으면 자료 자체가 보이지 않게 된다.
 */
export function isSourceStatus(value: unknown): value is SourceStatus {
  return (
    typeof value === "string" &&
    (SOURCE_STATUSES as readonly string[]).includes(value)
  );
}

export function getSourceStatusLabel(value: unknown): string {
  return isSourceStatus(value) ? SOURCE_STATUS_LABELS[value] : "정식 자료";
}

/** 아직 손에 없는 논문인지. 화면이 표시와 안내를 가를 때 쓴다. */
export function isReadingCandidate(value: unknown): boolean {
  return value === "reading_candidate";
}

/** 유형별로 URL 입력이 자연스러운지. 화면에서 입력란 안내 문구를 고를 때 쓴다. */
export function usesUrl(type: SourceType): boolean {
  return type !== "note" && type !== "drawing";
}
