/**
 * Source 유형 정의와 화면 표시 이름.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 * 데이터베이스의 source_type 열거형과 어긋나면 컴파일 단계에서 드러나도록
 * 생성된 타입에 satisfies로 묶어둔다.
 */

import type { Database } from "@/lib/supabase/database.types";

type DatabaseSourceType = Database["public"]["Enums"]["source_type"];

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

/** 유형별로 URL 입력이 자연스러운지. 화면에서 입력란 안내 문구를 고를 때 쓴다. */
export function usesUrl(type: SourceType): boolean {
  return type !== "note" && type !== "drawing";
}
