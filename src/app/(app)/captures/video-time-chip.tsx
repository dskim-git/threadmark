"use client";

import { SEEK_EVENT } from "@/app/(app)/sources/youtube-player";
import {
  describeVideoTime,
  type VideoTimeLocator,
} from "@/lib/captures/video-locator";

/**
 * 기록에 붙은 영상 시점. 누르면 그 시점으로 건너뛴다. (설계 문서 14절)
 *
 * **음악의 시점 표시와 생김새는 같고 하는 일이 다르다.** 음악은 적어둔
 * 시간을 보여주기만 한다. 우리가 틀 수 있는 재생기가 없기 때문이다.
 * 영상은 눌러서 갈 수 있다.
 *
 * 생김새가 같으면 하나는 눌리고 하나는 안 눌리는 것이 헷갈린다. 그래서
 * 이쪽에만 **누를 수 있다는 표시**를 붙인다. 손 모양 커서와 `▸`다.
 *
 * **창 전체에 대고 말을 건다.** 이 줄은 서버가 그리는 기록 목록 안에 있고
 * 재생기는 다른 칸에 있다. 둘이 형제라 상태를 물려줄 수 없다.
 * 이름은 재생기 쪽이 정하고 여기서 가져다 쓴다. 양쪽에 따로 적으면 한쪽만
 * 고쳐진다. (youtube-player.tsx)
 *
 * **재생기가 없어도 안전하다.** 퍼가기가 막힌 영상에서는 아무도 듣지 않고,
 * 그래서 아무 일도 일어나지 않는다. 다만 그때는 이 줄이 눌러도 반응이
 * 없으므로, 부르는 쪽이 `seekable`을 꺼서 보여주기만 한다.
 */
export function VideoTimeChip({
  location,
  seekable,
}: {
  location: VideoTimeLocator;
  /** 앱 안에서 트는 중일 때만 참이다. 아니면 누를 수 없는 표시로 둔다. */
  seekable: boolean;
}) {
  const label = describeVideoTime(location);

  if (!seekable) {
    return (
      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(SEEK_EVENT, {
            detail: { seconds: location.startSeconds },
          }),
        );
      }}
      title="이 시점으로 이동"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent transition-opacity hover:opacity-80 dark:bg-accent-dark-soft dark:text-accent-dark"
    >
      <span aria-hidden="true">▸</span>
      {label}
    </button>
  );
}
