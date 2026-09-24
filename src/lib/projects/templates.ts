/**
 * 프로젝트 시작 서식. (19-A, 설계 문서 7.3절)
 *
 * 프로젝트를 만들 때 자리 몇 개를 미리 만들어 준다. **시작점이지 울타리가
 * 아니다.** 만든 뒤에는 전부 고치고 지우고 더할 수 있고, **깊이에도 한계가
 * 없다.** 서식이 두 단까지만 주더라도 그 아래로 얼마든지 나눌 수 있다.
 *
 * 왜 두는가
 *   프로젝트를 만들자마자 빈 화면을 마주하면 "뭐부터 적지"에서 멈춘다.
 *   자리 몇 개가 있으면 고치면서 시작한다.
 *
 * 무엇을 담는가
 *   **우리가 지어낸 구성이 아니라 실제로 쓰이는 구성을 담는다.** 2026-09-24에
 *   국내 학위논문 체제, 수업 지도안 양식, 교원 직무연수 계획, 출간기획서,
 *   제품 요구사항 문서(PRD), 여행 준비 안내를 찾아보고 그 뼈대를 옮겼다.
 *   근거는 `docs/VERIFICATION.md` 4-26절에 적었다.
 *
 * 번호를 담지 않는다
 *   `Ⅰ. 서론`이 아니라 `서론`이다. 번호는 화면이 순서를 보고 센다.
 *   담아두면 자리를 옮길 때마다 어긋난다. (7.3절)
 *
 * 이 파일에 다른 것을 import하지 않는다
 *   검사가 이 목록만 따로 들여다볼 수 있어야 한다. `request-headers.ts`와
 *   `legal/content.ts`가 같은 이유로 그렇게 되어 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 서식이 만들어 줄 자리 하나. 아래에 또 자리를 둘 수 있다. */
export type OutlineSeed = {
  title: string;
  children?: readonly OutlineSeed[];
};

export type ProjectTemplate = {
  id: string;
  /** 화면에 보이는 이름. 고르면 `프로젝트 유형` 칸에 그대로 들어간다. */
  name: string;
  /** 고를 때 함께 보여줄 한 줄. */
  summary: string;
  /** 만들어 줄 자리들. 비어 있으면 아무것도 만들지 않는다. */
  outline: readonly OutlineSeed[];
};

/** 아무 자리도 만들지 않는 서식. 목록의 마지막에 둔다. */
export const FREEFORM_TEMPLATE_ID = "freeform";

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: "thesis",
    name: "논문 쓰기",
    summary: "서론부터 결론까지, 국내 학위논문에서 널리 쓰는 다섯 장 구성입니다.",
    outline: [
      {
        title: "서론",
        children: [
          { title: "연구의 필요성과 목적" },
          { title: "연구 문제" },
          { title: "용어의 정의" },
          { title: "연구의 제한점" },
        ],
      },
      {
        title: "이론적 배경",
        children: [{ title: "선행 연구 검토" }],
      },
      {
        title: "연구 방법",
        children: [
          { title: "연구 대상" },
          { title: "자료 수집" },
          { title: "분석 방법" },
        ],
      },
      { title: "연구 결과" },
      {
        title: "논의 및 결론",
        children: [{ title: "요약" }, { title: "제언" }],
      },
      { title: "참고문헌" },
    ],
  },
  {
    id: "lesson",
    name: "수업 준비",
    summary:
      "단원 개관과 차시별 흐름(도입·전개·정리), 평가 계획까지 지도안의 뼈대입니다.",
    outline: [
      {
        title: "단원 개관",
        children: [
          { title: "성취기준" },
          { title: "단원 목표" },
          { title: "학생 실태" },
        ],
      },
      {
        /*
          차시를 하나만 만든다.

          차시 수는 단원마다 다르다. 다섯 개를 미리 만들어 두면 지우는 일이
          먼저 생긴다. 하나를 보고 나머지를 만드는 편이 빠르다.
        */
        title: "1차시",
        children: [
          { title: "학습 목표" },
          { title: "도입" },
          { title: "전개" },
          { title: "정리" },
          { title: "자료와 유의점" },
        ],
      },
      {
        title: "평가 계획",
        children: [
          { title: "진단 평가" },
          { title: "형성 평가" },
          { title: "총괄 평가" },
        ],
      },
      { title: "수업 후 메모" },
    ],
  },
  {
    id: "training",
    name: "연수 준비",
    summary: "연수 목표와 대상, 부별 내용, 실습 자료와 마친 뒤 정리입니다.",
    outline: [
      {
        title: "연수 개요",
        children: [
          { title: "연수 목표" },
          { title: "대상과 인원" },
          { title: "일정과 장소" },
        ],
      },
      {
        title: "연수 내용",
        children: [{ title: "1부" }, { title: "2부" }],
      },
      { title: "실습 자료" },
      { title: "연수 평가와 정리" },
    ],
  },
  {
    id: "book",
    name: "책 쓰기",
    summary:
      "출간기획서가 묻는 것(기획 의도·예상 독자·차례)과 원고 자리를 함께 둡니다.",
    outline: [
      {
        title: "기획",
        children: [
          { title: "기획 의도" },
          { title: "예상 독자" },
          { title: "비슷한 책과 다른 점" },
        ],
      },
      {
        title: "원고",
        children: [{ title: "1장" }, { title: "2장" }],
      },
      { title: "집필 일정" },
      { title: "참고 자료" },
    ],
  },
  {
    id: "talk",
    name: "발표 준비",
    summary: "남길 말 한 줄을 맨 앞에 두고 도입·본론·마무리로 이어갑니다.",
    outline: [
      /*
        `한 줄 요약`을 맨 앞에 둔다.

        발표 준비에서 가장 자주 무너지는 자리다. 슬라이드를 먼저 만들기
        시작하면 "그래서 무슨 말을 하려는 것인가"가 끝까지 정리되지 않는다.
      */
      { title: "한 줄 요약" },
      { title: "도입 — 왜 이 이야기인가" },
      { title: "본론" },
      { title: "마무리 — 무엇을 남길까" },
      { title: "예상 질문" },
    ],
  },
  {
    id: "software",
    name: "웹앱·프로그램 만들기",
    summary:
      "무엇을 왜 만드는지 정하고, 설계·보안·만드는 순서·배포까지 이어집니다.",
    outline: [
      {
        title: "무엇을 왜 만드나",
        children: [
          { title: "풀려는 문제" },
          { title: "쓸 사람" },
          { title: "다 됐다고 할 기준" },
          /*
            `이번에 하지 않을 것`을 기획 안에 둔다.

            제품 요구사항 문서에서 가장 자주 빠지는 자리이고, 빠지면 만들
            것이 끝없이 늘어난다. 혼자 만들 때 특히 그렇다. 막아 주는 사람이
            없어서 "이것도 되면 좋겠네"가 그대로 일이 된다.
          */
          { title: "이번에 하지 않을 것" },
        ],
      },
      {
        title: "설계",
        children: [
          { title: "화면과 흐름" },
          { title: "데이터와 구조" },
          { title: "기술 선택과 그 이유" },
        ],
      },
      /*
        보안과 개인정보를 맨 위 칸으로 따로 둔다.

        나중에 붙일 수 없는 것이기 때문이다. 다 만들고 나서 "이제 보안을
        하자"가 되면 이미 구조가 그것을 못 받는다. 설계 아래 한 줄로 두면
        설계의 곁가지처럼 보인다.
      */
      { title: "보안과 개인정보" },
      { title: "만드는 순서" },
      { title: "확인할 것" },
      { title: "배포와 운영" },
      /*
        `결정 기록`을 마지막에 둔다.

        왜 그렇게 했는지를 남기지 않으면 석 달 뒤에 자기가 쓴 코드를
        의심하게 된다. 무엇을 고쳤는지가 아니라 **무엇을 포기했는지**가
        기억나지 않는다.
      */
      { title: "결정 기록" },
    ],
  },
  {
    id: "trip",
    name: "여행 준비",
    summary: "예산을 먼저 정하고 예약·일정·짐으로 이어갑니다. 다녀온 뒤 자리도 둡니다.",
    outline: [
      {
        /*
          예산을 개요 안, 그것도 맨 아래에 둔다.

          **총 비용을 정하지 않고 계획부터 짜면 나중에 고치는 일이 번거로워진다.**
          찾아본 자료가 공통으로 말하는 것이다. 언제·어디까지 정하고 나면
          바로 다음에 정할 것이 얼마를 쓸 것인가다.
        */
        title: "여행 개요",
        children: [
          { title: "언제, 며칠" },
          { title: "어디로, 누구와" },
          { title: "전체 예산" },
        ],
      },
      {
        /*
          예약을 일정보다 앞에 둔다.

          항공과 숙소는 값이 크고 한번 잡으면 바꾸기 어렵다. 그것이 정해져야
          일정이 정해진다. 반대로 하면 일정을 다시 짜게 된다.
        */
        title: "예약",
        children: [{ title: "항공·교통" }, { title: "숙소" }],
      },
      /*
        `가고 싶은 곳`은 모아두는 자리다.

        여행 블로그나 소개 글을 웹사이트 자료로 담아두었다가 여기 붙인다.
        아직 며칠째에 갈지 정하지 않은 것들이 여기 쌓이고, 정해지면 일정
        아래로 옮긴다.
      */
      { title: "가고 싶은 곳" },
      {
        // 하루만 만든다. 며칠짜리인지는 여행마다 다르다. (수업의 차시와 같다)
        title: "일정",
        children: [{ title: "1일차" }],
      },
      {
        title: "챙길 것",
        children: [
          { title: "서류 — 여권·비자·보험" },
          { title: "짐" },
        ],
      },
      { title: "다녀와서" },
    ],
  },
  {
    id: FREEFORM_TEMPLATE_ID,
    name: "자유 형식",
    summary: "자리를 만들지 않습니다. 처음부터 직접 짭니다.",
    outline: [],
  },
];

/** 열쇠로 서식 하나를 찾는다. 모르는 값이면 `null`이다. */
export function findProjectTemplate(id: unknown): ProjectTemplate | null {
  if (typeof id !== "string") {
    return null;
  }

  return PROJECT_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** 펼쳐 놓은 자리 하나. 담을 때 쓴다. */
export type FlatSeed = {
  /** 이 자리를 가리키는 임시 열쇠. `0`, `0.1`, `0.1.2` 모양이다. */
  key: string;
  /** 위 자리의 열쇠. 맨 윗칸이면 `null`이다. */
  parentKey: string | null;
  title: string;
  /** 형제 사이의 순서. 0부터 센다. */
  position: number;
  /** 맨 위가 0. 화면이 들여쓸 때 쓴다. */
  depth: number;
};

/**
 * 나무 모양의 서식을 한 줄로 펼친다.
 *
 * **부모가 언제나 자식보다 앞에 온다.** 담을 때 부모의 id를 먼저 받아야
 * 자식의 `parent_id`를 채울 수 있기 때문이다. 이 순서가 보장되지 않으면
 * 담는 쪽이 두 번 훑거나 정렬을 다시 해야 한다.
 *
 * 임시 열쇠(`key`)는 데이터베이스의 id가 아니다. 담기 전에는 id가 없으므로,
 * 부모와 자식을 이어줄 이름이 잠시 필요하다.
 */
export function flattenOutline(
  seeds: readonly OutlineSeed[],
): readonly FlatSeed[] {
  const flat: FlatSeed[] = [];

  const walk = (
    nodes: readonly OutlineSeed[],
    parentKey: string | null,
    depth: number,
  ): void => {
    nodes.forEach((node, index) => {
      const key = parentKey === null ? `${index}` : `${parentKey}.${index}`;

      flat.push({ key, parentKey, title: node.title, position: index, depth });

      if (node.children && node.children.length > 0) {
        walk(node.children, key, depth + 1);
      }
    });
  };

  walk(seeds, null, 0);

  return flat;
}
