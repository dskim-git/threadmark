"use client";

import { useEffect, useRef, useState } from "react";

import { Panel } from "@/app/(app)/panel";
import { formatPosition } from "@/lib/media/time";
import {
  PLAYER_HOST,
  loadYouTubeApi,
  type YouTubePlayer,
} from "@/lib/youtube/iframe-api";
import { watchUrl } from "@/lib/youtube/video-id";

import { captureVideoMoment } from "./youtube-actions";

/**
 * 영상을 앱 안에서 틀고, 보던 시점을 기록으로 남긴다. (설계 문서 14절)
 *
 * **여기가 이 기능의 값어치다.** 영상을 담아두기만 하는 것은 즐겨찾기와
 * 다르지 않다. 보다가 "여기다" 싶은 순간에 그 자리에서 한 줄 남길 수
 * 있어야 나중에 그 대목으로 돌아온다.
 *
 * 음악에서는 시간을 적어두기만 하고 눌러서 이동하지는 못했다. 들을 수 있는
 * 곳의 링크만 담고 재생기가 없기 때문이다. **영상은 우리가 틀 수 있어서
 * 그 아쉬움을 채운다.**
 *
 * **퍼가기가 막힌 영상은 틀지 않는다.** 올린 사람이 막아둔 것이고, 그래도
 * 틀면 검은 화면에 오류만 뜬다. 미리 알고 바깥으로 보낸다. (14절)
 *
 * **기록 목록과 떨어져 있다.** 재생기는 위에 있고 기록은 아래에 있다.
 * 둘이 부모·자식이 아니라 형제라서 상태를 물려줄 수 없다. 그래서 창 전체에
 * 대고 말을 건다. (아래 `seek` 주석 참고)
 */

/** 기록 줄을 누르면 이 이름으로 창에 알린다. 재생기가 받는다. */
export const SEEK_EVENT = "threadmark:video-seek";

export function YoutubePlayer({
  sourceId,
  videoId,
  embeddable,
  returnTo,
}: {
  sourceId: string;
  videoId: string;
  /** `null`은 모른다는 뜻이다. false와 다르다. */
  embeddable: boolean | null;
  returnTo: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** `지금 시점 담기`를 누르면 여기 담긴다. 폼이 이 값을 보낸다. */
  const [marked, setMarked] = useState<number | null>(null);

  /*
    퍼가기가 막혔거나 모르는 영상은 재생기를 만들지 않는다.

    **모르는 것을 틀어보고 되는지 보는 방법도 있다.** 그러지 않는 이유는,
    안 되는 경우에 사용자가 보는 것이 검은 상자이고 그 상자가 "고장"으로
    보이기 때문이다. 모르면 거부한다. (보안 원칙 7과 같은 생각이다)
  */
  const canPlay = embeddable === true;

  useEffect(() => {
    if (!canPlay) {
      return;
    }

    let cancelled = false;

    loadYouTubeApi()
      .then((api) => {
        /*
          기다리는 동안 화면이 사라졌을 수 있다. React 19는 개발 중에
          effect를 두 번 돌리므로 이 확인이 없으면 재생기가 둘 생긴다.
        */
        if (cancelled || !mountRef.current) {
          return;
        }

        playerRef.current = new api.Player(mountRef.current, {
          videoId,
          host: PLAYER_HOST,
          playerVars: {
            // 관련 영상을 이 채널 것으로 좁힌다. 남의 영상으로 끌고 가지 않는다.
            rel: 0,
            // 우리가 시점을 넘길 수 있어야 한다.
            enablejsapi: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (!cancelled) {
                setReady(true);
              }
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        /*
          **실패한 이유를 화면에 적는다.** 아이패드에는 콘솔을 붙일 수
          없다. 그 한 줄이 없으면 사용자가 읽어줄 것이 없다.
          (AGENTS.md 6절 `사파리에는 있는 줄 알았던 것이 없다`)
        */
        setFailed(
          error instanceof Error
            ? error.message
            : "재생기를 준비하지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;

      /*
        떠날 때 재생기를 없앤다. 두고 가면 소리가 계속 난다.
        이미 없어진 뒤에 부르면 던지므로 감싼다.
      */
      try {
        playerRef.current?.destroy();
      } catch {
        // 이미 없어진 것이다. 할 일이 없다.
      }

      playerRef.current = null;
    };
  }, [canPlay, videoId]);

  /*
    기록 줄을 누르면 그 시점으로 건너뛴다. (14절)

    **창 전체에 대고 말을 건다.** 재생기와 기록 목록이 화면에서 형제라
    상태를 물려줄 수 없고, 기록 목록은 서버가 그리는 칸이라 브라우저 쪽
    값을 받을 수도 없다.

    이 방식의 약점은 이름을 글자로 맞춰야 한다는 것이다. 그래서 그 이름을
    이 파일이 내보내고 누르는 쪽이 가져다 쓴다. 양쪽에 따로 적으면 한쪽만
    고쳐진다. (AGENTS.md 2절 "두 칸이 같은 값을 써야 하면 그 값을 위로
    올린다")
  */
  useEffect(() => {
    if (!canPlay) {
      return;
    }

    const onSeek = (event: Event) => {
      const seconds = (event as CustomEvent<{ seconds?: unknown }>).detail
        ?.seconds;

      if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
        return;
      }

      const player = playerRef.current;

      if (!player) {
        return;
      }

      player.seekTo(Math.max(0, Math.floor(seconds)), true);
      player.playVideo();

      // 재생기가 화면 밖이면 보이는 데까지 올려준다. 소리만 나면 놀란다.
      mountRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    window.addEventListener(SEEK_EVENT, onSeek);

    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, [canPlay]);

  function mark() {
    const player = playerRef.current;

    if (!player) {
      return;
    }

    /*
      **소수점을 버린다.** `getCurrentTime()`은 `754.382`처럼 온다. 초로
      담기로 했고(video-locator.ts), 소수를 담으면 목록에 `12:34`로 보이는
      값 둘이 데이터베이스에서는 다른 값이 된다.
    */
    setMarked(Math.max(0, Math.floor(player.getCurrentTime())));
    player.pauseVideo();
  }

  return (
    <Panel
      title="영상 보기"
      help="youtube-play"
      helpLabel="영상 보며 기록하기"
      hint={
        canPlay
          ? "보다가 `지금 시점 담기`를 누르면 그 순간이 기록에 남습니다."
          : undefined
      }
    >
      {canPlay ? (
        <>
          {/*
            16:9로 자리를 잡아둔다. 재생기가 뜨기 전에 높이가 0이면 그
            아래 칸들이 위로 올라왔다가 다시 내려간다. 읽던 자리가 튄다.
          */}
          <div className="relative w-full overflow-hidden rounded-xl bg-black pt-[56.25%]">
            <div ref={mountRef} className="absolute inset-0 h-full w-full" />
          </div>

          {failed ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              {failed}{" "}
              <a
                href={watchUrl(videoId)}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2"
              >
                YouTube에서 보기 →
              </a>
            </p>
          ) : null}

          <form
            action={captureVideoMoment}
            className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-white/[.04]"
          >
            <input type="hidden" name="sourceId" value={sourceId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              type="hidden"
              name="startSeconds"
              value={marked === null ? "" : String(marked)}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={mark}
                disabled={!ready}
                className="h-9 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                {ready ? "지금 시점 담기" : "재생기를 준비하는 중…"}
              </button>

              {marked === null ? (
                <span className="text-xs text-zinc-500">
                  누르면 보고 있던 시점이 여기 잡힙니다.
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                    {formatPosition(marked)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMarked(null)}
                    className="whitespace-nowrap text-xs text-zinc-500 underline underline-offset-2 hover:text-black dark:hover:text-zinc-200"
                  >
                    취소
                  </button>
                </>
              )}
            </div>

            {/*
              시점을 잡기 전에는 적는 칸을 보여주지 않는다. 적어두고 시점을
              안 잡으면 저장이 거절되는데, 그때 적은 글이 사라진다.
            */}
            {marked !== null ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    이 대목에 남길 말
                  </span>
                  <textarea
                    name="content"
                    rows={3}
                    required
                    maxLength={5000}
                    placeholder="여기서 무엇을 봤는지 적으세요"
                    className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </label>

                <button
                  type="submit"
                  className="h-9 w-fit shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                >
                  이 시점에 기록 남기기
                </button>
              </>
            ) : null}
          </form>
        </>
      ) : (
        /*
          퍼가기가 막혔거나 아직 모르는 영상.

          **왜 여기서 볼 수 없는지 적는다.** 적지 않으면 고장으로 보인다.
          두 경우를 갈라 적는다. 할 일이 다르기 때문이다.
        */
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-5 text-sm leading-7 dark:bg-white/[.04]">
          <p className="text-zinc-700 dark:text-zinc-300">
            {embeddable === false
              ? "올린 사람이 다른 곳에서 트는 것을 막아둔 영상입니다. YouTube에서 봐야 합니다."
              : "아직 이 영상을 앱에서 틀 수 있는지 모릅니다. 위 `영상 정보`에서 `찾기`를 눌러 확인해 주세요."}
          </p>

          <a
            href={watchUrl(videoId)}
            target="_blank"
            rel="noreferrer noopener"
            className="h-10 w-fit shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium leading-10 text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            YouTube에서 보기 →
          </a>
        </div>
      )}
    </Panel>
  );
}
