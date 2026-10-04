"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createAudioTimeCapture } from "@/app/(app)/captures/actions";
import {
  AUDIO_TIME_KIND,
  MIN_AUDIO_RANGE_SECONDS,
} from "@/lib/captures/audio-locator";
import { formatPosition, formatRange } from "@/lib/media/time";

import { PageMemoPanel } from "./page-memo-panel";

/**
 * 음성을 들으며 그 자리에 메모를 남기는 작업대.
 * (설계 문서 17절·17-4절, 17-V 2차례와 4차례, 2026-10-04)
 *
 * > 음성을 들으면서 지점을 멈추면 그 지점의 위치가 나오면서 그 위치에
 * > 메모를 기록하게 연결하는거지. (…) 구간반복(또는 구간 설정)의 기능도
 * > 만들어서 그 구간에 대해 메모를 기록하도록
 *
 * **2차례에서는 Client Component가 아니었다.** `<audio controls>`만 두었고
 * 브라우저가 다 해주어서 우리 자바스크립트가 필요 없었다. 4차례에서 바뀌었다.
 * **지금 몇 초인지 알아야 하고, 구간을 반복해야 한다.** 둘 다 브라우저가
 * 대신 해주지 않는다.
 *
 * 무엇을 정하는 판단은 여기 두지 않는다
 *   담기는 모양과 주소에 싣는 글자는 `@/lib/captures/audio-locator`에 있고,
 *   시간을 적는 일은 `@/lib/media/time`이 한다. **순수 모듈이라 단위 검사로
 *   확인한다.** 여기에는 재생기를 다루는 일만 남긴다.
 *
 * 메모 칸은 PDF·그림과 같은 것을 쓴다
 *   `PageMemoPanel`이다. 자리를 부르는 말만 밖에서 받는다. PDF는 `3쪽`,
 *   그림은 `2장`, 녹음은 `03:20`이나 `03:20–04:10`이다. **같은 앱에서 세
 *   가지 메모 칸을 만들지 않는다.**
 */

/** 구간을 찍는 중의 상태. 시작만 찍힌 때가 있다. */
type Marks = { start: number | null; end: number | null };

export function AudioReaderView({
  sourceId,
  fileId,
  fileChecksum,
  src,
  initial,
  capturesSlot,
}: {
  sourceId: string;
  fileId: string;
  /** 지금 이 파일의 md5. 기록을 남길 때 그 시점 값을 함께 담는다. */
  fileChecksum: string | null;
  /**
   * Drive에서 흘러나오는 주소. **공개 링크가 아니다.**
   * 이 경로가 세션을 보고 본인 것만 내보낸다. (설계 문서 2.3절)
   */
  src: string;
  /**
   * 기록을 눌러 들어왔을 때 갈 자리. 주소가 정한다.
   *
   * **모양이 어긋나면 `null`이다.** 주소는 사람이 손으로 고칠 수 있는
   * 자리라, 잘못된 값으로 엉뚱한 대목에서 시작하면 그것이 틀렸다는 것을
   * 알릴 길이 없다. (16-2와 같은 생각)
   */
  initial: { startSeconds: number; endSeconds: number | null } | null;
  /** 서버가 그려 넘긴 기록 목록. Server Action을 품고 있어 여기서 못 만든다. */
  capturesSlot: React.ReactNode;
}) {
  const router = useRouter();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [marks, setMarks] = useState<Marks>({
    start: initial?.startSeconds ?? null,
    end: initial?.endSeconds ?? null,
  });
  const [looping, setLooping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /*
    들어온 자리로 옮긴다.

    **`loadedmetadata` 뒤에야 옮길 수 있다.** 그 전에 `currentTime`을 넣으면
    브라우저가 조용히 무시한다. 그러면 기록을 눌러 들어왔는데 처음부터
    재생되고, 왜 그런지 알 수 없다.
  */
  useEffect(() => {
    const audio = audioRef.current;

    if (audio === null || initial === null) {
      return;
    }

    const seek = () => {
      audio.currentTime = initial.startSeconds;
    };

    if (audio.readyState >= 1) {
      seek();

      return;
    }

    audio.addEventListener("loadedmetadata", seek, { once: true });

    return () => audio.removeEventListener("loadedmetadata", seek);
  }, [initial]);

  /*
    구간 반복.

    **`timeupdate`로 돌린다.** `<audio loop>`는 파일 전체만 반복하고 구간을
    모른다. 끝을 지나면 시작으로 되돌린다.

    `timeupdate`는 1초에 네 번쯤 온다. 그래서 끝을 **조금 지나서** 되돌아가는
    것이 보통이고, 그것을 줄이려고 더 자주 재는 길도 있지만 **듣는 데 지장이
    없어서 두었다.** 적어두고 넘어간다.
  */
  useEffect(() => {
    const audio = audioRef.current;

    if (audio === null || !looping) {
      return;
    }

    const { start, end } = marks;

    if (start === null || end === null) {
      return;
    }

    const wrap = () => {
      if (audio.currentTime >= end) {
        audio.currentTime = start;
      }
    };

    audio.addEventListener("timeupdate", wrap);

    return () => audio.removeEventListener("timeupdate", wrap);
  }, [looping, marks]);

  /** 지금 자리를 초(정수)로. 담기는 값이 정수다. */
  function now(): number {
    return Math.floor(audioRef.current?.currentTime ?? 0);
  }

  function markStart() {
    setError(null);
    setNotice(null);

    const start = now();

    setMarks((previous) => ({
      start,
      /*
        **이미 찍힌 끝이 새 시작보다 앞이면 버린다.** 남겨 두면 거꾸로 된
        구간이 되고, 그 상태로 저장을 누르면 거부당하는데 **왜 거부당하는지
        화면이 말해주지 않는다.** 모양이 깨지는 값을 들고 있지 않는다.
      */
      end:
        previous.end !== null && previous.end >= start + MIN_AUDIO_RANGE_SECONDS
          ? previous.end
          : null,
    }));
  }

  function markEnd() {
    setError(null);
    setNotice(null);

    const end = now();
    const start = marks.start;

    if (start === null) {
      setError("먼저 `여기부터`를 눌러 시작을 찍어 주세요.");

      return;
    }

    if (end < start + MIN_AUDIO_RANGE_SECONDS) {
      /*
        **16-2의 `크기 0인 상자`와 같은 자리다.** 같은 자리에 둘을 찍으면
        구간이라고 적혀 있으면서 아무 길이도 없고, 반복은 제자리걸음을 한다.
      */
      setError(
        `구간이 너무 짧습니다. 시작보다 ${MIN_AUDIO_RANGE_SECONDS}초 이상 뒤에서 눌러 주세요.`,
      );

      return;
    }

    setMarks({ start, end });
  }

  function clearMarks() {
    setMarks({ start: null, end: null });
    setLooping(false);
    setError(null);
    setNotice(null);
  }

  /** 찍힌 자리로 재생 머리를 옮긴다. */
  function seekTo(seconds: number) {
    const audio = audioRef.current;

    if (audio !== null) {
      audio.currentTime = seconds;
    }
  }

  /**
   * 메모가 붙을 자리.
   *
   * 셋 가운데 하나다. **찍은 것이 없으면 지금 재생 머리가 있는 자리**다.
   * 그러면 "멈춘 자리에 메모"가 단추 하나 없이 그대로 된다.
   */
  const target: { startSeconds: number; endSeconds: number | null } =
    marks.start !== null
      ? { startSeconds: marks.start, endSeconds: marks.end }
      : { startSeconds: Math.floor(current), endSeconds: null };

  const where = formatRange(target.startSeconds, target.endSeconds);

  async function save(memo: string) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await createAudioTimeCapture({
      sourceId,
      memo,
      locator: {
        kind: AUDIO_TIME_KIND,
        sourceFileId: fileId,
        fileChecksum,
        startSeconds: target.startSeconds,
        endSeconds: target.endSeconds,
      },
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);

      return;
    }

    /*
      **저장한 뒤 찍은 자리를 거둔다.** 남겨 두면 다음 메모가 같은 자리에
      또 달린다. 16-2에서 고른 영역을 거둔 것과 같은 까닭이다.

      반복도 끈다. 저장하고 나서도 같은 구간을 계속 돌면, 다음 메모를
      적으려는 사람이 그 구간에 갇힌다.
    */
    clearMarks();
    setNotice(`${where}에 메모를 남겼습니다.`);
    router.refresh();
  }

  const canLoop = marks.start !== null && marks.end !== null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-2xl bg-zinc-50 px-5 py-5 dark:bg-white/[.04]">
        {/*
          `preload="metadata"`를 쓴다.

          `auto`면 화면을 열기만 해도 파일을 통째로 받아온다. 녹음은 수십
          MB가 흔하고 듣지 않고 지나가는 경우도 있다. `none`이면 **길이가
          표시되지 않아** 얼마나 긴 녹음인지 누르기 전에 알 수 없다.
        */}
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={src}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;

            // 길이를 모르는 파일이 있다. `Infinity`가 온다.
            setDuration(Number.isFinite(value) ? value : null);
          }}
          className="w-full"
        >
          이 브라우저는 음성 재생을 지원하지 않습니다.
        </audio>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-mono tabular-nums text-black dark:text-zinc-50">
            {formatPosition(current)}
            {duration === null ? null : (
              <span className="text-zinc-500"> / {formatPosition(duration)}</span>
            )}
          </span>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markStart}
              className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-xs font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              여기부터
            </button>

            <button
              type="button"
              onClick={markEnd}
              className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-xs font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              여기까지
            </button>

            {/*
              **반복은 구간이 다 찍혔을 때만 누를 수 있다.** 시작만 찍힌
              상태에서 눌러도 돌 곳이 없고, 눌리는데 아무 일도 없으면
              고장으로 보인다.
            */}
            <button
              type="button"
              onClick={() => {
                setLooping((value) => !value);

                if (!looping && marks.start !== null) {
                  seekTo(marks.start);
                }
              }}
              disabled={!canLoop}
              className={`h-9 rounded-full border border-solid px-4 text-xs font-medium transition-colors disabled:opacity-40 ${
                looping
                  ? "border-transparent bg-accent text-white dark:bg-accent-dark dark:text-black"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              }`}
            >
              {looping ? "구간 반복 끄기" : "구간 반복"}
            </button>

            {marks.start === null ? null : (
              <button
                type="button"
                onClick={clearMarks}
                className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                찍은 자리 지우기
              </button>
            )}
          </div>
        </div>

        {/*
          **찍은 자리를 눌러 그 자리로 갈 수 있게 한다.** 구간을 찍어 놓고
          다시 들어보려면 막대를 손으로 끌어야 하는데, 찍은 값이 있으니
          그럴 이유가 없다.
        */}
        {marks.start === null ? (
          <p className="text-xs leading-5 text-zinc-500">
            멈춘 자리에 바로 메모할 수 있습니다. 아래 메모 칸이 지금 자리를
            가리킵니다. 구간에 메모하려면 `여기부터`와 `여기까지`를 누르세요.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>찍은 자리</span>
            <button
              type="button"
              onClick={() => seekTo(marks.start ?? 0)}
              className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark"
            >
              {formatRange(marks.start, marks.end)}
            </button>
            {marks.end === null ? (
              <span>
                — `여기까지`를 누르면 구간이 됩니다. 지금 저장하면 이 시점에
                붙습니다.
              </span>
            ) : null}
          </p>
        )}
      </section>

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

      <section className="rounded-2xl border border-zinc-200 px-5 py-5 dark:border-white/10">
        {/*
          **PDF와 그림이 쓰는 메모 칸을 그대로 쓴다.** 자리를 부르는 말만
          다르다. PDF는 `3쪽`, 그림은 `2장`, 녹음은 `03:20`이다.
        */}
        <PageMemoPanel where={where} busy={busy} onSave={save} />
      </section>

      {capturesSlot}
    </div>
  );
}
