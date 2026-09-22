/**
 * 브라우저에서 고른 글과 그 자리를 읽어낸다.
 *
 * 브라우저에서만 돈다. DOM을 직접 본다.
 *
 * 판단 규칙은 lib/captures/pdf-locator.ts에 있고, 여기서는 DOM에서 값을
 * 꺼내 그쪽에 넘기는 일만 한다. 화면 없이도 규칙을 검사할 수 있게 하려는 것이다.
 */

import {
  MAX_RECTS,
  PDF_SELECTION_KIND,
  tidySelectedText,
  toPageRatioRect,
  trimContextAfter,
  trimContextBefore,
  type PdfSelectionLocator,
  type SelectionRect,
} from "@/lib/captures/pdf-locator";

/** 앞뒤 문맥을 글자 층에서 얼마나 긁어올지. 다듬은 뒤 다시 잘린다. */
const CONTEXT_SCAN_LENGTH = 400;

export type ReadSelection = {
  locator: PdfSelectionLocator;
  /** 고른 자리가 화면의 어디인지. 작은 창을 띄울 위치를 정하는 데 쓴다. */
  anchor: { left: number; top: number; bottom: number };
};

/**
 * 지금 고른 글을 읽는다. 고른 것이 없거나 페이지 밖이면 null이다.
 *
 * @param pageElement 그려진 페이지 영역. 좌표의 기준이 된다.
 */
export function readPdfSelection(options: {
  pageElement: HTMLElement;
  sourceFileId: string;
  page: number;
  fileChecksum: string | null;
}): ReadSelection | null {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  // 페이지 밖에서 고른 글은 다루지 않는다. 화면의 다른 글자를 고른 경우다.
  if (!options.pageElement.contains(range.commonAncestorContainer)) {
    return null;
  }

  const selectedText = tidySelectedText(selection.toString());

  if (selectedText.length === 0) {
    return null;
  }

  const pageBox = options.pageElement.getBoundingClientRect();

  // 줄마다 사각형이 하나씩 나온다. 여러 줄을 고르면 여럿이 된다.
  const rects: SelectionRect[] = [];

  for (const clientRect of Array.from(range.getClientRects())) {
    if (rects.length >= MAX_RECTS) {
      break;
    }

    const rect = toPageRatioRect(
      {
        left: clientRect.left,
        top: clientRect.top,
        width: clientRect.width,
        height: clientRect.height,
      },
      {
        left: pageBox.left,
        top: pageBox.top,
        width: pageBox.width,
        height: pageBox.height,
      },
    );

    if (rect) {
      rects.push(rect);
    }
  }

  const bounding = range.getBoundingClientRect();

  return {
    locator: {
      kind: PDF_SELECTION_KIND,
      sourceFileId: options.sourceFileId,
      page: options.page,
      selectedText,
      contextBefore: trimContextBefore(
        textAround(options.pageElement, range, "before"),
      ),
      contextAfter: trimContextAfter(
        textAround(options.pageElement, range, "after"),
      ),
      rects,
      fileChecksum: options.fileChecksum,
    },
    anchor: {
      left: bounding.left + bounding.width / 2,
      top: bounding.top,
      bottom: bounding.bottom,
    },
  };
}

/**
 * 고른 글의 앞이나 뒤에 있는 글을 긁어온다.
 *
 * 설계 문서 9.3절이 좌표만으로는 되짚을 수 없다고 했다. 문맥이 있으면
 * 파일이 조금 바뀌어도 그 문장을 다시 찾을 수 있다.
 *
 * 페이지 전체의 글에서 잘라내는 방식이라 완벽하지는 않다. 2단 편집이면
 * 화면에서 떨어져 있는 글이 이어 붙기도 한다. 그래도 단서 하나로는 쓸모가 있고,
 * 이것 때문에 저장이 막히지는 않는다.
 */
function textAround(
  pageElement: HTMLElement,
  range: Range,
  side: "before" | "after",
): string {
  const scan = document.createRange();

  try {
    if (side === "before") {
      scan.setStart(pageElement, 0);
      scan.setEnd(range.startContainer, range.startOffset);
    } else {
      scan.setStart(range.endContainer, range.endOffset);
      scan.setEnd(pageElement, pageElement.childNodes.length);
    }
  } catch {
    // 페이지가 다시 그려지는 중이면 범위를 잡지 못한다. 문맥 없이 저장한다.
    return "";
  }

  const text = scan.toString();

  scan.detach();

  return side === "before"
    ? text.slice(Math.max(text.length - CONTEXT_SCAN_LENGTH, 0))
    : text.slice(0, CONTEXT_SCAN_LENGTH);
}
