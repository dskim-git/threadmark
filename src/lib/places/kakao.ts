import { KAKAO_REQUEST_HEADERS } from "@/lib/net/request-headers";

import {
  latitude,
  longitude,
  readAddressCandidates,
  readCoordinateAddress,
  readPlaceCandidates,
  type AddressCandidate,
  type CoordinateAddress,
  type PlaceCandidate,
} from "./places";

export type { AddressCandidate, CoordinateAddress, PlaceCandidate };

/**
 * 카카오 Local에 장소를 물어 후보를 모은다. (설계 문서 17-1절)
 *
 * **서버에서만 돈다.** REST API 키가 필요하고, 그 값은 브라우저로 나가면
 * 안 된다. 책 검색과 **같은 열쇠**다. 눌러서 확인했다. (2026-09-25)
 *
 * 켜는 일이 따로 있었다. 열쇠는 맞는데 앱에서 지도·장소 기능이 꺼져 있어
 * 이런 답이 왔다.
 *
 *   {"errorType":"NotAuthorizedError",
 *    "message":"App(ThreadMark) disabled OPEN_MAP_AND_LOCAL service."}
 *
 * **열쇠 문제로 읽지 않는다.** 카카오가 앱 이름까지 불러준다는 것은 열쇠를
 * 알아봤다는 뜻이다. 콘솔에서 `제품 설정 > 카카오맵 > 사용 설정`을 켜면
 * 된다. (`AGENTS.md` 6절)
 *
 * **우리가 하나를 골라주지 않는다.** 후보를 늘어놓고 사람이 고른다.
 * `경복궁`으로 물으면 549건이 오고 그 안에 `다이소 경복궁역점`,
 * `온유어마크 경복궁`이 섞여 있다. 우리가 정하면 틀린 값이 조용히 들어간다.
 *
 * 국내만 다룬다. 해외는 이름과 주소를 직접 적는다. **밖에서 못 찾아와도
 * 우리 기능이 멈추지 않는다.** (17-1.3절, 15-E와 같은 판단)
 */

const KEYWORD_ENDPOINT =
  "https://dapi.kakao.com/v2/local/search/keyword.json";

/**
 * 주소로 묻는 곳. (2026-09-25, 사용자 요청)
 *
 * **이름이 부정확할 때 쓰는 길이다.** 이름이 틀려도 어디쯤인지는 보통
 * 안다. 그리고 **우편번호가 이쪽에만 있다.** 키워드 검색 응답에는 없다.
 * (17-1.3절)
 */
const ADDRESS_ENDPOINT =
  "https://dapi.kakao.com/v2/local/search/address.json";

/**
 * 보여줄 후보 수.
 *
 * 책은 다섯이다. 장소는 열로 둔다. **같은 이름이 훨씬 많이 걸린다.**
 * `경복궁` 열다섯 건 안에 궁, 주차장, 지하철역, 다이소, 식당이 섞여 있었다.
 * 다섯에서 끊으면 찾던 곳이 빠진다.
 *
 * 카카오가 한 번에 주는 최대가 열다섯이다.
 */
const LIMIT = 10;

/** 기다려 줄 시간. 사람이 단추를 누르고 기다리는 중이다. */
const TIMEOUT_MS = 6000;

/** 찾을 말의 길이 한계. 장소 이름이 이보다 길 일은 없다. */
const MAX_QUERY_LENGTH = 200;

export type PlaceLookupResult =
  | { ok: true; candidates: PlaceCandidate[]; notice: string | null }
  | { ok: false; message: string };

/**
 * 이름으로 장소를 찾는다.
 *
 * 실패해도 던지지 않는다. **찾아오기가 안 되는 것은 장소를 담지 못할
 * 이유가 아니다.** 화면은 손으로 적는 길을 그대로 열어둔다.
 */
export async function lookupPlaces(query: unknown): Promise<PlaceLookupResult> {
  if (typeof query !== "string" || query.trim().length === 0) {
    return { ok: false, message: "찾을 장소 이름을 적어 주세요." };
  }

  const term = query.trim();

  if (term.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: "찾는 말이 너무 깁니다." };
  }

  const key = process.env.KAKAO_REST_API_KEY?.trim();

  if (!key) {
    console.error("[ThreadMark] KAKAO_REST_API_KEY가 설정되지 않았습니다.");

    return {
      ok: false,
      message: "장소 찾기가 아직 준비되지 않았습니다. 손으로 적어 주세요.",
    };
  }

  const url =
    `${KEYWORD_ENDPOINT}?query=${encodeURIComponent(term)}&size=${LIMIT}`;

  const payload = await askJson(url, key);

  if (payload === null) {
    return {
      ok: false,
      message: "지금은 장소를 찾지 못했습니다. 손으로 적어도 됩니다.",
    };
  }

  const candidates = readPlaceCandidates(payload, LIMIT);

  if (candidates.length === 0) {
    return {
      ok: true,
      candidates: [],
      notice:
        "찾은 장소가 없습니다. 이름을 줄여 보거나, 주소를 손으로 적어도 됩니다.",
    };
  }

  return { ok: true, candidates, notice: null };
}

export type AddressLookupResult =
  | { ok: true; candidates: AddressCandidate[]; notice: string | null }
  | { ok: false; message: string };

/**
 * 주소로 장소를 찾는다. (2026-09-25, 사용자 요청)
 *
 * 이름으로 찾는 것과 **다른 물음**이다. 이쪽은 "이 주소가 어디인가"를
 * 묻는다. 상호명이 틀렸거나 카카오에 없는 가게일 때 쓴다.
 *
 * 돌려주는 것에 **이름이 없다.** 주소 검색은 장소가 아니라 주소를 돌려준다.
 * 그래서 화면이 이 후보를 골라도 자료 제목을 건드리지 않는다.
 *
 * 실패해도 던지지 않는다. 이름으로 찾기와 같다.
 */
export async function lookupAddresses(
  query: unknown,
): Promise<AddressLookupResult> {
  if (typeof query !== "string" || query.trim().length === 0) {
    return { ok: false, message: "찾을 주소를 적어 주세요." };
  }

  const term = query.trim();

  if (term.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: "찾는 주소가 너무 깁니다." };
  }

  const key = process.env.KAKAO_REST_API_KEY?.trim();

  if (!key) {
    console.error("[ThreadMark] KAKAO_REST_API_KEY가 설정되지 않았습니다.");

    return {
      ok: false,
      message: "주소 찾기가 아직 준비되지 않았습니다. 손으로 적어 주세요.",
    };
  }

  const url =
    `${ADDRESS_ENDPOINT}?query=${encodeURIComponent(term)}&size=${LIMIT}`;

  const payload = await askJson(url, key);

  if (payload === null) {
    return {
      ok: false,
      message: "지금은 주소를 찾지 못했습니다. 손으로 적어도 됩니다.",
    };
  }

  const candidates = readAddressCandidates(payload, LIMIT);

  if (candidates.length === 0) {
    return {
      ok: true,
      candidates: [],
      /*
        **주소 검색은 앞에서부터 맞춰 찾는다.** 동·읍·면까지만 적으면
        찾고, 건물 이름이나 층을 붙이면 못 찾는다. 그 까닭을 알려준다.
        "없습니다"만 말하면 사용자는 주소가 틀렸다고 생각한다.
      */
      notice:
        "그 주소로 찾은 것이 없습니다. `서울 종로구 사직로 161`처럼 도로명과 번호까지만 적어 보세요. 건물 이름이나 층은 빼는 편이 낫습니다.",
    };
  }

  return { ok: true, candidates, notice: null };
}

/**
 * 좌표를 주소로 바꾸는 곳. (17-3.3절)
 *
 * **지도에서 찍어 담을 때 쓴다.** 찍은 자리의 도로명 주소·지번 주소·
 * 우편번호를 함께 준다. 같은 REST 열쇠로 된다.
 *
 * 국내만이다. 문서가 국내 지명만 말한다. 해외를 찍는 길은 따로 만든다.
 */
const COORD_TO_ADDRESS_ENDPOINT =
  "https://dapi.kakao.com/v2/local/geo/coord2address.json";

export type CoordinateAddressResult =
  | { ok: true; address: CoordinateAddress | null }
  | { ok: false; message: string };

/**
 * 찍은 자리의 주소를 받아온다. (2026-09-25, 사용자 요청)
 *
 * **이름은 돌려주지 않는다.** 좌표만으로는 그 자리에 무엇이 있는지 알 수
 * 없다. 이름을 모를 때 쓰는 길이므로 그것이 맞다. 이름은 사용자가 적는다.
 *
 * 주소를 못 알아내도 `ok: true`에 `address: null`로 돌려준다. **실패가
 * 아니다.** 바다나 산을 찍으면 그렇게 되고, 그때도 좌표는 쓸모가 있다.
 * 실패로 다루면 화면이 "담을 수 없다"로 읽는다.
 */
export async function lookupAddressAtPoint(
  latitudeValue: unknown,
  longitudeValue: unknown,
): Promise<CoordinateAddressResult> {
  const lat = latitude(latitudeValue);
  const lng = longitude(longitudeValue);

  if (lat === null || lng === null) {
    return { ok: false, message: "찍은 자리를 알 수 없습니다." };
  }

  const key = process.env.KAKAO_REST_API_KEY?.trim();

  if (!key) {
    console.error("[ThreadMark] KAKAO_REST_API_KEY가 설정되지 않았습니다.");

    return {
      ok: false,
      message: "주소를 알아볼 준비가 아직 안 됐습니다. 손으로 적어 주세요.",
    };
  }

  /*
    **`x`가 경도, `y`가 위도다.** 보내는 쪽에서도 같다. 뒤바꿔 보내면
    엉뚱한 주소가 오고 오류는 나지 않는다.
  */
  const url = `${COORD_TO_ADDRESS_ENDPOINT}?x=${lng}&y=${lat}`;

  const payload = await askJson(url, key);

  if (payload === null) {
    return {
      ok: false,
      message: "지금은 주소를 알아보지 못했습니다. 좌표만 담아도 됩니다.",
    };
  }

  return { ok: true, address: readCoordinateAddress(payload) };
}

/**
 * JSON을 받아온다. 안 되면 `null`이다.
 *
 * **열쇠는 부를 때만 붙인다.** 공유하는 헤더 묶음에 비밀값을 두지 않는다.
 * 그 묶음은 검사가 훑고 다니는 목록이다.
 *
 * 실패한 까닭을 남기되 **검색어와 열쇠는 남기지 않는다.** 어디를 찾았는지가
 * 기록에 쌓이면 그 자체가 남의 자료가 된다. 장소는 더 그렇다. 사람이
 * 어디에 가려 했는지가 남는다. (15-E)
 */
async function askJson(url: string, key: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: {
        ...KAKAO_REQUEST_HEADERS,
        authorization: `KakaoAK ${key}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 쿠키를 보내지도 받지도 않는다.
      credentials: "omit",
      cache: "no-store",
    });

    if (!response.ok) {
      /*
        상태만 남기지 않는다.

        카카오는 **켜지지 않은 기능도 401로** 답한다. 상태만 보면 열쇠가
        틀린 것으로 읽게 되고, 엉뚱한 곳을 고치게 된다. 실제로 그렇게
        한 번 헤맸다. 응답 글에 무엇이 꺼져 있는지 적혀 있다.

          App(ThreadMark) disabled OPEN_MAP_AND_LOCAL service.

        운영자만 보는 기록이고 열쇠나 검색어는 들어 있지 않다.
      */
      const detail = await response.text().catch(() => "");

      console.error(
        "[ThreadMark] Kakao 로컬 검색 응답 상태:",
        response.status,
        detail.slice(0, 300),
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    /*
      Node의 네트워크 오류는 겉면이 늘 `TypeError: fetch failed`이고 진짜
      까닭은 `cause` 안에 있다. 겉면만 남기면 무엇이 잘못되었는지 모른다.
      15-C에서 그것으로 한참 헤맸다.
    */
    const detail =
      error instanceof Error && error.cause instanceof Error
        ? ` (${error.cause.name}: ${error.cause.message})`
        : "";

    console.error(
      "[ThreadMark] Kakao 로컬 검색 실패:",
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "알 수 없는 오류",
      detail,
    );

    return null;
  }
}
