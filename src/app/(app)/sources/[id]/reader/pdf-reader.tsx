"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup: () => void;
};

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
}: {
  fileId: string;
  initialPage: number;
  initialZoom: number | null;
  /** 보던 자리가 바뀌었을 때. 부르는 쪽이 저장을 맡는다. */
  onPositionChange?: (page: number, zoom: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  /** 진행 중인 그리기. 페이지를 빠르게 넘길 때 앞의 것을 멈추는 데 쓴다. */
  const renderRef = useRef<{ cancel: () => void } | null>(null);

  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState<number | null>(initialZoom);

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

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const task = target.render({ canvasContext: context, viewport });

    renderRef.current = task;

    try {
      await task.promise;
    } catch {
      // 다음 쪽으로 넘어가며 멈춘 경우다. 오류가 아니다.
    } finally {
      target.cleanup();
    }
  }, [page, zoom]);

  useEffect(() => {
    if (state.phase !== "ready") {
      return;
    }

    void draw();
  }, [draw, state.phase]);

  // 창 크기가 바뀌면 너비 맞춤을 다시 계산한다.
  // 확대율을 직접 고른 경우에는 건드리지 않는다.
  useEffect(() => {
    if (zoom !== null || state.phase !== "ready") {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void draw(), 150);
    };

    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
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

      <div
        ref={containerRef}
        className="flex justify-center overflow-auto rounded-xl bg-zinc-100 p-4 dark:bg-white/[.04]"
      >
        {state.phase === "loading" ? (
          <p className="py-24 text-sm text-zinc-500">PDF를 여는 중…</p>
        ) : null}

        {/*
          hidden으로 감추고 자리를 잡아둔다. 여는 동안 canvas를 아예 두지 않으면
          그리려는 순간에 캔버스가 없어서 첫 쪽이 비어 보인다.
        */}
        <canvas
          ref={canvasRef}
          hidden={state.phase !== "ready"}
          className="max-w-full shadow-sm"
        />
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        좌우 방향키로도 페이지를 넘길 수 있습니다. 파일은 선생님의 Google
        Drive에 있고, 이 화면은 볼 때만 잠깐 받아옵니다.
      </p>
    </div>
  );
}
