/**
 * 자료끼리의 관계 종류와 화면 표시 이름. (설계 문서 8.4절)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 * 데이터베이스의 source_relation_type 열거형과 어긋나면 컴파일 단계에서
 * 드러나도록 생성된 타입에 satisfies로 묶어둔다. (types.ts와 같은 방식)
 *
 * 논문 전용이 아니다. 13.1절이 같은 표를 음악에도 쓴다. 여기 있는 여덟 가지는
 * 논문용이고, 음악용은 15단계에서 더한다.
 */

import type { Database } from "@/lib/supabase/database.types";

type DatabaseRelationType =
  Database["public"]["Enums"]["source_relation_type"];

/** 설계 문서 8.4절의 여덟 가지. 순서는 문서 순서이자 화면에 보여줄 순서다. */
export const SOURCE_RELATION_TYPES = [
  "cites",
  "cited_by",
  "found_in_references",
  "similar_study",
  "contradicts",
  "theoretical_basis",
  "method_reference",
  "follow_up_reading",
] as const satisfies readonly DatabaseRelationType[];

export type SourceRelationType = (typeof SOURCE_RELATION_TYPES)[number];

const SOURCE_RELATION_LABELS: Record<SourceRelationType, string> = {
  cites: "인용함",
  cited_by: "인용됨",
  found_in_references: "참고문헌에서 발견",
  similar_study: "유사 연구",
  contradicts: "상반된 결과",
  theoretical_basis: "이론적 배경",
  method_reference: "연구 방법 참고",
  follow_up_reading: "후속 읽기",
};

/**
 * 고를 때 헷갈리는 것을 풀어 쓴 말.
 *
 * 관계에는 방향이 있다. 모두 **이 자료에서 상대 자료로** 가는 방향으로 읽는다.
 * 그 약속을 모르면 `인용함`과 `인용됨` 앞에서 멈춘다.
 */
const SOURCE_RELATION_HINTS: Record<SourceRelationType, string> = {
  cites: "이 자료가 상대를 인용한다",
  cited_by: "상대가 이 자료를 인용했다",
  found_in_references: "이 자료의 참고문헌에서 상대를 찾았다",
  similar_study: "같은 것을 다룬 다른 연구다",
  contradicts: "이 자료와 어긋나는 결과가 나왔다",
  theoretical_basis: "이 자료가 기대고 있는 이론이다",
  method_reference: "연구 방법을 여기서 빌려왔거나 빌려올 것이다",
  follow_up_reading: "이 자료 다음으로 읽을 것이다",
};

/**
 * 알 수 없는 값을 관계 종류로 받아들이지 않는다.
 *
 * 생성된 타입은 컴파일 시점의 약속일 뿐이다. 마이그레이션 후 타입을 다시
 * 생성하지 않으면 코드와 실제 스키마가 어긋날 수 있으므로 한 번 더 확인한다.
 */
export function isSourceRelationType(
  value: unknown,
): value is SourceRelationType {
  return (
    typeof value === "string" &&
    (SOURCE_RELATION_TYPES as readonly string[]).includes(value)
  );
}

export function getSourceRelationLabel(value: unknown): string {
  return isSourceRelationType(value)
    ? SOURCE_RELATION_LABELS[value]
    : "관련 자료";
}

export function getSourceRelationHint(value: SourceRelationType): string {
  return SOURCE_RELATION_HINTS[value];
}

/** 화면의 선택 상자에 그대로 넣을 수 있는 모양. */
export const SOURCE_RELATION_OPTIONS: readonly {
  value: SourceRelationType;
  label: string;
  hint: string;
}[] = SOURCE_RELATION_TYPES.map((value) => ({
  value,
  label: SOURCE_RELATION_LABELS[value],
  hint: SOURCE_RELATION_HINTS[value],
}));
