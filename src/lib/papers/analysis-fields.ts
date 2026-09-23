/**
 * 논문 분석 서식의 항목 정의. (설계 문서 8.2절)
 *
 * 8.2절이 다섯 묶음 32개를 적어두었다. 그 목록을 여기 한 곳에 둔다.
 * 화면이 이 정의로 입력란을 그리고, 검증도 같은 정의를 쓴다.
 * 두 곳에 적으면 한쪽만 고쳐져서 저장되지 않는 칸이 생긴다.
 *
 * 32개 중 둘은 글이 아니라 **관계**라서 여기에 없다.
 *
 *   관련 프로젝트      source_projects가 이미 한다 (11단계)
 *   연결되는 다른 자료  8.4절의 source_relations, 즉 14-D다
 *
 * 글로 또 적게 두면 같은 물음에 답이 두 개가 된다. 어느 쪽이 맞는지
 * 나중에 알 수 없고, 한쪽을 고쳐도 다른 쪽은 그대로 남는다.
 * 그래서 30개만 글로 받고, 나머지 둘은 화면에서 관계를 보여준다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

/** 한 칸의 크기. 화면이 한 줄 입력과 여러 줄 입력을 가른다. */
export type FieldSize = "short" | "long";

export type AnalysisField = {
  /** 데이터베이스 열 이름. 폼의 이름으로도 쓴다. */
  column: string;
  label: string;
  size: FieldSize;
  /** 무엇을 적는 자리인지. 빈 칸 앞에서 막히지 않게 한다. */
  hint?: string;
};

export type AnalysisSection = {
  id: string;
  title: string;
  /** 이 묶음이 무엇을 위한 것인지. */
  purpose: string;
  fields: readonly AnalysisField[];
};

/**
 * 한 칸에 담을 수 있는 길이.
 *
 * 분석은 길게 적는 일이라 넉넉히 둔다. 그래도 상한을 두는 이유는,
 * 논문 본문을 통째로 붙여넣는 것을 막기 위해서다. 그것은 분석이 아니라
 * 사본이고, 자료 자체는 이미 PDF로 붙어 있다.
 */
export const MAX_ANALYSIS_FIELD_LENGTH = 5000;

/**
 * 설계 문서 8.2절의 다섯 묶음.
 *
 * 순서를 바꾸지 않는다. 읽기 전(발견 맥락)부터 읽은 뒤(나의 활용)까지
 * 논문을 읽는 순서를 따라간다. 그래서 위에서 아래로 채워 내려가면 된다.
 */
export const ANALYSIS_SECTIONS: readonly AnalysisSection[] = [
  {
    id: "context",
    title: "발견 맥락",
    purpose: "왜 이 논문을 읽게 됐는지. 나중에 다시 볼 때 가장 먼저 잊는 것이다.",
    fields: [
      {
        column: "discovery_path",
        label: "발견 경로",
        size: "short",
        hint: "어디서 찾았는지. 다른 논문의 참고문헌, 검색, 추천 등",
      },
      {
        column: "first_impression",
        label: "발견 이유와 첫인상",
        size: "long",
        hint: "왜 눈에 띄었는지, 처음 읽고 어떤 느낌이었는지",
      },
      {
        column: "reading_purpose",
        label: "읽는 목적",
        size: "long",
        hint: "무엇을 알고 싶어서 읽는지",
      },
      {
        column: "expected_relevance",
        label: "읽기 전 예상 관련성",
        size: "long",
        hint: "읽고 나서 실제와 견주어 보면, 논문 고르는 눈이 는다",
      },
    ],
  },
  {
    id: "understanding",
    title: "기본 이해",
    purpose: "이 논문이 무엇을 하려는 글인지.",
    fields: [
      { column: "intended_audience", label: "예상 독자", size: "short" },
      { column: "research_topic", label: "연구 주제", size: "long" },
      { column: "research_purpose", label: "연구 목적", size: "long" },
      {
        column: "research_questions",
        label: "연구 문제 또는 연구 질문",
        size: "long",
        hint: "논문에 적힌 그대로 옮겨두면 나중에 인용하기 좋다",
      },
      { column: "key_concepts", label: "주요 개념", size: "long" },
      { column: "theoretical_background", label: "이론적 배경", size: "long" },
    ],
  },
  {
    id: "design",
    title: "연구 설계",
    purpose: "어떻게 했는지. 결과를 얼마나 믿을지가 여기서 갈린다.",
    fields: [
      {
        column: "study_type",
        label: "연구 유형",
        size: "short",
        hint: "양적, 질적, 혼합, 문헌 연구 등",
      },
      { column: "research_method", label: "연구 방법", size: "long" },
      {
        column: "participants",
        label: "연구 참여자·표본",
        size: "long",
        hint: "누구를 몇 명. 내 맥락에 옮길 수 있는지를 여기서 본다",
      },
      { column: "data_collection", label: "자료 수집 방법", size: "long" },
      { column: "analysis_method", label: "분석 방법", size: "long" },
      { column: "study_context", label: "연구 기간과 맥락", size: "long" },
    ],
  },
  {
    id: "content",
    title: "주요 내용",
    purpose: "무엇을 밝혔는지. 논문이 한 말이다.",
    fields: [
      { column: "main_argument", label: "핵심 주장", size: "long" },
      { column: "key_findings", label: "주요 연구 결과", size: "long" },
      { column: "discussion", label: "논의", size: "long" },
      { column: "significance", label: "연구의 의미", size: "long" },
      {
        column: "implications",
        label: "교육적·실천적 시사점",
        size: "long",
      },
      {
        column: "limitations",
        label: "제한점",
        size: "long",
        hint: "논문이 스스로 밝힌 것과 내가 보기에 더 있는 것을 나눠 적어두면 좋다",
      },
      { column: "future_research", label: "후속 연구 및 제언", size: "long" },
    ],
  },
  {
    id: "use",
    title: "나의 활용",
    purpose: "내가 한 말이다. 설계 문서 2.4절의 구분이 여기서도 그대로다.",
    fields: [
      { column: "my_interpretation", label: "나의 해석", size: "long" },
      {
        column: "where_to_use",
        label: "내 연구의 어느 부분에서 사용할지",
        size: "long",
      },
      { column: "supports_claim", label: "뒷받침할 주장", size: "long" },
      {
        column: "agreements_objections",
        label: "동의·반론",
        size: "long",
      },
      {
        column: "quote_candidates",
        label: "직접 인용 후보",
        size: "long",
        hint: "뷰어에서 문장을 드래그해 남긴 인용은 기록 쪽에 쌓인다. 여기에는 그중 쓸 것을 골라 적는다",
      },
      {
        column: "paraphrase_candidates",
        label: "바꾸어 인용할 내용",
        size: "long",
      },
      {
        column: "cautions",
        label: "사용할 때의 주의점",
        size: "long",
        hint: "맥락이 달라 그대로 옮기면 안 되는 것",
      },
    ],
  },
];

/** 모든 항목을 한 줄로 편 것. 검증과 저장이 쓴다. */
export const ANALYSIS_FIELDS: readonly AnalysisField[] =
  ANALYSIS_SECTIONS.flatMap((section) => section.fields);

/** 데이터베이스 열 이름만. 마이그레이션과 맞는지 검사가 확인한다. */
export const ANALYSIS_COLUMNS: readonly string[] = ANALYSIS_FIELDS.map(
  (field) => field.column,
);

/**
 * 몇 칸을 채웠는지 센다.
 *
 * 서른 칸을 한 번에 채우는 사람은 없다. 며칠에 걸쳐 돌아오게 되는데,
 * 그때 "어디까지 했더라"를 다시 읽어서 알아내야 하면 다시 열기 싫어진다.
 * 묶음마다 채운 수를 보여주면 이어서 할 자리가 바로 보인다.
 */
export function countFilled(
  values: Readonly<Record<string, string | null | undefined>>,
  fields: readonly AnalysisField[] = ANALYSIS_FIELDS,
): number {
  return fields.filter((field) => {
    const value = values[field.column];

    return typeof value === "string" && value.trim().length > 0;
  }).length;
}
