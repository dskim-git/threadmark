import { loadGoogleMaps } from "./google-map-sdk";
import {
  GOOGLE_PLACE_FIELDS,
  readGooglePlaceCandidates,
  type PlaceCandidate,
} from "./places";

/**
 * 해외 장소를 이름으로 찾는다. (설계 문서 17-3.4절 2차례)
 *
 * **브라우저에서 부른다.** 국내와 정반대다. 카카오는 REST 열쇠를 서버에만
 * 두고 서버가 물었는데(`place-actions.ts`의 `findPlaces`), 구글 열쇠는 HTTP
 * 리퍼러 제한이 걸려 있어 **서버에서 부르면 거부된다.**
 *
 * 그래서 이 파일에는 `"use server"`가 없고, 화면이 직접 부른다. 국내 코드를
 * 보고 같은 모양으로 서버 액션을 만들면 늘 막힌다.
 *
 * **찾는 값을 우리 서버가 보지 않는다.** 이용자가 친 글이 브라우저에서
 * 구글로 바로 간다. 그 사실이 개인정보 처리방침에 적혀 있어야 한다.
 *
 * 왜 지도 SDK로 부르고 주소(REST)로 부르지 않는가
 *   같은 Places API를 주소로도 부를 수 있다. 그러나 리퍼러 제한이 걸린
 *   열쇠로 주소를 직접 부르는 것은 **구글이 보장하는 길이 아니다.** 지도
 *   SDK는 그 열쇠로 쓰라고 만들어진 길이고, 이미 지도 때문에 받아와 있다.
 *   **되는 것이 확실한 길을 고른다.**
 *
 * 돈이 드는 자리
 *   청하는 칸이 곧 값이다. 어느 칸을 청할지는 `places.ts`의
 *   `GOOGLE_PLACE_FIELDS`가 들고 있고, 검사가 거기에 비싼 칸이 섞이지
 *   않았는지 본다. 횟수는 Google Cloud의 하루 상한이 막는다. (19-E.5절)
 */

/** 한 번에 보여줄 후보 수. 국내와 같은 만큼 보여준다. */
const LIMIT = 10;

export type GooglePlaceSearchResult =
  | { ok: true; candidates: PlaceCandidate[]; notice: string | null }
  | { ok: false; message: string };

/**
 * 이름으로 찾는다.
 *
 * **못 찾은 것과 못 물어본 것을 갈라서 말한다.** 둘을 같게 말하면, 열쇠가
 * 막혀 있는데 "그런 곳이 없다"로 읽힌다. 1단계에서 해외를 찾으면 `찾은
 * 장소가 없습니다`만 떴고 그것이 무슨 뜻인지 알 수 없었다. (17-3.1절)
 */
export async function findGooglePlaces(
  query: string,
): Promise<GooglePlaceSearchResult> {
  const text = query.trim();

  if (text === "") {
    return { ok: false, message: "찾을 장소 이름을 적어 주세요." };
  }

  let maps;

  try {
    maps = await loadGoogleMaps();
  } catch {
    /*
      까닭을 더 가르지 않는다. 지도가 같은 스크립트를 쓰므로 **지도 칸이
      이미 그 까닭을 적고 있다.** 여기서 또 길게 말하면 한 화면에 비슷한
      안내문이 둘 뜬다.
    */
    return {
      ok: false,
      message:
        "구글에 물어보지 못했습니다. 아래 지도 칸에 까닭이 적혀 있습니다.",
    };
  }

  const places = maps.places;

  if (!places) {
    return {
      ok: false,
      message:
        "장소를 찾는 기능을 불러오지 못했습니다. 새로고침해 보시고, 계속 그러면 이름·주소·좌표를 직접 적어 주세요.",
    };
  }

  let response;

  try {
    response = await places.Place.searchByText({
      textQuery: text,
      fields: [...GOOGLE_PLACE_FIELDS],
      /*
        한국어로 청한다. 쓰는 사람이 한국에 있고, 구글은 가진 만큼 한글로
        준다. **없으면 원래 말로 온다.** `에펠탑`으로 찾으면 한글 이름이
        오고, 작은 가게는 현지 말 그대로 온다. 그것이 맞다. 억지로 옮긴
        이름은 지도에서 다시 찾을 수 없다.
      */
      language: "ko",
      maxResultCount: LIMIT,
    });
  } catch {
    /*
      구글이 거부한 경우다. **리퍼러 등록이나 API 제한이 가장 잦다.**
      하루 상한에 닿았을 때도 여기로 온다. 셋을 갈라 말할 수 없어서
      함께 말한다. 하나로 단정하면 엉뚱한 곳을 고치게 된다.
    */
    return {
      ok: false,
      message:
        "구글이 요청을 받지 않았습니다. 잠시 후 다시 해보시고, 계속 그러면 이름·주소·좌표를 직접 적어 주세요.",
    };
  }

  const candidates = readGooglePlaceCandidates(response.places, LIMIT);

  if (candidates.length === 0) {
    return {
      ok: true,
      candidates: [],
      notice:
        "그 이름으로는 찾지 못했습니다. 도시 이름을 함께 적어 보세요. 예: `루브르 파리`",
    };
  }

  return { ok: true, candidates, notice: null };
}
