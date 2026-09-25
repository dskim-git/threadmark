import type { MapLoadFailure } from "./places";

/**
 * 카카오맵 지도를 불러온다. (설계 문서 17-2절)
 *
 * **브라우저에서만 돈다.** 지도는 브라우저가 그리고, 그러려면 카카오의
 * 스크립트를 화면이 직접 받아와야 한다.
 *
 * 열쇠가 화면에 실려 나간다
 *   `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`는 스크립트 주소에 붙어 나간다.
 *   **그것이 고장이 아니라 이 열쇠의 설계다.** 감출 수 없다.
 *
 *   막아주는 것은 **카카오에 등록한 도메인뿐이다.** 남이 열쇠를 베껴 가도
 *   자기 사이트에서는 지도가 뜨지 않는다. 그래서 도메인 등록이 선택이
 *   아니라 유일한 방어선이다. (17-2.3절)
 *
 *   `KAKAO_REST_API_KEY`는 다르다. **그것은 서버에만 있어야 한다.**
 *   이 파일을 보고 "카카오 열쇠는 브라우저에 둬도 된다"로 읽으면 안 된다.
 *   두 열쇠는 다루는 방식이 다르다.
 *
 * 한 번만 불러온다
 *   약속(Promise)을 담아두고 다시 쓴다. 장소 화면을 여러 번 열거나 React가
 *   효과를 두 번 돌려도 스크립트는 하나다.
 *
 *   실패한 약속은 지운다. 남겨두면 **다시 시도할 길이 없다.** 도메인을
 *   등록하고 새로고침했는데도 안 되는 상태가 된다. (`open-picker.ts`와
 *   같은 판단이다)
 *
 * 왜 `next/script`를 쓰지 않는가
 *   이 저장소는 Picker와 YouTube에서 이미 `document.createElement`로
 *   불러오고 있다. **같은 일을 두 방식으로 하지 않는다.** 그리고 이 쪽은
 *   "불러온 뒤 `kakao.maps.load`를 한 번 더 기다린다"는 단계가 있어서,
 *   약속으로 감싸 두는 편이 부르는 쪽이 읽기 쉽다.
 */

/*
  까닭과 사람에게 할 말은 `places.ts`에 있다.

  **그 파일은 아무것도 import하지 않는 잎사귀라 검사가 부를 수 있다.**
  이 파일은 `window`와 `document`를 만지므로 검사가 부르지 못한다.
  안내문이 이쪽에 있으면 그 글이 검사 밖으로 나간다.
  (`AGENTS.md` 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)

    no-key         환경변수가 없다. 개발 서버를 껐다 켜지 않은 경우도 여기다.
    script-failed  스크립트를 못 받았다. **도메인 등록 누락이 가장 잦다.**
                   카카오는 등록되지 않은 주소에 401로 답하고, 그러면
                   스크립트가 실패한다.
    draw-failed    스크립트는 받았는데 지도를 그리지 못했다.
*/

/**
 * 우리가 쓰는 만큼만 적은 카카오맵의 모양.
 *
 * **쓰지 않는 것은 적지 않는다.** 카카오맵의 모양을 통째로 옮겨 적으면
 * 그 글이 낡는 것을 아무도 모른다. 여기 적힌 것은 전부 우리가 부르는
 * 것이고, 안 맞으면 컴파일이 멈춘다.
 */
type KakaoLatLng = {
  getLat: () => number;
  getLng: () => number;
};

type KakaoMap = {
  setCenter: (latlng: KakaoLatLng) => void;
  relayout: () => void;
};

type KakaoMarker = {
  setMap: (map: KakaoMap | null) => void;
  /** 찍은 자리로 옮긴다. **새로 만들지 않는다.** 만들면 표시가 쌓인다. */
  setPosition: (latlng: KakaoLatLng) => void;
};

type KakaoMaps = {
  load: (callback: () => void) => void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMap;
  Marker: new (options: {
    position: KakaoLatLng;
    map?: KakaoMap;
  }) => KakaoMarker;
  /**
   * 지도를 누른 것을 듣는다. (17-3.3절)
   *
   * `latLng`이 누른 자리다. **카카오가 주는 것은 숫자가 아니라 객체**라
   * `getLat()`·`getLng()`로 꺼낸다.
   */
  event: {
    addListener: (
      target: KakaoMap,
      type: "click",
      handler: (event: { latLng: KakaoLatLng }) => void,
    ) => void;
  };
};

type KakaoWindow = Window & { kakao?: { maps?: KakaoMaps } };

/**
 * 스크립트 주소.
 *
 * `autoload=false`가 중요하다. 없으면 스크립트가 받아지는 순간 스스로
 * 초기화를 시작하는데, 그러면 **언제 준비됐는지 알 방법이 없다.** 끄고
 * `kakao.maps.load`로 기다린다.
 */
function scriptSrc(key: string): string {
  return (
    "https://dapi.kakao.com/v2/maps/sdk.js" +
    `?appkey=${encodeURIComponent(key)}&autoload=false`
  );
}

let mapsReady: Promise<KakaoMaps> | null = null;

/**
 * 지도를 그릴 수 있는 상태가 되면 그 도구를 돌려준다.
 *
 * 실패하면 `MapLoadFailure`를 담은 오류를 던진다. **까닭을 구분해서
 * 던진다.** 화면이 "안 됩니다"만 말하면 무엇을 고쳐야 하는지 알 수 없다.
 * 이 저장소가 도메인 등록을 빠뜨려 두 번 막혔고, 그때마다 화면은 아무
 * 말도 하지 않았다. (12-A, 12-C)
 */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (mapsReady) {
    return mapsReady;
  }

  /*
    환경변수를 글자 그대로 적는다. 변수로 빼면 Next.js가 빌드할 때 값을
    박아 넣지 못한다. **그러면 브라우저에서 `undefined`가 되고 오류 없이
    지도만 안 뜬다.**
  */
  const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();

  if (!key) {
    return Promise.reject(new MapError("no-key"));
  }

  mapsReady = new Promise<KakaoMaps>((resolve, reject) => {
    const target = window as KakaoWindow;

    const whenReady = () => {
      const maps = (window as KakaoWindow).kakao?.maps;

      if (!maps) {
        reject(new MapError("script-failed"));

        return;
      }

      // 여기서 한 번 더 기다린다. autoload를 껐기 때문이다.
      maps.load(() => {
        const ready = (window as KakaoWindow).kakao?.maps;

        if (ready) {
          resolve(ready);
        } else {
          reject(new MapError("draw-failed"));
        }
      });
    };

    // 이미 있으면 다시 받지 않는다.
    if (target.kakao?.maps) {
      whenReady();

      return;
    }

    const src = scriptSrc(key);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );

    if (existing) {
      existing.addEventListener("load", whenReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new MapError("script-failed")),
        { once: true },
      );

      return;
    }

    const script = document.createElement("script");

    script.src = src;
    script.async = true;
    script.onload = whenReady;
    script.onerror = () => reject(new MapError("script-failed"));

    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // 실패한 약속을 남겨두면 다시 시도할 수 없다.
    mapsReady = null;

    throw error;
  });

  return mapsReady;
}

/** 까닭을 담아 던지는 오류. */
export class MapError extends Error {
  readonly reason: MapLoadFailure;

  constructor(reason: MapLoadFailure) {
    super(reason);
    this.name = "MapError";
    this.reason = reason;
  }
}

/** 던져진 것에서 까닭을 읽는다. 모르는 오류는 그리기 실패로 본다. */
export function readMapFailure(error: unknown): MapLoadFailure {
  return error instanceof MapError ? error.reason : "draw-failed";
}
