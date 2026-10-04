"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { sendFileToDrive } from "@/lib/drive/send-to-drive";
import {
  MAX_RECORDING_SECONDS,
  pickRecordingMimeType,
  recordingFileName,
} from "@/lib/audio/recording";
/*
  **시간을 적는 일은 `media/time.ts`가 한다.** 음악과 영상이 쓰던 것이고
  녹음 길이도 같은 값이다. 한때 녹음 쪽에 같은 함수를 따로 두었는데,
  두 벌이 되면 한쪽만 고쳐진다. (그 파일 머리말)
*/
import { formatPosition } from "@/lib/media/time";

import { finishFileUpload, startFileUpload } from "../../file-actions";

/**
 * 이 브라우저에서 녹음이 되는가.
 *
 * **`useEffect`에서 상태를 넣지 않는다.** 그렇게 쓰면 `react-hooks` 규칙이
 * 막는다. 바뀌지 않는 값을 효과로 넣는 것은 한 번 더 그리게 만드는 일이고,
 * 이 값은 한 번 정해지면 그대로다.
 *
 * `useSyncExternalStore`가 **서버와 브라우저에서 다른 값**을 다루는 자리다.
 * 서버에는 `MediaRecorder`가 없으므로 그쪽은 `null`(모른다)을 준다.
 */
const SUBSCRIBE_NOTHING = () => () => {};

function readRecordingSupport(): boolean {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof navigator.mediaDevices?.getUserMedia !== "function"
  ) {
    return false;
  }

  return (
    pickRecordingMimeType((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) !== null
  );
}

/** 서버에서는 모른다. 모를 때는 아무 말도 하지 않는다. */
const readUnknownSupport = (): boolean | null => null;

/**
 * 브라우저로 녹음해 Drive에 담는다. (설계 문서 17절, 17-V 3차례, 2026-10-04)
 *
 * **올리는 길은 이미 있는 것을 쓴다.**
 * (`startFileUpload` → `sendFileToDrive` → `finishFileUpload`) 16-3 그림판이
 * 그 길을 다시 쓴 것과 같다. 녹음도 "브라우저에서 만든 파일 하나를 Drive로"다.
 *
 * 무엇을 정하는 판단은 여기 두지 않는다
 *   어느 형식으로 녹음할지, 꼬리를 어떻게 떼는지, 이름을 어떻게 만드는지는
 *   `@/lib/audio/recording`에 있다. **브라우저 API를 부르지 않는 순수
 *   판단이라 단위 검사로 확인한다.** 2차례에서 `isReadable`에 검사가 하나도
 *   없던 까닭이 그것이 검사가 불러올 수 없는 파일에 있었기 때문이었다.
 *
 * 멈춘 뒤에 바로 올리지 않는다
 *   멈추면 **들어볼 수 있게** 하고, 저장은 따로 누른다. 말이 제대로 담겼는지
 *   모르고 올리면 빈 녹음이 Drive에 쌓인다. 마이크 권한은 허용했는데 다른
 *   앱이 마이크를 쥐고 있어 **소리가 하나도 안 담기는** 경우가 있다.
 *
 * 저장하지 않고 떠나면 잃는다
 *   그림판과 같은 자리라 같은 방식으로 막는다. 담긴 것이 있는데 닫으려 하면
 *   브라우저가 한 번 묻는다. **아직 자동 저장이 없다.**
 */
export function Recorder({ sourceId }: { sourceId: string }) {
  const router = useRouter();

  const supported = useSyncExternalStore<boolean | null>(
    SUBSCRIBE_NOTHING,
    readRecordingSupport,
    readUnknownSupport,
  );

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 멈춰서 들어볼 수 있는 녹음. 저장하면 비운다. */
  const [take, setTake] = useState<{
    blob: Blob;
    url: string;
    mimeType: string;
    seconds: number;
  } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 멈춘 시점의 길이. `stop` 뒤에 상태가 아직 바뀌기 전이라 여기서 읽는다. */
  const secondsRef = useRef(0);

  /** 마이크를 놓고 시계를 멈춘다. */
  function release() {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    /*
      **마이크를 놓는 일을 빠뜨리면 탭에 녹음 표시가 남는다.** 녹음이
      끝났는데 계속 듣고 있는 것처럼 보이고, 실제로 마이크가 잡혀 있어
      다른 앱이 쓰지 못한다.
    */
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  // 화면을 떠날 때도 놓는다. 녹음 중에 뒤로 가는 일이 있다.
  useEffect(() => release, []);

  /*
    담긴 것이 있는데 닫으려 하면 한 번 묻는다. (16-3과 같은 자리)

    녹음 중일 때도 묻는다. 그때가 잃을 것이 가장 많은 때다.
  */
  useEffect(() => {
    if (!recording && take === null) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [recording, take]);

  /** 들어보던 것을 버린다. 주소를 놓아주는 것까지 한다. */
  function clearTake() {
    setTake((current) => {
      if (current !== null) {
        /*
          **`createObjectURL`로 만든 주소는 놓아줘야 한다.** 안 놓으면 그
          소리가 탭이 닫힐 때까지 메모리에 남는다. 한 시간짜리 녹음을
          여러 번 하면 쌓인다.
        */
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
  }

  async function start() {
    setError(null);
    setNotice(null);
    clearTake();

    const picked = pickRecordingMimeType((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    );

    if (picked === null) {
      setError("이 브라우저에서는 녹음할 수 없습니다.");

      return;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      /*
        **거절과 고장을 가르지 않는다.** 권한을 거절했는지 마이크가 없는지
        브라우저가 분명히 말해주지 않고, 할 일은 둘 다 같다. 다만 무엇을
        해봐야 하는지는 적는다.
      */
      setError(
        "마이크를 쓸 수 없습니다. 브라우저의 마이크 권한을 허용했는지 확인해 주세요.",
      );

      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);

    const recorder = new MediaRecorder(stream, { mimeType: picked.recorder });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      /*
        **담는 종류는 꼬리를 뗀 쪽이다.** 녹음기에 건넨 말
        (`audio/webm;codecs=opus`)을 그대로 올리면 받는 쪽이 거부한다.
        (17-V.9절, `recording.ts`)
      */
      const blob = new Blob(chunksRef.current, { type: picked.stored });

      chunksRef.current = [];

      if (blob.size === 0) {
        setError("담긴 소리가 없습니다. 마이크를 확인하고 다시 해주세요.");

        return;
      }

      setTake({
        blob,
        url: URL.createObjectURL(blob),
        mimeType: picked.stored,
        seconds: secondsRef.current,
      });
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);

    tickRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);

      /*
        **상한에 닿으면 그 자리에서 멈추고 알린다.** 조용히 버리지 않는다.
        (16-3에서 획 한계에 닿았을 때와 같다) 녹음이 저장되지 않는 상태를
        모르고 계속 말하는 것이 가장 나쁘다.
      */
      if (secondsRef.current >= MAX_RECORDING_SECONDS) {
        stop();
        setNotice(
          `한 번에 ${formatPosition(MAX_RECORDING_SECONDS)}까지 녹음합니다. 여기서 멈췄습니다. 담긴 것은 그대로 있으니 저장해 주세요.`,
        );
      }
    }, 1000);
  }

  function stop() {
    const recorder = recorderRef.current;

    if (recorder !== null && recorder.state !== "inactive") {
      recorder.stop();
    }

    release();
    setRecording(false);
  }

  async function save() {
    if (take === null) {
      return;
    }

    setError(null);
    setBusy(true);

    const fileName = recordingFileName({
      typed: name,
      mimeType: take.mimeType,
      at: new Date(),
    });

    const file = new File([take.blob], fileName, { type: take.mimeType });

    const started = await startFileUpload({
      sourceId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });

    if (!started.ok) {
      setBusy(false);
      setError(started.message);

      return;
    }

    const driveFileId = await sendFileToDrive(started.uploadUrl, file, () => {});

    if (!driveFileId) {
      setBusy(false);
      setError(
        "녹음을 보내지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요. 담긴 것은 그대로 있습니다.",
      );

      return;
    }

    const finished = await finishFileUpload({
      fileId: started.fileId,
      driveFileId,
    });

    setBusy(false);

    if (!finished.ok) {
      setError(finished.message);

      return;
    }

    /*
      **저장한 뒤에 들어보던 것을 비운다.** 남겨 두면 저장을 한 번 더 눌러
      같은 녹음이 Drive에 둘로 쌓인다. 16-2에서 "고른 영역은 저장하면
      거둬진다"와 같은 생각이다.
    */
    clearTake();
    setName("");
    setSeconds(0);
    setNotice(`${fileName}을 저장했습니다.`);
    router.refresh();
  }

  if (supported === false) {
    return (
      <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
        이 브라우저에서는 녹음할 수 없습니다. 다른 기기에서 녹음한 파일은 자료
        화면의 `파일 붙이기`로 올릴 수 있습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        **동의 안내를 녹음 단추 옆에 늘 둔다.** (설계 문서 17절, 17-V.5절)

        한 번 뜨고 사라지는 안내로 두지 않는다. 그러면 오늘 처음 녹음하는
        사람은 보고 다음 주에 녹음하는 사람은 못 본다. **녹음은 되돌릴 수
        없는 일이라 그때 봐야 한다.**

        16-2에서 "끌 수 있다는 것을 말해 준다"고 적은 것과 방향만 다르고
        결과가 같다. 보이지 않는 것은 모른 채 지나간다.
      */}
      <p
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      >
        다른 분의 목소리가 담길 때는 <strong>미리 그분의 동의를 받아
        주세요.</strong> 수업이나 면담을 녹음하실 때가 그렇습니다. 녹음한
        파일은 선생님의 Google Drive에 저장되며 ThreadMark는 그 내용을 따로
        보관하지 않습니다.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-black/[.08] bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-white/[.145] dark:bg-white/[.04] dark:text-zinc-300">
          {notice}
        </p>
      ) : null}

      <section className="flex flex-col items-center gap-4 rounded-2xl bg-zinc-50 px-5 py-8 dark:bg-white/[.04]">
        {/*
          녹음 중에는 흐른 시간을 보여준다.

          **담을 곳이 아직 없다.** 길이를 담는 칸은 4차례의 표에 있다.
          (17-V.2절) 여기서는 "지금 얼마나 됐는가"를 알려주는 데만 쓴다.
          **담을 자리가 없는 값을 담은 척하지 않는다.**
        */}
        <p
          aria-live={recording ? "polite" : "off"}
          className="font-mono text-3xl tabular-nums text-black dark:text-zinc-50"
        >
          {formatPosition(recording ? seconds : (take?.seconds ?? 0))}
        </p>

        {recording ? (
          <>
            <button
              type="button"
              onClick={stop}
              className="h-11 rounded-full bg-red-600 px-6 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              녹음 멈추기
            </button>
            <p className="text-xs text-zinc-500">
              한 번에 {formatPosition(MAX_RECORDING_SECONDS)}까지
              녹음합니다.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="h-11 rounded-full bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            {take === null ? "녹음 시작" : "다시 녹음"}
          </button>
        )}
      </section>

      {/*
        멈춘 뒤에 **들어보고** 저장한다. 바로 올리지 않는 까닭은 머리말에 적었다.
      */}
      {take !== null && !recording ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 px-5 py-5 dark:border-white/10">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            들어보고 저장하기
          </h2>

          <audio controls src={take.url} className="w-full">
            이 브라우저는 음성 재생을 지원하지 않습니다.
          </audio>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              녹음 이름
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="적지 않으면 녹음한 시각으로 붙습니다"
              className="h-11 rounded-lg border border-black/[.08] bg-white px-4 text-sm text-black dark:border-white/[.145] dark:bg-transparent dark:text-zinc-50"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="h-11 rounded-full bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
            >
              {busy ? "저장하는 중…" : "이 자료에 저장"}
            </button>

            <button
              type="button"
              onClick={() => {
                clearTake();
                setSeconds(0);
              }}
              disabled={busy}
              className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              버리기
            </button>
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            저장하지 않고 이 화면을 떠나면 녹음이 사라집니다. 아직 자동 저장이
            없습니다.
          </p>
        </section>
      ) : null}
    </div>
  );
}
