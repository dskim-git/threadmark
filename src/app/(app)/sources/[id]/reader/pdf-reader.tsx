"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import "./text-layer.css";

/**
 * PDF를 화면에 그린다. (설계 문서 9.1절)
 *
 * PDF.js를 쓴다. Drive의 미리보기 iframe으로 만들지 않는 이유가 9.1절에 있다.
 * 교차 출처 iframe 안에서는 선택한 텍스트와 좌표에 우리 앱이 닿을 수 없다.
 * 13-B에서 선택한 문장을 기록으로 남기려면 우리가 직접 그려야 한다.
 *
 * 파일은 `/api/source-files/[id]/content`에서 받아온다. 그 경로가 세션을
 * 확인하고 Drive에서 흘려보낸다. 브라우저는 Drive에 직접 닿지 않고 토큰도 받지
 * 않는다. (설계 문서 9.2절)
 *
 * PDF.js는 서버에서 부를 수 없다. 화면과 창 크기를 보기 때문이다.
 * 그래서 이 컴포넌트가 브라우저에서 돌고, 라이브러리도 화면이 뜬 뒤에 불러온다.
 */

/** 화면에서 고를 수 있는 확대율. 데이터베이스 제약(0.25~8)과 같은 범위에 둔다. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

/** 확대율을 고르지 않았을 때. 화면 너비에 맞춘다. */
export const FIT_WIDTH = null;

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; pageCount: number }
  | { phase: "failed"; message: string };

/** PDF.js에서 우리가 쓰는 부분만 적어둔다. 타입 정의를 따로 설치하지 않는다. */
type PdfViewport = { width: number; height: number };

type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void>; cancel: () => void };
  /** 글자 층을 만드는 데 쓴다. 글자가 없는 스캔 PDF면 items가 비어 있다. */
  getTextContent: () => Promise<{ items: unknown[] }>;
  cleanup: () => void;
};

type PdfTextLayer = {
  render: () => Promise<void>;
  cancel: () => void;
};

/**
 * 글을 골랐을 때 부르는 함수.
 *
 * 페이지 영역과 지금 쪽 번호만 넘긴다. 무엇을 읽어낼지는 부르는 쪽이 정한다.
 * 이 컴포넌트는 그리는 일과 어디를 그렸는지까지만 안다.
 */
type SelectionHandler = (
  selection: { pageElement: HTMLElement; page: number } | null,
) => void;

/**
 * 그림 위에 보이지 않는 글자를 겹쳐 놓는다.
 *
 * 이것이 있어야 드래그로 글을 고를 수 있다. (설계 문서 9.3절)
 * 글자는 투명하고, 자리만 정확히 맞춰 놓는다.
 *
 * `--total-scale-factor`를 확대율과 같게 두는 것이 핵심이다.
 * PDF.js의 스타일이 이 값으로 글자 크기를 계산한다. 어긋나면 글자가 엉뚱한
 * 자리에 놓여, 드래그했을 때 보이는 것과 다른 문장이 잡힌다. 눈으로는
 * 알아채기 어렵고 기록에 남는 원문이 조용히 틀어진다.
 *
 * 컴포넌트 바깥에 두는 이유는 draw의 useCallback 때문이다. 안에 두면 렌더마다
 * 새 함수가 되어 의존성에 넣어야 하고, 그러면 기억해 두는 뜻이 사라진다.
 */
async function drawTextLayer(options: {
  pdfjs: typeof import("pdfjs-dist") | null;
  layer: HTMLDivElement | null;
  target: PdfPage;
  viewport: PdfViewport;
  scale: number;
  cssWidth: number;
  cssHeight: number;
}): Promise<{ textLayer: PdfTextLayer | null; text: TextLayerState }> {
  const { pdfjs, layer } = options;

  if (!pdfjs || !layer) {
    return { textLayer: null, text: { kind: "ok" } };
  }

  layer.replaceChildren();
  layer.style.width = `${options.cssWidth}px`;
  layer.style.height = `${options.cssHeight}px`;
  layer.style.setProperty("--total-scale-factor", String(options.scale));

  let content: { items: unknown[] };

  /*
    한 번 더 해본다.

    아이패드에서 같은 논문이 데스크톱과 다르게 "글자가 없다"로 나왔다.
    파일에는 글자가 있으므로 꺼내다가 실패한 것인데, 그런 실패는 잠깐
    끊긴 것일 수 있다. PDF를 구간별로 받고 있어서 더 그렇다.
    한 번 더 해보는 값이 싸고, 되면 사용자는 아무것도 몰라도 된다.
  */
  try {
    content = await options.target.getTextContent();
  } catch (first) {
    try {
      content = await options.target.getTextContent();
    } catch (second) {
      /*
        여기서 오류를 삼키면 안 된다. 삼켰더니 화면에는 "스캔본인가 봅니다"만
        뜨고, 실제로는 글자가 멀쩡히 있는 파일이었다. 원인을 알 방법이 아예
        없어진다. 아이패드에는 콘솔을 붙일 수도 없다. 그래서 화면에 띄운다.
      */
      const reason =
        second instanceof Error ? second.message : String(second ?? first);

      console.error("[ThreadMark] 글자 층 읽기 실패:", reason);

      return { textLayer: null, text: { kind: "failed", reason } };
    }
  }

  // 글자가 하나도 없으면 스캔 이미지 PDF다. (설계 문서 9.5절)
  // OCR은 MVP 범위 밖이라, 안내만 보여주고 페이지 메모는 쓸 수 있게 둔다.
  if (content.items.length === 0) {
    return { textLayer: null, text: { kind: "empty" } };
  }

  const textLayer = new pdfjs.TextLayer({
    textContentSource: content,
    container: layer,
    viewport: options.viewport,
  } as unknown as ConstructorParameters<
    typeof pdfjs.TextLayer
  >[0]) as unknown as PdfTextLayer;

  try {
    await textLayer.render();
  } catch {
    // 쪽을 넘기며 멈춘 경우다. 오류가 아니다.
  }

  return { textLayer, text: { kind: "ok" } };
}

/**
 * 글자 층이 어떻게 됐는지.
 *
 *   ok      글자를 꺼내 깔았다
 *   empty   글자가 정말 하나도 없다. 스캔본이다
 *   failed  꺼내다 실패했다. 파일에 글자가 있어도 여기로 온다
 *
 * 마지막 둘을 갈라둔 것이 핵심이다. 예전에는 둘 다 "스캔본인가 봅니다"로
 * 보여줬는데, 글자가 멀쩡히 있는 파일에서 그 문구가 뜨면 사용자는 파일을
 * 의심하게 된다. 정작 봐야 할 것은 우리 쪽 실패다.
 */
type TextLayerState =
  | { kind: "ok" }
  | { kind: "empty" }
  | { kind: "failed"; reason: string };

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

/**
 * 문서를 불러오는 작업.
 *
 * 정리하는 `destroy`는 **문서가 아니라 이 작업에** 있다.
 * 문서에는 `cleanup`뿐이고, 그것은 캐시를 비우는 것이지 연결을 닫는 것이 아니다.
 * 문서 쪽에서 destroy를 부르면 `destroy is not a function`이 난다.
 *
 * 그래서 이 작업을 들고 있다가 정리한다. worker까지 함께 닫힌다.
 */
type PdfLoadingTask = {
  promise: Promise<unknown>;
  destroy: () => Promise<void>;
};

export function PdfReader({
  fileId,
  initialPage,
  initialZoom,
  onPositionChange,
  onSelectionChange,
  onPageChange,
}: {
  fileId: string;
  initialPage: number;
  initialZoom: number | null;
  /** 보던 자리가 바뀌었을 때. 부르는 쪽이 저장을 맡는다. */
  onPositionChange?: (page: number, zoom: number | null) => void;
  /** 글을 골랐을 때. 고른 것이 없어지면 null로 부른다. */
  onSelectionChange?: SelectionHandler;
  /**
   * 보는 쪽이 바뀔 때마다 곧바로 알린다.
   *
   * onPositionChange와 다르다. 저쪽은 저장을 위해 잠시 기다렸다 부르고,
   * 이쪽은 화면이 "지금 몇 쪽인지" 알아야 해서 바로 부른다.
   * 페이지 메모 버튼이 이 값을 쓴다.
   */
  onPageChange?: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** 그려진 페이지 영역. 캔버스와 글자 층을 함께 담고 좌표의 기준이 된다. */
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  /** 진행 중인 그리기. 페이지를 빠르게 넘길 때 앞의 것을 멈추는 데 쓴다. */
  const renderRef = useRef<{ cancel: () => void } | null>(null);
  const textRenderRef = useRef<PdfTextLayer | null>(null);
  /** PDF.js 모듈. 글자 층을 만들 때 다시 쓴다. */
  const pdfjsRef = useRef<typeof import("pdfjs-dist") | null>(null);

  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState<number | null>(initialZoom);
  /**
   * 이 쪽에 고를 수 있는 글자가 있는가.
   *
   * 스캔 이미지 PDF에는 글자 층이 없다. 설계 문서 9.5절이 그 경우 안내를
   * 보여주라고 했다. OCR은 MVP 범위 밖이다.
   */
  const [text, setText] = useState<TextLayerState>({ kind: "ok" });

  // -------------------------------------------------------------------------
  // 파일 열기
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let task: PdfLoadingTask | null = null;

    async function open() {
      try {
        // 화면이 뜬 뒤에 불러온다. 서버에서는 이 라이브러리를 부를 수 없다.
        const pdfjs = await import("pdfjs-dist");

        // 글자 층을 만들 때 다시 쓴다.
        pdfjsRef.current = pdfjs;

        // PDF를 실제로 해석하는 일은 별도의 worker에서 돈다.
        // 그래야 문서가 커도 화면이 멈추지 않는다.
        //
        // 주소를 문자열로 적지 않고 new URL로 만든다. 그래야 번들러가 이
        // 파일을 함께 내보내고, pdfjs-dist를 올릴 때 worker도 같이 따라온다.
        // 문자열로 적어두면 버전이 어긋나도 아무도 알려주지 않는다.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loading = pdfjs.getDocument({
          url: `/api/source-files/${encodeURIComponent(fileId)}/content`,
          // 큰 PDF를 구간별로 받는다. 우리 경로가 Range를 지원한다. (9.2절)
          disableRange: false,
          disableStream: false,
        }) as unknown as PdfLoadingTask;

        // 정리 함수가 이 변수를 읽는다. 만들자마자 넣어두어야,
        // 불러오는 도중에 화면을 떠나도 정리된다.
        task = loading;

        // 여기까지 오는 사이에 화면을 떠났을 수 있다.
        // 그 경우 정리 함수는 이미 실행되었으므로 여기서 직접 닫는다.
        if (cancelled) {
          void loading.destroy().catch(() => {});

          return;
        }

        const loaded = (await loading.promise) as PdfDocument;

        if (cancelled) {
          return;
        }

        documentRef.current = loaded;

        setState({ phase: "ready", pageCount: loaded.numPages });
        // 기록된 페이지가 문서 범위를 벗어나 있을 수 있다.
        // 파일이 바뀌었거나 값이 잘못 들어간 경우다. 조용히 1쪽으로 되돌린다.
        setPage((current) => Math.min(Math.max(current, 1), loaded.numPages));
      } catch {
        if (!cancelled) {
          // 내부 사정을 그대로 보여주지 않는다.
          setState({
            phase: "failed",
            message:
              "PDF를 열지 못했습니다. Drive에서 파일이 지워졌거나 연결이 끊겼을 수 있습니다.",
          });
        }
      }
    }

    void open();

    return () => {
      cancelled = true;
      // 그리던 것을 먼저 멈춘다. 그리는 중에 닫으면 오류가 난다.
      renderRef.current?.cancel();
      documentRef.current = null;

      // 이미 닫힌 작업을 다시 닫으면 거부될 수 있다. 정리하는 길이라 삼킨다.
      void task?.destroy().catch(() => {});
    };
  }, [fileId]);

  // -------------------------------------------------------------------------
  // 한 쪽 그리기
  // -------------------------------------------------------------------------
  const draw = useCallback(async () => {
    const loaded = documentRef.current;
    const canvas = canvasRef.current;

    if (!loaded || !canvas) {
      return;
    }

    // 앞서 그리던 것이 있으면 멈춘다.
    // 페이지를 빠르게 넘기면 그리기가 겹쳐서 엉뚱한 쪽이 남는다.
    renderRef.current?.cancel();
    textRenderRef.current?.cancel();

    let target: PdfPage;

    try {
      target = await loaded.getPage(page);
    } catch {
      return;
    }

    // 확대율을 고르지 않았으면 화면 너비에 맞춘다.
    const base = target.getViewport({ scale: 1 });
    const available = containerRef.current?.clientWidth ?? base.width;
    const scale = zoom ?? Math.max(available / base.width, MIN_ZOOM);

    const viewport = target.getViewport({ scale });

    // 화면의 실제 점 밀도에 맞춰 그린다. 이걸 빼면 글자가 흐릿해진다.
    const ratio = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // 페이지 영역을 그림과 같은 크기로 맞춘다.
    // 좌표를 0~1 비율로 바꿀 때 이 영역이 기준이 된다. (설계 문서 6.3절)
    if (pageRef.current) {
      pageRef.current.style.width = `${cssWidth}px`;
      pageRef.current.style.height = `${cssHeight}px`;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const task = target.render({ canvasContext: context, viewport });

    renderRef.current = task;

    try {
      await task.promise;
    } catch {
      // 다음 쪽으로 넘어가며 멈춘 경우다. 오류가 아니다.
      target.cleanup();

      return;
    }

    const rendered = await drawTextLayer({
      pdfjs: pdfjsRef.current,
      layer: textLayerRef.current,
      target,
      viewport,
      scale,
      cssWidth,
      cssHeight,
    });

    textRenderRef.current = rendered.textLayer;
    setText(rendered.text);

    target.cleanup();
  }, [page, zoom]);

  useEffect(() => {
    if (state.phase !== "ready") {
      return;
    }

    void draw();
  }, [draw, state.phase]);

  // -------------------------------------------------------------------------
  // 글 고르기
  // -------------------------------------------------------------------------
  /**
   * 부르는 쪽의 함수를 ref에 담아둔다.
   *
   * draw 안에서도 불러야 하는데, 의존성에 넣으면 부모가 다시 그려질 때마다
   * 페이지를 새로 그리게 된다.
   */
  // 처음부터 prop을 담지 않는다. 훅에 넘긴 값을 나중에 바꾸는 모양이 되면
  // lint가 막는다. 비워 두고 effect에서 채운다.
  const onSelectionChangeRef = useRef<SelectionHandler | undefined>(undefined);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // 쪽이나 배율이 바뀌면 앞서 고른 글은 의미가 없다.
  // 그림이 다시 그려지면서 좌표도 달라지므로 창을 닫는다.
  useEffect(() => {
    onSelectionChangeRef.current?.(null);
  }, [page, zoom]);

  // 지금 몇 쪽인지 바로 알린다. 페이지 메모가 이 값을 쓴다.
  const onPageChangeRef = useRef<((page: number) => void) | undefined>(
    undefined,
  );

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    onPageChangeRef.current?.(page);
  }, [page]);

  useEffect(() => {
    if (state.phase !== "ready") {
      return;
    }

    /**
     * 드래그가 끝난 뒤에 확인한다.
     *
     * selectionchange는 드래그하는 내내 계속 불린다. 그때마다 창을 띄우면
     * 글을 고르는 동안 창이 따라다니며 깜빡인다.
     */
    const onPointerUp = (event: PointerEvent) => {
      /*
        고른 문장 창 안을 누른 것은 여기서 다루지 않는다.

        이 손질이 없으면 창이 쓸 수 없게 된다. 창 안의 입력란이나 버튼을
        누르는 순간 브라우저가 문서의 선택을 풀고, 아래 판단이 그것을
        "고른 글이 없어졌다"로 읽어 창을 닫아버린다. 번역을 고치려고
        글상자를 누르면 창째로 사라지는 식이다.

        창은 고른 글에 딸린 것이지 페이지의 일부가 아니다. 창을 누르는 것과
        페이지의 다른 곳을 눌러 선택을 푸는 것은 다른 행동이다.
      */
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-reader-selection-panel]")
      ) {
        return;
      }

      // 브라우저가 선택을 확정할 틈을 준다.
      window.setTimeout(() => {
        const pageElement = pageRef.current;

        if (!pageElement) {
          return;
        }

        const selection = window.getSelection();

        if (!selection || selection.isCollapsed) {
          onSelectionChangeRef.current?.(null);

          return;
        }

        onSelectionChangeRef.current?.({ pageElement, page });
      }, 0);
    };

    document.addEventListener("pointerup", onPointerUp);

    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [page, state.phase]);

  /*
    칸 크기가 바뀌면 너비 맞춤을 다시 계산한다.
    확대율을 직접 고른 경우에는 건드리지 않는다.

    창이 아니라 **이 칸**을 지켜본다. 14-E에서 좌우 너비를 끌어 바꿀 수 있게
    되면서, 창 크기는 그대로인데 칸만 넓어지는 일이 생겼다. 창만 보면
    끌어서 넓혀도 PDF가 그대로 작게 남는다.
  */
  useEffect(() => {
    const container = containerRef.current;

    if (zoom !== null || state.phase !== "ready" || !container) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let lastWidth = container.clientWidth;

    const observer = new ResizeObserver(() => {
      // 세로만 바뀐 것은 너비 맞춤과 상관없다. 다시 그릴 이유가 없다.
      if (container.clientWidth === lastWidth) {
        return;
      }

      lastWidth = container.clientWidth;

      clearTimeout(timer);
      timer = setTimeout(() => void draw(), 150);
    });

    observer.observe(container);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [draw, zoom, state.phase]);

  // -------------------------------------------------------------------------
  // 보던 자리 기억
  // -------------------------------------------------------------------------
  // 페이지를 넘길 때마다 저장하지 않는다. 빠르게 넘기면 그만큼 요청이 나간다.
  // 잠시 멈췄을 때 한 번만 저장한다.
  useEffect(() => {
    if (state.phase !== "ready" || !onPositionChange) {
      return;
    }

    const timer = setTimeout(() => {
      onPositionChange(page, zoom);
    }, 1200);

    return () => clearTimeout(timer);
  }, [page, zoom, state.phase, onPositionChange]);

  /**
   * 화면을 떠날 때 마지막 자리를 한 번 더 보낸다.
   *
   * 위의 기다렸다 저장하기에는 구멍이 있다. 페이지를 넘기고 1.2초 안에
   * 다른 파일로 바꾸거나 화면을 떠나면, 기다리던 저장이 취소되고 그 자리가
   * 사라진다. 읽다가 바로 나가는 일이 흔해서 자주 걸린다.
   *
   * 그래서 떠날 때 한 번 더 보낸다. 이미 저장된 값과 같아도 무해하다.
   *
   * ref로 최신 값을 들고 있는 이유는, 이 정리 함수가 처음 그려질 때의 값을
   * 가두어 두지 않게 하기 위해서다. 의존성에 page와 zoom을 넣으면 값이 바뀔
   * 때마다 정리 함수가 돌아 떠나지도 않았는데 저장이 나간다.
   */
  const latestRef = useRef<{
    page: number;
    zoom: number | null;
    ready: boolean;
    notify?: (page: number, zoom: number | null) => void;
  }>({ page: initialPage, zoom: initialZoom, ready: false });

  // 그리는 중에 ref를 고치지 않는다. 값이 바뀐 뒤에 따로 담는다.
  useEffect(() => {
    latestRef.current = {
      page,
      zoom,
      ready: state.phase === "ready",
      notify: onPositionChange,
    };
  }, [page, zoom, state.phase, onPositionChange]);

  useEffect(() => {
    return () => {
      const last = latestRef.current;

      // 열리지도 않은 문서의 자리를 적지 않는다.
      if (last.ready) {
        last.notify?.(last.page, last.zoom);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // 조작
  // -------------------------------------------------------------------------
  const pageCount = state.phase === "ready" ? state.pageCount : 0;

  const goToPage = useCallback(
    (next: number) => {
      setPage(Math.min(Math.max(next, 1), Math.max(pageCount, 1)));
    },
    [pageCount],
  );

  function zoomBy(direction: 1 | -1) {
    setZoom((current) => {
      // 너비 맞춤 상태에서 누르면 100%에서 시작한다.
      const from = current ?? 1;
      const index = ZOOM_STEPS.findIndex((step) => step >= from - 0.001);
      const nextIndex =
        (index === -1 ? ZOOM_STEPS.length - 1 : index) + direction;

      const clamped = Math.min(
        Math.max(nextIndex, 0),
        ZOOM_STEPS.length - 1,
      );

      return Math.min(Math.max(ZOOM_STEPS[clamped], MIN_ZOOM), MAX_ZOOM);
    });
  }

  // 키보드로도 넘길 수 있게 한다. 한 손으로 읽는 경우가 많다.
  useEffect(() => {
    if (state.phase !== "ready") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      // 입력란에 타자를 치는 중이면 가로채지 않는다.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToPage(page + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToPage(page - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToPage, page, state.phase]);

  // -------------------------------------------------------------------------
  // 화면
  // -------------------------------------------------------------------------
  if (state.phase === "failed") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        {state.message}
      </p>
    );
  }

  return (
    /*
      작업대 안에서는 높이가 정해진 칸에 들어간다. (14-E)
      h-full로 그 높이를 받고, 아래의 그림 영역이 남는 자리를 모두 차지한다.
      높이가 정해지지 않은 곳에 놓이면 h-full이 자동이 되어 예전처럼 동작한다.
    */
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={state.phase !== "ready" || page <= 1}
          className="h-9 rounded-full border border-black/[.08] px-3 text-sm text-black transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          이전
        </button>

        <div className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          <label htmlFor="pdf-page" className="sr-only">
            페이지 번호
          </label>
          <input
            id="pdf-page"
            type="number"
            min={1}
            max={Math.max(pageCount, 1)}
            value={page}
            disabled={state.phase !== "ready"}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);

              if (Number.isFinite(next)) {
                goToPage(next);
              }
            }}
            className="h-9 w-16 rounded-lg border border-black/[.08] bg-white px-2 text-center text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
          <span className="text-zinc-500">
            / {state.phase === "ready" ? pageCount : "…"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={state.phase !== "ready" || page >= pageCount}
          className="h-9 rounded-full border border-black/[.08] px-3 text-sm text-black transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          다음
        </button>

        <span aria-hidden="true" className="mx-1 text-zinc-300">
          |
        </span>

        <button
          type="button"
          onClick={() => zoomBy(-1)}
          disabled={state.phase !== "ready"}
          aria-label="축소"
          className="h-9 w-9 rounded-full border border-black/[.08] text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          −
        </button>

        <span className="min-w-14 text-center text-sm text-zinc-700 dark:text-zinc-300">
          {zoom === null ? "맞춤" : `${Math.round(zoom * 100)}%`}
        </span>

        <button
          type="button"
          onClick={() => zoomBy(1)}
          disabled={state.phase !== "ready"}
          aria-label="확대"
          className="h-9 w-9 rounded-full border border-black/[.08] text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => setZoom(FIT_WIDTH)}
          disabled={state.phase !== "ready" || zoom === null}
          className="h-9 rounded-full border border-black/[.08] px-3 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          너비 맞춤
        </button>
      </div>

      {/*
        남는 높이를 모두 차지하고 그 안에서만 스크롤한다.
        min-h-0이 없으면 이 칸이 내용만큼 늘어나 바깥이 스크롤된다.

        좁은 화면에서만 최소 높이를 준다. 거기서는 작업대가 높이를 재지 않아
        (fill-viewport.tsx) 이 칸이 기댈 높이가 없다. 넓은 화면에서 이 값을
        주면 반대로 칸보다 커져서 안쪽 스크롤이 사라진다.
      */}
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 justify-center overflow-auto rounded-xl bg-zinc-100 p-4 max-lg:min-h-[60vh] dark:bg-white/[.04]"
      >
        {state.phase === "loading" ? (
          <p className="py-24 text-sm text-zinc-500">PDF를 여는 중…</p>
        ) : null}

        {/*
          hidden으로 감추고 자리를 잡아둔다. 여는 동안 요소를 아예 두지 않으면
          그리려는 순간에 대상이 없어서 첫 쪽이 비어 보인다.

          이 영역이 좌표의 기준이다. 캔버스와 글자 층을 같은 크기로 겹쳐 둔다.
          (설계 문서 6.3절: 좌표는 0~1 비율)
        */}
        <div
          ref={pageRef}
          hidden={state.phase !== "ready"}
          className="relative shadow-sm"
        >
          <canvas ref={canvasRef} className="block" />
          {/*
            보이지 않는 글자가 여기에 놓인다. 스타일은 text-layer.css에 있고
            PDF.js 원본에서 옮겨 온 것이다. 단위 검사가 원본과 맞는지 지킨다.
          */}
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>

      {/*
        설계 문서 9.5절. 텍스트 레이어가 없는 파일을 만나면 알린다.
        OCR은 MVP 범위에서 제외되어 있다.
      */}
      {state.phase === "ready" && text.kind === "empty" ? (
        <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          이 PDF에서는 선택 가능한 텍스트를 찾지 못했습니다. 페이지 메모는
          사용할 수 있으며 OCR 기능은 추후 지원됩니다.
        </p>
      ) : null}

      {/*
        꺼내다 실패한 경우. 스캔본과 다른 상황이라 다르게 말한다.

        이유를 화면에 그대로 적는다. 브라우저 콘솔을 열 수 없는 기기에서는
        이것이 원인을 아는 유일한 길이다. 2026-09-24에 아이패드에서 같은
        논문이 데스크톱과 다르게 동작했는데, 오류를 삼키고 있어서 무엇이
        일어났는지 알 방법이 없었다.
      */}
      {state.phase === "ready" && text.kind === "failed" ? (
        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p>
            이 쪽의 글자를 꺼내지 못했습니다. 파일에 글자가 없는 것이 아니라
            읽다가 실패한 것입니다. 쪽을 넘겼다가 돌아오거나 새로고침하면
            될 때가 있습니다.
          </p>
          <p className="mt-1 break-all text-xs opacity-80">
            이유: {text.reason}
          </p>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        좌우 방향키로도 페이지를 넘길 수 있습니다. 문장을 드래그하면 인용으로
        남길 수 있습니다. 파일은 선생님의 Google Drive에 있고, 이 화면은 볼 때만
        잠깐 받아옵니다.
      </p>
    </div>
  );
}
