import { Panel, Reveal } from "@/app/(app)/panel";
import type { MediaKind } from "@/lib/media/works";

import { captureMediaMoment } from "./media-actions";

/**
 * 본 대목에 기록을 남긴다. (설계 문서 15절)
 *
 *   "시즌, 회차, 타임코드를 Capture 위치로 저장한다."
 *
 * **영화와 드라마가 다르다.** 영화에는 시즌과 회차가 없다. 그 칸을
 * 보여주면 "여기에 뭘 적어야 하지"가 생기고, 비워두면 될 칸이 화면을
 * 차지한다. 작품 갈래를 이미 담아뒀으니 그것으로 가른다.
 *
 * **브라우저에서 돌릴 코드가 없다.** YouTube의 시점 기록은 재생기에서
 * 지금 시점을 읽어와야 해서 client였다. 여기는 사람이 직접 적는다.
 * 우리가 틀어주는 것이 아니기 때문이다. (15절)
 *
 * **접어 둔다.** 자료 화면에 오는 이유는 보고 읽는 것이고, 기록을 남기는
 * 일은 그다음이다. (AGENTS.md 6절 `새로 적는 칸을 처음부터 펼쳐두지 않는다`)
 */
export function MediaMomentForm({
  sourceId,
  kind,
  returnTo,
  defaultOpen = false,
}: {
  sourceId: string;
  /** 영화인지 드라마인지. 시즌·회차 칸을 보여줄지 가른다. */
  kind: MediaKind;
  returnTo: string;
  /** 적다가 틀려 되돌아온 경우. 닫힌 칸 안의 오류는 볼 수가 없다. */
  defaultOpen?: boolean;
}) {
  const isSeries = kind === "tv";

  return (
    <Panel
      title="본 대목 남기기"
      help="media-moment"
      helpLabel="본 대목 남기기"
      hint={
        isSeries
          ? "몇 시즌 몇 화 어디쯤이었는지와 함께 남깁니다."
          : "몇 분쯤이었는지와 함께 남깁니다."
      }
    >
      <Reveal label="본 대목 남기기" defaultOpen={defaultOpen}>
        <form action={captureMediaMoment} className="flex flex-col gap-3">
          <input type="hidden" name="sourceId" value={sourceId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="flex flex-wrap items-end gap-2">
            {/*
              시즌과 회차는 드라마에만 보여준다. 영화에서는 칸 자체를
              만들지 않는다. **서버는 빈 값으로 받고, 그러면 담기지 않는다.**
            */}
            {isSeries ? (
              <>
                <label className="flex w-24 flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    시즌
                  </span>
                  <input
                    name="season"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="2"
                    className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </label>

                <label className="flex w-24 flex-col gap-1.5">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    회차
                  </span>
                  <input
                    name="episode"
                    type="number"
                    min={1}
                    max={100000}
                    placeholder="3"
                    className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
                  />
                </label>
              </>
            ) : null}

            <label className="flex w-32 flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                시점
              </span>
              <input
                name="position"
                type="text"
                maxLength={20}
                placeholder="12:30"
                className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </label>
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            {isSeries
              ? "셋 중 하나만 적어도 됩니다. 시즌이 하나뿐이면 회차만, 회차 전체를 가리키려면 시점을 비웁니다."
              : "`12:30`이나 `1:12:00`처럼 적습니다. 초만 적어도 됩니다."}
          </p>

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
            남기기
          </button>

          {/*
            누를 수 없다는 것을 미리 밝힌다.

            YouTube에서는 시점을 누르면 재생기가 그리로 간다. 여기서는
            그렇지 않다. **OTT 영상을 우리가 틀 수 없기 때문이다.** (15절)
            기대하고 눌렀다가 아무 일도 없으면 고장으로 보인다.
          */}
          <p className="text-xs leading-5 text-zinc-500">
            남긴 기록에는 `시즌 2 · 3화 · 12:30`처럼 붙어 보입니다.{" "}
            <strong className="font-medium text-zinc-600 dark:text-zinc-400">
              눌러서 그 장면으로 가지는 않습니다.
            </strong>{" "}
            영상은 그 서비스에 있고 우리가 틀지 않습니다.
          </p>
        </form>
      </Reveal>
    </Panel>
  );
}
