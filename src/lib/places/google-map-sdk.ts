import { MapError } from "./map-sdk";

/**
 * 구글 지도를 불러온다. (설계 문서 17-3.4절)
 *
 * **브라우저에서만 돈다.** 지도는 브라우저가 그리고, 그러려면 구글의
 * 스크립트를 화면이 직접 받아와야 한다.
 *
 * 국내와 정반대라는 것
 *   카카오는 REST 열쇠를 **서버에만** 두고 서버가 물었다. 구글 열쇠는
 *   **HTTP 리퍼러 제한**이 걸려 있어 브라우저가 보낸 요청만 받는다.
 *   서버에서 부르면 리퍼러가 없어 거부된다.
 *
 *   **국내 코드를 보고 해외를 만들면 서버 액션을 하나 더 만들게 된다.**
 *   그것은 늘 거부되고, 오류가 "요청이 거부되었습니다"라서 열쇠가 틀린
 *   것처럼 보인다. 17-3.4절에 표로 적어 두었다.
 *
 * 열쇠가 화면에 실려 나간다
 *   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`는 스크립트 주소에 붙어 나간다.
 *   **그것이 고장이 아니라 이 열쇠의 설계다.** 감출 수 없다.
 *
 *   막아주는 것은 **구글에 등록한 리퍼러와 API 제한뿐이다.** 남이 열쇠를
 *   베껴 가도 자기 사이트에서는 지도가 뜨지 않고, 켜두지 않은 API는
 *   부르지 못한다. 카카오 자바스크립트 열쇠와 같은 자리다.
 *
 * 돈은 여기서 막지 않는다
 *   **이용자 브라우저가 직접 부르므로 우리 장부에 셀 수 없다.** 셀 수
 *   없는 것을 센 척하지 않는다. 대신 Google Cloud의 하루 상한으로 막는다.
 *   31일 내내 상한까지 써도 무료 한도를 넘지 않는 숫자다. (19-E.5절)
 *
 * 한 번만 불러온다
 *   약속(Promise)을 담아두고 다시 쓴다. 실패한 약속은 지운다. 남겨두면
 *   **다시 시도할 길이 없다.** `map-sdk.ts`가 카카오 쪽에서 하는 것과
 *   같고, 오류 종류(`MapError`)도 그 파일 것을 함께 쓴다. 화면이 두
 *   지도를 같은 방식으로 다룰 수 있어야 한다.
 */

/*
  까닭과 사람에게 할 말은 `places.ts`에 있다. 그 파일은 아무것도 import하지
  않는 잎사귀라 검사가 부를 수 있다. 이 파일은 `window`와 `document`를
  만지므로 검사가 부르지 못한다.
  (`AGENTS.md` 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
*/

/**
 * 우리가 쓰는 만큼만 적은 구글 지도의 모양.
 *
 * **쓰지 않는 것은 적지 않는다.** 통째로 옮겨 적으면 그 글이 낡는 것을
 * 아무도 모른다. 여기 적힌 것은 전부 우리가 부르는 것이고, 안 맞으면
 * 컴파일이 멈춘다.
 */
type GoogleLatLngLiteral = { lat: number; lng: number };

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GoogleMap = {
  setCenter: (position: GoogleLatLngLiteral) => void;
  /**
   * 지도를 누른 것을 듣는다. (17-3.4절 3차례)
   *
   * `latLng`이 누른 자리다. **구글이 주는 것은 숫자가 아니라 객체**라
   * `lat()`·`lng()`로 꺼낸다. 카카오의 `getLat()`과 이름만 다르다.
   *
   * 누른 자리가 없는 곳(지도 밖, 로고 위)을 누르면 `latLng`이 비어 온다.
   */
  addListener: (
    type: "click",
    handler: (event: { latLng?: GoogleLatLng | null }) => void,
  ) => void;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
  /** 찍은 자리로 옮긴다. **새로 만들지 않는다.** 만들면 표시가 쌓인다. */
  setPosition: (position: GoogleLatLngLiteral) => void;
};

export type GooglePlacesLibrary = {
  Place: {
    /**
     * 이름으로 찾는다. (17-3.4절 2차례)
     *
     * **정적 메서드다.** `new Place()`가 아니라 `Place.searchByText()`로
     * 부른다.
     *
     * 청하는 칸이 곧 값이다. 어느 칸을 청할지는 `places.ts`의
     * `GOOGLE_PLACE_FIELDS`가 들고 있고 검사가 그 목록을 지킨다.
     */
    searchByText: (request: {
      textQuery: string;
      fields: readonly string[];
      /** 받을 글의 말. 한국어로 청하면 이름과 주소가 한글로 온다. */
      language?: string;
      maxResultCount?: number;
    }) => Promise<{ places?: unknown[] }>;
  };
};

/**
 * 좌표를 주소로 바꾸는 것. (17-3.4절 3차례)
 *
 * **라이브러리를 따로 받지 않아도 된다.** `Geocoder`는 기본에 들어 있다.
 * 주소 스크립트에 `libraries=geocoding`을 붙이고 싶어지는데, 그 이름은
 * 새 방식(`importLibrary`)의 것이라 옛 `libraries` 칸이 모른다.
 */
type GoogleGeocoderResult = {
  formatted_address?: unknown;
  address_components?: unknown;
};

export type GoogleGeocoder = {
  geocode: (request: {
    location: GoogleLatLngLiteral;
    language?: string;
  }) => Promise<{ results?: GoogleGeocoderResult[] }>;
};

export type GoogleMaps = {
  places?: GooglePlacesLibrary;
  Geocoder?: new () => GoogleGeocoder;
  Map: new (
    container: HTMLElement,
    options: {
      center: GoogleLatLngLiteral;
      zoom: number;
      /*
        지도 위의 단추들. **길찾기로 보내는 단추는 켜지 않는다.** 그 일은
        지도 아래 링크가 맡는다. (17-2.2절) 지도 안에 또 두면 같은 일을
        하는 자리가 둘이 된다.
      */
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
    },
  ) => GoogleMap;
  /**
   * 자리 표시.
   *
   * **구글이 이것을 옛것으로 표시했다.** 새것(`AdvancedMarkerElement`)은
   * 콘솔에서 지도 ID를 따로 만들어 붙여야 쓸 수 있다. 지금 준비된 것에
   * 없는 단계라, **없는 준비를 있는 것처럼 코드에 적지 않는다.**
   * 옛것은 지금 돈다. 지도 ID를 만들게 되면 그때 옮긴다.
   */
  Marker: new (options: {
    position: GoogleLatLngLiteral;
    /** 비워두면 지도에 붙지 않는다. 찍기 전에는 보이지 않아야 한다. */
    map?: GoogleMap;
    title?: string;
  }) => GoogleMarker;
};

type GoogleWindow = Window & {
  google?: { maps?: GoogleMaps };
  /** 스크립트가 준비되면 부를 자리. 아래에서 우리가 심는다. */
  __threadmarkGoogleMapsReady?: () => void;
};

/**
 * 준비됐을 때 구글이 부를 이름.
 *
 * **`callback`을 쓴다.** 스크립트가 받아졌다고 `google.maps`가 바로 쓸 수
 * 있는 것이 아니다. 구글이 뒤에서 조각을 더 받아온다. `onload`만 보고
 * 그리면 **가끔 되고 가끔 안 되는** 상태가 된다. 카카오에서 `autoload=false`와
 * `kakao.maps.load`로 한 번 더 기다린 것과 같은 자리다.
 */
const READY_CALLBACK = "__threadmarkGoogleMapsReady";

/**
 * 스크립트 주소.
 *
 * `loading=async`는 구글이 권하는 값이다. 없으면 브라우저가 "이 스크립트가
 * 화면 그리기를 막고 있다"고 경고한다.
 *
 * **`places`를 함께 받는다.** 이름으로 찾는 데 쓴다. (2차례)
 *
 * 지도만 보는 화면에서도 함께 받아오는 것이 낭비처럼 보이는데, 이
 * 스크립트를 받는 화면은 **장소 칸 하나뿐이고 거기서 둘 다 쓴다.**
 * 나눠 받는 길(`importLibrary`)도 있지만, 받는 자리가 둘이 되면 "지도는
 * 떴는데 찾기만 안 되는" 상태가 생기고 그 까닭이 화면에 드러나지 않는다.
 *
 * **라이브러리를 받는 것에는 값이 붙지 않는다.** 값은 부른 횟수에 붙는다.
 * (19-E.5절)
 */
function scriptSrc(key: string): string {
  return (
    "https://maps.googleapis.com/maps/api/js" +
    `?key=${encodeURIComponent(key)}` +
    "&v=weekly&loading=async&libraries=places" +
    `&callback=${READY_CALLBACK}`
  );
}

let mapsReady: Promise<GoogleMaps> | null = null;

/**
 * 지도를 그릴 수 있는 상태가 되면 그 도구를 돌려준다.
 *
 * 실패하면 `MapError`를 던진다. **까닭을 구분해서 던진다.** 화면이
 * "안 됩니다"만 말하면 무엇을 고쳐야 하는지 알 수 없다. 이 저장소가
 * 도메인 등록을 빠뜨려 두 번 막혔고(12-A, 12-C), 그때마다 화면은 아무
 * 말도 하지 않았다.
 */
export function loadGoogleMaps(): Promise<GoogleMaps> {
  if (mapsReady) {
    return mapsReady;
  }

  /*
    환경변수를 글자 그대로 적는다. 변수로 빼면 Next.js가 빌드할 때 값을
    박아 넣지 못한다. **그러면 브라우저에서 `undefined`가 되고 오류 없이
    지도만 안 뜬다.**
  */
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (!key) {
    return Promise.reject(new MapError("no-key"));
  }

  mapsReady = new Promise<GoogleMaps>((resolve, reject) => {
    const target = window as GoogleWindow;

    // 이미 있으면 다시 받지 않는다.
    if (target.google?.maps) {
      resolve(target.google.maps);

      return;
    }

    target[READY_CALLBACK] = () => {
      const maps = (window as GoogleWindow).google?.maps;

      if (maps) {
        resolve(maps);
      } else {
        reject(new MapError("draw-failed"));
      }
    };

    const src = scriptSrc(key);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );

    /*
      이미 붙어 있으면 다시 붙이지 않는다. 같은 주소를 두 번 넣으면 구글이
      **"두 번 불렀다"고 경고**하고 지도가 겹쳐 그려질 수 있다.
      준비되면 위 callback이 불린다.
    */
    if (existing) {
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
    script.onerror = () => reject(new MapError("script-failed"));

    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // 실패한 약속을 남겨두면 다시 시도할 수 없다.
    mapsReady = null;

    throw error;
  });

  return mapsReady;
}
