"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { sendFileToDrive } from "@/lib/drive/send-to-drive";
import {
  DRAWING_IMAGE_MIME,
  STROKE_FILE_MIME,
  type DrawingScene,
  createEmptyScene,
  drawingFileNames,
  isSceneEmpty,
  readSceneJson,
  writeSceneJson,
} from "@/lib/drawing/scene";

import { finishFileUpload, startFileUpload } from "../../file-actions";

import { DrawingCanvas, renderSceneToPng } from "./drawing-canvas";

/**
 * 그림판 작업대. 그린 것을 Drive에 담는다. (16-3)
 *
 * 한 그림이 파일 둘로 간다
 *   `<이름>.png`           보이는 것
 *   `<이름>.strokes.json`  고칠 수 있는 것
 *
 *   PNG만 담으면 다시 고칠 수 없고, 획만 담으면 보여줄 것이 없다.
 *   블루프린트 16절이 "함께 저장한다"고 적은 까닭이다.
 *
 * **올리는 길을 새로 만들지 않았다.** 파일 올리기와 같은 순서를 밟는다.
 * (`startFileUpload` → `sendFileToDrive` → `finishFileUpload`) 파일은
 * 우리 서버를 거치지 않고 브라우저에서 Drive로 바로 간다. (설계 문서 10.3절)
 *
 * 왜 PNG를 먼저 올리는가
 *   둘 중 하나만 올라간 상태가 생길 수 있다. 그때 **보이는 것이 있는 쪽이
 *   덜 나쁘다.** PNG만 있으면 그림은 보이고 고칠 수만 없다. 획만 있으면
 *   목록에 아무것도 안 보여서 **그린 것을 잃은 것처럼 보인다.**
 *
 * 창을 닫을 때 알린다
 *   자동 저장이 아직 없다. (`drawing-canvas.tsx`의 `아직 안 한 것`)
 *   그려 놓고 저장하지 않은 채 닫으면 잃는다. **잃는 것을 모르고 잃지
 *   않게** 브라우저에 경고를 맡긴다.
 */
export function DrawingWorkbench({
  sourceId,
  sourceTitle,
  /** 고치러 들어왔을 때의 획 파일. 없으면 새로 그린다. */
  editing,
}: {
  sourceId: string;
  sourceTitle: string;
  editing: { fileId: string; baseName: string } | null;
}) {
  const router = useRouter();

  const [scene, setScene] = useState<DrawingScene>(createEmptyScene);
  const [name, setName] = useState(editing?.baseName ?? sourceTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 저장하지 않은 것이 있는가.
   *
   * **저장한 뒤에는 거짓이다.** 저장하자마자 다시 참이면 닫을 때마다
   * 경고가 뜨고, 그러면 사람은 그 경고를 읽지 않게 된다.
   */
  const [dirty, setDirty] = useState(false);

  /** 고치러 들어왔으면 담긴 획을 받아 와 캔버스에 올린다. */
  const [loading, setLoading] = useState(editing !== null);

  useEffect(() => {
    if (!editing) {
      return;
    }

    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/source-files/${editing.fileId}/content`,
        );

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const parsed = readSceneJson(await response.text());

        if (!alive) {
          return;
        }

        /*
          **모양이 어긋나면 빈 그림으로 둘러대지 않는다.** 둘러대면 그리던
          것을 잃은 채 새로 시작하게 되고, 저장하면 옛 그림을 덮어쓴다.
        */
        if (parsed === null) {
          setError(
            "담긴 그림을 읽지 못했습니다. 덮어쓰지 않도록 비워 두었습니다. 새 이름으로 저장해 주세요.",
          );
        } else {
          setScene(parsed);
        }
      } catch {
        if (alive) {
          setError(
            "담긴 그림을 받아오지 못했습니다. 연결 상태를 확인하고 새로 고쳐 주세요.",
          );
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [editing]);

  /*
    저장하지 않은 채 닫으려 하면 브라우저가 묻는다.

    **우리가 창을 막을 수는 없다.** 브라우저가 정해 둔 한 가지 길뿐이고,
    띄울 글도 우리가 고르지 못한다. 그래도 **아무 말 없이 잃는 것**보다 낫다.
  */
  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** 파일 하나를 Drive로. 올린 뒤 확인까지 한다. */
  async function upload(file: File): Promise<string | null> {
    const started = await startFileUpload({
      sourceId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });

    if (!started.ok) {
      setError(started.message);

      return null;
    }

    /*
      올라가는 동안의 진행률은 받지 않는다. 그림 파일은 작아서(획을 담은
      json은 수십 KB, PNG는 수백 KB) **진행률이 뜨기도 전에 끝난다.**
      파일 올리기 화면은 수십 MB짜리 PDF를 다루므로 그쪽에는 필요하다.
    */
    const driveFileId = await sendFileToDrive(started.uploadUrl, file, () => {});

    if (!driveFileId) {
      setError("그림을 보내지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");

      return null;
    }

    const finished = await finishFileUpload({
      fileId: started.fileId,
      driveFileId,
    });

    if (!finished.ok) {
      setError(finished.message);

      return null;
    }

    return started.fileId;
  }

  async function save() {
    setError(null);
    setNotice(null);

    const baseName = name.trim();

    if (baseName.length === 0) {
      setError("그림 이름을 적어 주세요.");

      return;
    }

    /*
      **빈 그림을 담지 않는다.** 아무것도 안 그리고 저장을 누르면 빈 파일
      둘이 Drive에 올라간다. 지우는 길은 있지만 만들지 않는 편이 낫다.
    */
    if (isSceneEmpty(scene)) {
      setError("아직 그린 것이 없습니다.");

      return;
    }

    setBusy(true);

    const png = await renderSceneToPng(scene);

    if (!png) {
      setBusy(false);
      setError("그림을 그림 파일로 바꾸지 못했습니다.");

      return;
    }

    const names = drawingFileNames(baseName);

    // 보이는 것을 먼저 올린다. 까닭은 머리말에 적었다.
    const imageId = await upload(
      new File([png], names.image, { type: DRAWING_IMAGE_MIME }),
    );

    if (imageId === null) {
      setBusy(false);

      return;
    }

    const strokes = await upload(
      new File([writeSceneJson(scene)], names.strokes, {
        type: STROKE_FILE_MIME,
      }),
    );

    setBusy(false);

    if (strokes === null) {
      /*
        **보이는 것은 올라갔고 고칠 수 있는 것만 못 올라갔다.** 그 상태를
        그대로 알린다. 그린 것이 사라진 것이 아니라 다시 고칠 수 없는
        상태라는 것을 알아야 한다.
      */
      setNotice(
        "그림은 저장했지만 다시 고칠 수 있는 자료는 올리지 못했습니다. 한 번 더 저장하면 그쪽만 다시 올립니다.",
      );
      setDirty(true);
      router.refresh();

      return;
    }

    setDirty(false);
    setNotice(`${names.image}으로 저장했습니다.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg bg-zinc-50 px-4 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-lg bg-zinc-50 px-4 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
          담긴 그림을 받아오는 중…
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            그림 이름
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="h-10 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm text-black outline-none focus:border-accent dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-accent-dark"
          />
        </label>

        <button
          type="button"
          onClick={save}
          disabled={busy || loading}
          className="h-10 shrink-0 rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {busy ? "저장하는 중…" : "그림 저장"}
        </button>
      </div>

      {/*
        **이름이 같으면 파일이 또 생긴다.** Drive는 같은 이름을 덮지 않고
        나란히 둔다. 고치러 들어왔을 때 그 이름 그대로 저장하면 같은 이름이
        둘이 된다. 그것을 미리 말해 준다.
      */}
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        저장하면 <strong className="font-medium">보이는 그림(.png)</strong>과{" "}
        <strong className="font-medium">다시 고칠 수 있는 자료</strong> 둘이
        함께 올라갑니다. 같은 이름으로 저장하면 전에 올린 것을 덮지 않고
        따로 쌓입니다.
      </p>

      <DrawingCanvas
        scene={scene}
        onSceneChange={(next) => {
          setScene(next);
          setDirty(true);
        }}
        disabled={busy || loading}
      />
    </div>
  );
}
