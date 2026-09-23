/**
 * 프로젝트별 논문 활용 계획의 항목 정의. (설계 문서 8.3절)
 *
 * 8.3절이 칸 이름만 적어두었다. 그 목록을 여기 한 곳에 둔다.
 * 화면이 이 정의로 입력란을 그리고, 저장도 같은 정의를 쓴다.
 * 두 곳에 적으면 한쪽만 고쳐져서 저장되지 않는 칸이 생긴다. (14-B와 같다)
 *
 * 분석 서식(8.2절)과 무엇이 다른가
 *   분석 서식은 논문 한 편에 하나다. "이 논문이 무엇을 말하는가"이므로
 *   프로젝트가 몇 개든 답이 같다. 여기는 "내 원고의 어디에 넣을 것인가"라서
 *   프로젝트마다 답이 다르다. 그래서 논문과 프로젝트의 짝마다 하나씩이다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import { countFilled, type FieldSize } from "./analysis-fields.ts";

export type ProjectUseField = {
  /** 데이터베이스 열 이름. 폼의 이름으로도 쓴다. */
  column: string;
  label: string;
  size: FieldSize;
  /** 무엇을 적는 자리인지. 빈 칸 앞에서 막히지 않게 한다. */
  hint?: string;
};

/**
 * 한 칸에 담을 수 있는 길이.
 *
 * 분석 서식보다 짧다. 여기는 논문을 설명하는 자리가 아니라 "내 원고의 어디에
 * 어떻게 넣을지"를 적는 자리다. 길어지면 분석 서식에 적어야 할 내용이
 * 이쪽으로 넘어온 것이다.
 *
 * 마이그레이션의 제약과 같은 숫자여야 한다.
 * 어긋나면 입력은 되는데 저장이 안 되는 칸이 생긴다.
 */
export const MAX_USE_SHORT_LENGTH = 200;
export const MAX_USE_LONG_LENGTH = 2000;

/**
 * 설계 문서 8.3절의 칸들.
 *
 * `status`는 여기 없다. 글이 아니라 고르는 값이라서 아래에 따로 둔다.
 */
export const PROJECT_USE_FIELDS: readonly ProjectUseField[] = [
  {
    column: "planned_section",
    label: "원고의 어느 부분에서",
    size: "short",
    hint: "서론, 이론적 배경, 연구 방법, 논의 등",
  },
  {
    column: "usage_intent",
    label: "무엇을 위해 쓸지",
    size: "long",
    hint: "내 주장의 근거로, 반론 상대로, 방법을 따라 하려고 등",
  },
  {
    column: "interpretation",
    label: "이 프로젝트에서의 해석",
    size: "long",
    hint: "같은 논문도 프로젝트에 따라 다르게 읽힌다. 여기서 어떻게 읽었는지",
  },
  {
    column: "citation_plan",
    label: "인용 계획",
    size: "long",
    hint: "직접 인용할지 바꾸어 쓸지, 어느 쪽이나 표를 가리킬지",
  },
  {
    column: "cautions",
    label: "이 프로젝트에서 쓸 때의 주의점",
    size: "long",
    hint: "맥락이 달라 그대로 옮기면 안 되는 것",
  },
];

/** 데이터베이스 열 이름만. 마이그레이션과 맞는지 검사가 확인한다. */
export const PROJECT_USE_COLUMNS: readonly string[] = PROJECT_USE_FIELDS.map(
  (field) => field.column,
);

/** 칸 하나에 담을 수 있는 길이. 화면과 서버가 같은 값을 쓴다. */
export function maxLengthFor(field: ProjectUseField): number {
  return field.size === "short" ? MAX_USE_SHORT_LENGTH : MAX_USE_LONG_LENGTH;
}

/**
 * 계획의 상태. (설계 문서 8.3절의 `status`)
 *
 * 값이 정의되어 있지 않아 두 개를 정했다. 논문이 여러 편 쌓이면
 * "어느 것을 이미 원고에 넣었더라"가 곧 물음이 된다. 그 물음에 답하는 것이
 * 이 칸의 유일한 일이다.
 *
 * 마이그레이션의 열거형과 같아야 한다. 어긋나면 고를 수는 있는데
 * 저장할 때 데이터베이스가 거부한다.
 */
export const PAPER_USE_STATUSES = [
  { value: "planned", label: "쓸 예정" },
  { value: "used", label: "원고에 넣음" },
] as const;

export type PaperUseStatus = (typeof PAPER_USE_STATUSES)[number]["value"];

export const DEFAULT_PAPER_USE_STATUS: PaperUseStatus = "planned";

/**
 * 아는 상태값인지 확인한다.
 *
 * 모르면 거부하지 않고 기본값으로 본다. 상태는 접근 통제가 아니라 표시에만
 * 쓰이고, 여기서 막으면 계획 전체를 읽지 못하게 된다. 적어둔 글을 보여주는
 * 쪽이 낫다. (보안 원칙 7이 말하는 자리가 아니다)
 */
export function isPaperUseStatus(value: unknown): value is PaperUseStatus {
  return PAPER_USE_STATUSES.some((status) => status.value === value);
}

export function getPaperUseStatusLabel(value: PaperUseStatus): string {
  return (
    PAPER_USE_STATUSES.find((status) => status.value === value)?.label ?? value
  );
}

/**
 * 몇 칸을 채웠는지 센다.
 *
 * 분석 서식과 셈법이 같아서 그 함수를 그대로 쓴다. 두 벌을 두면 한쪽만
 * 고쳐질 뿐이고, 여기서 다르게 세어야 할 이유가 없다.
 */
export function countUseFilled(
  values: Readonly<Record<string, string | null | undefined>>,
): number {
  return countFilled(values, PROJECT_USE_FIELDS);
}
