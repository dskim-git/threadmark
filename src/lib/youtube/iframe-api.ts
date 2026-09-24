/**
 * YouTube IFrame Player API를 한 번만 불러온다. (설계 문서 14절)
 *
 * **이 API는 부르는 방식이 까다롭다.** 스크립트를 넣으면 준비된 뒤에
 * `window.onYouTubeIframeAPIReady`를 부른다. 전역 함수 하나이고, **나중에
 * 덮어쓰면 앞의 것이 사라진다.**
 *
 * 화면에 재생기가 둘 이상 있으면 각자 그 함수를 달려고 하는데, 마지막에
 * 단 것만 남고 나머지는 영원히 기다린다. 증상이 고약하다. **오류가 나지
 * 않고 그냥 그 재생기만 안 뜬다.**
 *
 * 그래서 약속(Promise) 하나를 이 모듈이 들고 있고, 모두 그것을 기다린다.
 * 스크립트도 한 번만 넣는다.
 *
 * **`youtube-nocookie.com`으로 튼다.** 누르기 전에는 쿠키를 덜 남긴다.
 * 담아둔 영상 목록을 훑어보는 것만으로 YouTube가 그 사람의 취향을 쌓게
 * 두지 않는다. 기능은 같다.
 */

/** 재생기에게 시킬 수 있는 일. 우리가 쓰는 것만 적는다. */
export type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type PlayerOptions = {
  videoId: string;
  host: string;
  playerVars: Record<string, string | number>;
  events?: { onReady?: () => void };
};

type YouTubeApi = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";

/** 누르기 전에는 쿠키를 덜 남기는 쪽. 기능은 같다. */
export const PLAYER_HOST = "https://www.youtube-nocookie.com";

let pending: Promise<YouTubeApi> | null = null;

/**
 * API가 준비될 때까지 기다린다. 여러 번 불러도 한 번만 불러온다.
 *
 * 서버에서 부르면 `window`가 없다. 그때는 영영 풀리지 않는 약속을 주는
 * 대신 거절한다. **기다리다 멈춘 화면은 무엇이 잘못됐는지 보여주지 않는다.**
 */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 부를 수 있습니다."));
  }

  // 이미 와 있으면 그대로 쓴다. 다시 넣으면 앞의 것을 망가뜨린다.
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (pending) {
    return pending;
  }

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    /*
      전역 콜백은 **이 모듈만 단다.** 이미 달려 있으면 그것도 함께 부른다.
      우리가 아닌 무언가가 달아둔 것을 지우면 그쪽이 영원히 기다린다.
    */
    const previous = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previous?.();

      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error("재생기를 준비하지 못했습니다."));
      }
    };

    // 스크립트가 이미 들어가 있으면 넣지 않고 콜백만 기다린다.
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      return;
    }

    const script = document.createElement("script");

    script.src = SCRIPT_SRC;
    script.async = true;
    /*
      **실패를 붙잡는다.** 스크립트가 막히는 환경이 있다(사내망, 광고
      차단기). 붙잡지 않으면 화면은 `재생기를 준비하는 중…`에서 영원히
      멈추고, 사용자는 기다리면 될 줄 안다.
    */
    script.onerror = () => {
      pending = null;
      reject(new Error("재생기를 불러오지 못했습니다."));
    };

    document.head.append(script);
  });

  return pending;
}
