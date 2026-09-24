/**
 * PDF에서 고른 자리를 담는 형식.
 *
 * 설계 문서 6.3절이 모양을 정했고, 9.3절이 왜 이렇게 담는지 설명한다.
 *
 *   위치 앵커는 페이지 + 선택 문장 + 주변 문맥 + 좌표 + 파일 checksum을
 *   함께 저장한다. 좌표만 저장하지 않는다.
 *
 * 좌표 하나로는 못 찾는 경우가 9.3절에 적혀 있다. 2단 편집을 가로질러 고르거나,
 * 글꼴 인코딩이 비표준이거나, 수식·표·각주가 섞이면 좌표가 어긋난다.
 * 그래서 단서를 여럿 남겨 하나가 틀려도 되짚을 수 있게 한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 확인한다.
 */

import { z } from "zod";

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import { MAX_TEXT_LENGTH } from "./schema.ts";

/** 앞뒤 문맥을 얼마나 담을지. 문장 한둘이 들어갈 만큼이면 충분하다. */
export const MAX_CONTEXT_LENGTH = 300;

/**
 * 한 번에 담을 사각형의 최대 개수.
 *
 * 여러 줄을 고르면 줄마다 사각형이 하나씩 생긴다. 긴 선택이면 수십 개가 되고,
 * 문서 전체를 고르면 수천 개가 된다. 상한이 없으면 기록 한 건이 통째로
 * 무거워지고, 목록을 읽는 화면까지 느려진다.
 *
 * 넘치면 잘라낸다. 앞쪽 사각형만 있어도 그 자리를 찾아가는 데는 충분하다.
 */
export const MAX_RECTS = 80;

/**
 * 좌표는 픽셀이 아니라 0~1 사이의 비율이다. (설계 문서 6.3절 마지막 줄)
 *
 * 픽셀로 담으면 확대율과 화면 크기에 묶인다. 다른 기기에서 열거나 배율을
 * 바꾸면 엉뚱한 자리를 가리킨다.
 */
const ratioSchema = z.number().min(0).max(1);

const rectSchema = z.object({
  x: ratioSchema,
  y: ratioSchema,
  width: ratioSchema,
  height: ratioSchema,
});

export type SelectionRect = z.infer<typeof rectSchema>;

export const PDF_SELECTION_KIND = "pdf-selection";

export const pdfSelectionLocatorSchema = z.object({
  kind: z.literal(PDF_SELECTION_KIND),

  /**
   * 어느 파일의 몇 쪽인지.
   *
   * 설계 문서 6.3절의 예시에는 없는 항목이다. 한 자료에 PDF가 여럿일 수
   * 있는데, 예시의 항목만으로는 어느 파일인지 가릴 수 없어서 더했다.
   *
   * fileChecksum으로 되짚을 수도 있지만 그 값은 "파일이 바뀌었나"를 보는
   * 용도다. (9.2절) 파일을 새로 올리면 값이 바뀌어 연결이 끊긴다.
   */
  sourceFileId: z.uuid(),

  page: z.number().int().min(1).max(100000),

  /**
   * 쪽을 넘어가는 문장을 이어 붙였을 때 **끝나는** 쪽. (15-G)
   *
   * 논문의 문장은 쪽 경계에서 끊긴다. 앞쪽 끝에서 고른 조각과 다음 쪽
   * 처음에서 고른 조각을 한 인용으로 합칠 수 있게 했고, 그때 이 값이 붙는다.
   *
   * 한 쪽에서 끝나는 보통의 인용에는 없다. 없는 값을 page와 같게 채워 넣지
   * 않는다. 그러면 "이어 붙인 것"과 "한 쪽에서 끝난 것"을 구분할 수 없고,
   * 예전에 저장한 기록과도 모양이 달라진다.
   *
   * `page`는 늘 **시작한** 쪽이다. 되짚어 갈 자리는 문장이 시작하는 곳이다.
   * `rects`도 시작한 쪽의 좌표만 담는다. 좌표는 쪽 안의 비율이라 여러 쪽을
   * 한 묶음에 담을 방법이 없다.
   */
  endPage: z.number().int().min(1).max(100000).optional(),

  selectedText: z.string().min(1).max(MAX_TEXT_LENGTH),
  contextBefore: z.string().max(MAX_CONTEXT_LENGTH),
  contextAfter: z.string().max(MAX_CONTEXT_LENGTH),

  rects: z.array(rectSchema).max(MAX_RECTS),

  /**
   * 그 시점 파일의 md5Checksum.
   *
   * 파일이 교체되면 값이 달라진다. 13-D에서 이 값을 비교해 "기존 기록의
   * 위치가 달라졌을 수 있다"고 알린다. (설계 문서 9.2절)
   * 바이너리가 아닌 파일에는 값이 없으므로 null을 허용한다.
   */
  fileChecksum: z.string().max(128).nullable(),
});

export type PdfSelectionLocator = z.infer<typeof pdfSelectionLocatorSchema>;

export const PDF_PAGE_KIND = "pdf-page";

/**
 * 문장을 고르지 않고 "이 쪽"에 남기는 메모의 자리.
 *
 * 설계 문서 22절의 MVP 목록에 있는 `페이지 메모`다.
 * 스캔 이미지 PDF에는 고를 글자가 없어서 이 길이 유일하다. 9.5절의 안내문이
 * "페이지 메모는 사용할 수 있으며"라고 약속하는 것이 이것이다.
 *
 * 고른 문장이 없으므로 문맥과 좌표도 없다. 쪽 번호가 전부다.
 * 없는 값을 빈 문자열로 채워 넣지 않는다. 그러면 "고르긴 했는데 내용이 없다"와
 * "애초에 고르지 않았다"를 나중에 구분할 수 없다.
 */
export const pdfPageLocatorSchema = z.object({
  kind: z.literal(PDF_PAGE_KIND),
  sourceFileId: z.uuid(),
  page: z.number().int().min(1).max(100000),
  fileChecksum: z.string().max(128).nullable(),
});

export type PdfPageLocator = z.infer<typeof pdfPageLocatorSchema>;

/** PDF에서 온 기록의 자리. 문장을 골랐거나, 쪽만 가리키거나. */
export const pdfLocatorSchema = z.discriminatedUnion("kind", [
  pdfSelectionLocatorSchema,
  pdfPageLocatorSchema,
]);

export type PdfLocator = z.infer<typeof pdfLocatorSchema>;

/**
 * 저장해둔 locator를 읽는다. PDF 선택이 아니거나 형태가 어긋나면 null이다.
 *
 * locator는 JSONB라서 무엇이든 들어갈 수 있다. 지금은 우리 코드만 쓰지만,
 * 유형이 늘어나면(영상 시간, 책 쪽수 등) 같은 칸에 다른 모양이 섞인다.
 * 읽는 쪽이 모양을 확인하고 쓰는 것이 맞다.
 */
export function parsePdfSelectionLocator(
  value: unknown,
): PdfSelectionLocator | null {
  const parsed = pdfSelectionLocatorSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * PDF에서 온 기록이면 그 자리를 돌려준다. 두 모양을 모두 받는다.
 *
 * 화면이 "몇 쪽인지"와 "어느 파일인지"만 필요할 때 쓴다.
 * 고른 문장이 있는지까지 가려야 하면 kind를 본다.
 */
export function parsePdfLocator(value: unknown): PdfLocator | null {
  const parsed = pdfLocatorSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * 고른 글을 다듬는다.
 *
 * PDF에서 고른 글에는 줄바꿈이 많이 섞인다. 원래 문단이 아니라 **줄이 끝나서**
 * 들어간 것이라, 그대로 두면 한 문장이 여러 줄로 쪼개져 읽기 어렵다.
 *
 * 그래서 문단 안의 줄바꿈은 공백으로 바꾸고, 빈 줄이 있던 자리만 문단 구분으로
 * 남긴다.
 *
 * 줄 끝의 붙임표는 건드리지 않는다. 9.3절이 하이픈 처리를 오차가 생길 수 있는
 * 경우로 꼽았다. `co-operate`처럼 원래 붙임표인 경우와 줄 끝에서 잘린 경우를
 * 우리가 가릴 수 없다. 모르면 원문을 그대로 둔다.
 */
export function tidySelectedText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    // 빈 줄은 문단이 바뀐 것으로 본다. 문단 단위로 나눠 각각 다듬는다.
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n");
}

/**
 * 쪽을 넘어가는 문장의 두 조각을 잇는다. (15-G)
 *
 * PDF는 조판이 어디서 줄을 바꿨는지 기억하지 않는다. 그래서 쪽 끝에서
 * 잘린 문장을 다음 쪽 것과 이을 때 우리가 그 자리를 메워야 한다.
 *
 * 규칙은 둘이다.
 *
 *   앞 조각이 붙임표로 끝나면  공백 없이 붙인다
 *   그 밖에는                  공백 하나로 잇는다
 *
 * **붙임표를 지우지 않는다.** 인쇄된 쪽에 그 표가 있고, 인용은 원문
 * 그대로여야 한다. (설계 문서 2.4절) `develop-`과 `ment`를 이으면
 * `develop-ment`가 되어 읽기에 거슬리지만, 지워버리면 원문에 없던 낱말을
 * 만들어내는 셈이다. 무엇을 지울지 우리가 판단할 수 없다.
 *
 * 붙임표는 여러 글자가 쓰인다. 보통의 하이픈, 유니코드 하이픈, 비줄바꿈
 * 하이픈, 그리고 보이지 않는 소프트 하이픈이다. 소프트 하이픈은 눈에 보이지
 * 않으면서 글자로는 있어서, 이 규칙에서 빠뜨리면 공백이 하나 끼어든다.
 */
/**
 * 붙임표로 끝나는가.
 *
 * 글자를 정규식에 그대로 적지 않고 번호로 적는다. 소프트 하이픈(00AD)은
 * **눈에 보이지 않는 글자**라서, 그대로 적어두면 나중에 이 줄을 고칠 때
 * 있는 줄도 모르고 지운다. 지워도 검사 하나만 조용히 실패한다.
 */
const HYPHEN_CODES = [
  0x2d, // 보통의 하이픈
  0x2010, // 유니코드 하이픈
  0x2011, // 비줄바꿈 하이픈
  0x00ad, // 소프트 하이픈. 보이지 않는다
];

function endsWithHyphen(value: string): boolean {
  const last = value.codePointAt(value.length - 1);

  return last !== undefined && HYPHEN_CODES.includes(last);
}

/**
 * 이 기록이 몇 쪽에 있는지 한 마디로. `9쪽` 또는 `9~10쪽`. (15-G)
 *
 * 쪽을 넘어간 인용만 범위로 보인다. 한 쪽에서 끝난 것은 예전 그대로다.
 * 화면 여러 곳이 같은 말을 써야 해서 여기 한 번만 적는다.
 */
export function describeLocatorPages(locator: {
  page: number;
  endPage?: number;
}): string {
  return locator.endPage !== undefined && locator.endPage !== locator.page
    ? `${locator.page}~${locator.endPage}쪽`
    : `${locator.page}쪽`;
}

export function joinSelectedText(first: string, next: string): string {
  const head = tidySelectedText(first);
  const tail = tidySelectedText(next);

  if (head.length === 0) {
    return tail;
  }

  if (tail.length === 0) {
    return head;
  }

  return endsWithHyphen(head) ? `${head}${tail}` : `${head} ${tail}`;
}

/**
 * 선택한 글 **앞의** 문맥을 담는다.
 *
 * 길면 뒤쪽을 남긴다. 선택한 글에 붙어 있는 쪽이 되짚을 때 쓸모 있다.
 */
export function trimContextBefore(value: string): string {
  const cleaned = tidySelectedText(value);

  return cleaned.length <= MAX_CONTEXT_LENGTH
    ? cleaned
    : cleaned.slice(cleaned.length - MAX_CONTEXT_LENGTH);
}

/** 선택한 글 **뒤의** 문맥을 담는다. 길면 앞쪽을 남긴다. */
export function trimContextAfter(value: string): string {
  const cleaned = tidySelectedText(value);

  return cleaned.length <= MAX_CONTEXT_LENGTH
    ? cleaned
    : cleaned.slice(0, MAX_CONTEXT_LENGTH);
}

/**
 * 화면 좌표를 0~1 비율로 바꾼다.
 *
 * 기준은 그려진 페이지의 영역이다. 배율이 얼마든, 화면이 얼마나 크든
 * 같은 자리는 같은 값이 나온다.
 *
 * 범위를 벗어난 값은 잘라 넣는다. 선택이 페이지 가장자리를 살짝 넘어가는 일이
 * 있는데, 그 때문에 저장이 통째로 거부되면 사용자만 답답하다.
 */
export function toPageRatioRect(
  selection: { left: number; top: number; width: number; height: number },
  page: { left: number; top: number; width: number; height: number },
): SelectionRect | null {
  if (page.width <= 0 || page.height <= 0) {
    return null;
  }

  // 너비나 높이가 없는 조각은 버린다. 줄 사이의 빈틈에서 생기는 것들이다.
  if (selection.width <= 0 || selection.height <= 0) {
    return null;
  }

  const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

  return {
    x: clamp((selection.left - page.left) / page.width),
    y: clamp((selection.top - page.top) / page.height),
    width: clamp(selection.width / page.width),
    height: clamp(selection.height / page.height),
  };
}

/** 화면에 보여줄 자리 표시. 기록 목록에서 쓴다. */
export function describeLocator(value: unknown): string | null {
  const locator = parsePdfLocator(value);

  return locator ? `${locator.page}쪽` : null;
}
