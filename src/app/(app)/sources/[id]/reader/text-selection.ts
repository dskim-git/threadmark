/**
 * 글자 층에서 드래그가 자연스럽게 되게 한다. (2026-10-04, 사용자가 쓰다가 말함)
 *
 * > pdf에서 인용할 문장을 드래그 할 때 드래그가 자연스럽게 잘 안되는 경우가
 * > 있는 것 같아. (예를 들어 특정 단어 이후를 드래그하려고 마우스를
 * > 드래그하는데 마우스의 드래그가 그 단어 앞으로 튄다던지 말이지)
 *
 * 무엇이 빠져 있었나
 *   PDF 위의 글자는 **보이지 않는 `<span>` 수백 개**다. 한 줄이 한 덩어리가
 *   아니라 글꼴과 자간이 바뀔 때마다 쪼개져 있고, 그 사이에는 아무것도 없는
 *   빈틈이 있다. 브라우저가 그 빈틈에서 "가장 가까운 글자"를 찾을 때
 *   **뒤가 아니라 앞을 고르는 일**이 생긴다. 그래서 선택이 앞으로 튄다.
 *
 *   pdf.js는 이것을 `endOfContent`라는 빈 칸 하나로 푼다. 평소에는 글자
 *   층 **아래쪽 바깥**(`inset: 100% 0 0`)에 숨어 있다가, 드래그가 시작되면
 *   층 전체를 덮는다(`.selecting .endOfContent { top: 0 }`). 덮인 칸이
 *   빈틈을 메워서 브라우저가 엉뚱한 곳을 고르지 않는다.
 *
 *   **그 칸을 만들고 매다는 일은 글자를 그리는 쪽에 없다.** `pdfjs.TextLayer`는
 *   글자만 그린다. 우리가 쓰지 않는 뷰어 쪽(`TextLayerBuilder`)에 그 코드가
 *   있었고, 우리 화면에는 CSS만 옮겨 와 있었다. **스타일은 있는데 그 스타일을
 *   켜주는 코드가 없는 상태였다.**
 *
 *   `text-layer.css`가 `.selecting`과 `.endOfContent` 규칙을 그대로 담고
 *   있었던 것이 단서였다. 쓰이지 않는 규칙이 거기 있을 까닭이 없다.
 *
 * 두 번째 고장 — 선택을 늘리는 방향
 *   덮는 것만으로는 모자라다. 크로미움의 오래된 판에서는 **선택을 어느 쪽으로
 *   늘릴지**를 마지막 노드로 판단하는데, 글자 층의 마지막 노드가 늘 `endOfContent`라
 *   뒤로 늘리려 해도 앞으로 간다.
 *
 *   그래서 선택이 바뀔 때마다 그 칸을 **지금 고르고 있는 글자 옆으로 옮긴다.**
 *   앞으로 늘리는 중이면 앞에, 뒤로 늘리는 중이면 뒤에 둔다.
 *
 *   파이어폭스와 새 크로미움은 이 손질이 필요 없다. pdf.js가 그것을 가려서
 *   건너뛰고, 우리도 같은 방식으로 가린다. **필요 없는 곳에서 DOM을 움직이면
 *   그쪽에서 새 고장이 난다.**
 *
 * 왜 뷰어를 통째로 쓰지 않는가
 *   `pdf_viewer.mjs`에는 도구모음·주석 편집기·검색이 함께 들어 있다. 우리
 *   화면은 좌우로 나뉜 작업대라 그 도구모음이 들어갈 자리가 없고, 글자 층
 *   스타일도 이미 필요한 것만 옮겨 와 검사로 지키고 있다. (`text-layer.css`)
 *   **필요한 조각만 가져오는 방식을 그대로 이어간다.**
 *
 * 이 파일은 `window`와 `document`를 만지므로 브라우저에서만 돈다.
 * 판단만 하는 셈(`shouldMoveAnchor`)은 잎사귀로 빼 두어 검사가 부른다.
 */

import { shouldMoveAnchor } from "./text-selection-rules";

/** 글자 층 아래 숨어 있다가 드래그할 때 층을 덮는 칸의 class. */
const END_OF_CONTENT_CLASS = "endOfContent";

/** 드래그 중임을 알리는 class. CSS가 이것을 보고 위 칸을 끌어올린다. */
const SELECTING_CLASS = "selecting";

/**
 * 글자 층에 고르는 동작을 매단다. 떼는 함수를 돌려준다.
 *
 * 한 쪽을 그릴 때마다 부르고, 다음 쪽을 그리기 전에 떼야 한다. 떼지 않으면
 * 문서에 매단 것이 쌓여 **쪽을 넘길수록 느려진다.**
 */
export function bindTextSelection(layer: HTMLElement): () => void {
  const end = document.createElement("div");

  end.className = END_OF_CONTENT_CLASS;
  layer.append(end);

  const controller = new AbortController();
  const { signal } = controller;

  /** 덮개를 원래 자리로 돌려놓는다. 드래그가 끝났다는 뜻이다. */
  const reset = () => {
    layer.append(end);
    end.style.width = "";
    end.style.height = "";
    end.style.userSelect = "";
    layer.classList.remove(SELECTING_CLASS);
  };

  layer.addEventListener(
    "mousedown",
    () => layer.classList.add(SELECTING_CLASS),
    { signal },
  );

  document.addEventListener("pointerup", reset, { signal });

  /*
    창이 초점을 잃으면 되돌린다. 드래그하다가 다른 창으로 넘어가면
    `pointerup`이 우리에게 오지 않는다. 그대로 두면 덮개가 층을 덮은 채로
    남아 **그 뒤로 글자를 하나도 못 고르게 된다.**
  */
  window.addEventListener("blur", reset, { signal });

  let previous: Range | null = null;

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();

      if (!selection || selection.rangeCount === 0) {
        reset();

        return;
      }

      const range = selection.getRangeAt(0);

      // 이 쪽과 상관없는 선택이면 손대지 않는다.
      if (!range.intersectsNode(layer)) {
        reset();

        return;
      }

      layer.classList.add(SELECTING_CLASS);

      /*
        필요한 브라우저에서만 덮개를 옮긴다. 가리는 일이 비싸지 않도록
        한 번 재고 담아 둔다.
      */
      if (!needsAnchorMove(layer)) {
        previous = range.cloneRange();

        return;
      }

      const anchor = findAnchor(range, previous);

      if (anchor?.parentElement) {
        end.style.width = layer.style.width;
        end.style.height = layer.style.height;
        end.style.userSelect = "text";

        anchor.parentElement.insertBefore(
          end,
          shouldMoveAnchor(range, previous) ? anchor : anchor.nextSibling,
        );
      }

      previous = range.cloneRange();
    },
    { signal },
  );

  return () => {
    controller.abort();
    end.remove();
  };
}

/**
 * 선택의 끝에 있는 요소. 덮개를 그 옆에 둔다.
 *
 * 글자 노드면 그것을 담은 `<span>`을 쓴다. 덮개는 요소 사이에만 넣을 수
 * 있기 때문이다.
 */
function findAnchor(range: Range, previous: Range | null): Element | null {
  const start = shouldMoveAnchor(range, previous);
  const node = start ? range.startContainer : range.endContainer;

  let element: Node | null =
    node.nodeType === Node.TEXT_NODE ? node.parentNode : node;

  if (!(element instanceof Element)) {
    return null;
  }

  // 찾기로 칠해진 조각 안이면 그 바깥의 글자 칸을 쓴다.
  if (element.classList.contains("highlight")) {
    element = element.parentElement;
  }

  return element instanceof Element ? element : null;
}

/*
  이 브라우저에 덮개 옮기기가 필요한가. 한 번만 재고 담아 둔다.

  파이어폭스와 새 크로미움(148 이상)은 선택을 늘리는 방향을 스스로 맞춘다.
  거기서도 DOM을 움직이면 **멀쩡하던 것이 흔들린다.** pdf.js가 가리는
  방식을 그대로 따른다.
*/
let anchorMoveNeeded: boolean | null = null;

function needsAnchorMove(layer: HTMLElement): boolean {
  if (anchorMoveNeeded !== null) {
    return anchorMoveNeeded;
  }

  /*
    파이어폭스는 `-moz-user-select`가 실제 값으로 읽힌다. 다른 브라우저는
    빈 값이거나 `none`이 아니다. 이름으로 브라우저를 맞히는 것보다 **그
    브라우저만 아는 값을 물어보는** 편이 덜 틀린다.
  */
  const firefox =
    getComputedStyle(layer).getPropertyValue("-moz-user-select") === "none";

  if (firefox) {
    anchorMoveNeeded = false;

    return false;
  }

  const version = /\bChrome\/(\d+)\b/u.exec(navigator.userAgent)?.[1];
  const modernChromium = version ? Number.parseInt(version, 10) >= 148 : false;

  anchorMoveNeeded = !modernChromium;

  return anchorMoveNeeded;
}
