import { loadGoogleMaps } from "./google-map-sdk";
import {
  readGoogleCoordinateAddress,
  type CoordinateAddress,
} from "./places";

/**
 * 찍은 좌표를 주소로 바꾼다. (설계 문서 17-3.4절 3차례)
 *
 * 국내에서 카카오의 `coord2address`가 하는 일이고, 그쪽은 **우리 서버가**
 * 묻는다(`place-actions.ts`의 `findAddressAtPoint`). 여기는 **이 브라우저가**
 * 구글에 직접 묻는다. 구글 열쇠에 리퍼러 제한이 걸려 있어 서버에서 부르면
 * 거부되기 때문이다.
 *
 * 그래서 이 파일에는 `"use server"`가 없다. 같은 일을 하는 함수 둘이 서로
 * 다른 자리에서 도는 것이 어색해 보이는데, **어색한 것이 실제 모양이다.**
 * 한쪽으로 맞추려 들면 구글 쪽이 늘 막힌다.
 *
 * 돈이 드는 자리
 *   한 번 찍을 때마다 한 번 부른다. **찍는 만큼 든다.** 지도를 이리저리
 *   눌러보는 일이 잦아서 다른 것보다 빨리 는다. Google Cloud의 하루
 *   상한(50)이 막는다. (19-E.5절)
 *
 *   그래서 찍은 자리가 바뀔 때만 묻는다. 같은 자리를 다시 눌러도 다시
 *   묻지 않는 일은 부르는 쪽(`place-picker.tsx`)이 한다.
 */

export type GoogleAddressResult =
  | { ok: true; address: CoordinateAddress | null }
  | { ok: false; message: string };

/**
 * 좌표로 주소를 묻는다.
 *
 * **못 찾은 것과 못 물어본 것을 갈라서 말한다.** 바다 한가운데를 찍으면
 * 구글도 줄 것이 없는데, 그것과 열쇠가 막힌 것을 같게 말하면 무엇을
 * 고쳐야 하는지 알 수 없다.
 *
 * 주소를 못 찾아도 **찍은 것은 살아 있다.** 좌표만 담고 주소는 손으로
 * 적으면 된다. 주소 하나 때문에 그 자리를 잃게 하지 않는다.
 */
export async function findGoogleAddressAtPoint(
  latitude: number,
  longitude: number,
): Promise<GoogleAddressResult> {
  let maps;

  try {
    maps = await loadGoogleMaps();
  } catch {
    /*
      까닭을 더 가르지 않는다. 같은 스크립트로 지도를 그리고 있으므로
      **지도가 떠 있다면 이 실패는 일어나지 않는다.** 여기까지 왔다는 것은
      지도도 못 그린 상태라는 뜻이고, 그 까닭은 지도 자리가 이미 적고 있다.
    */
    return {
      ok: false,
      message: "구글에 물어보지 못했습니다. 좌표만 담고 주소는 적어 주세요.",
    };
  }

  if (!maps.Geocoder) {
    return {
      ok: false,
      message:
        "주소를 알아보는 기능을 불러오지 못했습니다. 좌표만 담고 주소는 적어 주세요.",
    };
  }

  let response;

  try {
    response = await new maps.Geocoder().geocode({
      location: { lat: latitude, lng: longitude },
      /*
        한국어로 청한다. 구글은 가진 만큼 한글로 주고 **없으면 현지 말
        그대로 온다.** 그것이 맞다. 억지로 옮긴 주소로는 그 나라에서
        길을 물을 수 없다.
      */
      language: "ko",
    });
  } catch {
    /*
      구글이 거부했거나 그 자리에 줄 것이 없다. 둘을 갈라 말할 수 없어서
      함께 말한다. **하나로 단정하면 엉뚱한 곳을 고치게 된다.**
      리퍼러 등록, API 제한, 하루 상한이 모두 이 길로 온다.
    */
    return {
      ok: false,
      message:
        "그 자리의 주소를 알아보지 못했습니다. 좌표만 담고 주소는 손으로 적으셔도 됩니다.",
    };
  }

  return { ok: true, address: readGoogleCoordinateAddress(response.results) };
}
