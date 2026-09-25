/**
 * 장소의 값 다듬기와 지도로 가는 링크. (설계 문서 17-1절)
 *
 * 카카오가 주는 값을 우리가 담을 모양으로 바꾸는 규칙만 여기 있다.
 * **밖에서 온 값이 그대로 들어오는 자리**라, 무엇을 버리고 무엇을 비워
 * 둘지가 여기서 정해진다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** 검사가 이 셈만 따로 들여다볼
 * 수 있어야 한다. (`AGENTS.md` 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 어디서 받아온 값인가. 국내는 카카오, 해외는 구글이다. (17-1.3절)
 *
 * 비어 있으면 **직접 적은 장소**다. `manual` 값을 따로 두지 않는다.
 * 둘 다 두면 같은 뜻의 값이 두 벌이 된다.
 */
export const PLACE_PROVIDERS = ["kakao", "google"] as const;

export type PlaceProvider = (typeof PLACE_PROVIDERS)[number];

const PLACE_PROVIDER_LABELS: Record<PlaceProvider, string> = {
  kakao: "카카오맵",
  google: "구글 지도",
};

export function isPlaceProvider(value: unknown): value is PlaceProvider {
  return (
    typeof value === "string" &&
    (PLACE_PROVIDERS as readonly string[]).includes(value)
  );
}

/** 어디서 왔는지 보여줄 말. 모르면 비운다. 지어내지 않는다. */
export function getPlaceProviderLabel(value: unknown): string | null {
  return isPlaceProvider(value) ? PLACE_PROVIDER_LABELS[value] : null;
}

/**
 * 가봤는가. (17-1.5절)
 *
 * **비움이 세 번째 상태다.** 안 정함 · 가보고 싶다 · 가봤다.
 * 참/거짓 하나로 두면 안 정한 것이 `가보고 싶다`로 보인다.
 */
export const PLACE_VISIT_STATUSES = ["want_to_visit", "visited"] as const;

export type PlaceVisitStatus = (typeof PLACE_VISIT_STATUSES)[number];

const PLACE_VISIT_STATUS_LABELS: Record<PlaceVisitStatus, string> = {
  want_to_visit: "가보고 싶다",
  visited: "가봤다",
};

export function isPlaceVisitStatus(value: unknown): value is PlaceVisitStatus {
  return (
    typeof value === "string" &&
    (PLACE_VISIT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * 가봤는지를 보여줄 말.
 *
 * **안 정한 것에는 아무것도 보여주지 않는다.** `안 정함`이라고 적으면
 * 정해야 할 일처럼 보인다. 수업 준비에는 이 구분이 쓸모없을 수 있다.
 */
export function getPlaceVisitStatusLabel(value: unknown): string | null {
  return isPlaceVisitStatus(value) ? PLACE_VISIT_STATUS_LABELS[value] : null;
}

/** 분류를 가르는 글자. 카카오가 `음식점 > 한식 > 한정식`처럼 준다. */
const CATEGORY_SEPARATOR = ">";

/**
 * 분류에서 화면에 보여줄 토막.
 *
 * **담는 것과 보여주는 것을 가른다.** 담을 때는 길을 통째로 담는다.
 * 그래야 `음식점`으로도 `한식`으로도 찾힌다. 화면에는 가장 좁은 말
 * 하나만 보여준다. 길을 다 보여주면 카드 한 줄을 통째로 먹는다.
 *
 *   음식점 > 한식 > 한정식            → 한정식
 *   여행 > 관광,명소 > 문화유적 > 고궁,궁 → 고궁,궁
 *
 * 왜 마지막 토막인가. **좁은 쪽이 그 장소를 말한다.** `음식점`은 수천
 * 곳이고 `한정식`은 그 가게가 무엇인지 말한다.
 */
export function categoryLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parts = value
    .split(CATEGORY_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length === 0 ? null : (parts[parts.length - 1] ?? null);
}

/**
 * 글 칸 하나를 담을 모양으로.
 *
 * **빈 글자를 `null`로 바꾼다.** 카카오는 도로명 주소가 없는 곳에
 * `null`이 아니라 빈 글자를 준다. 열다섯 건 중 둘이 그랬다. 그대로 담으면
 * 화면은 `주소가 있다`고 보고 **빈 줄만 띄운다.** 오류는 나지 않는다.
 *
 * 데이터베이스도 막지만(`place_profiles_*_not_blank`) 거기서 막히면
 * **장소 정보 전체가 저장되지 않는다.** 주소 하나 때문에 좌표까지 잃는
 * 것보다 비워 두는 편이 낫다.
 */
export function placeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

/** 담는 칸의 길이 한계. 마이그레이션의 제약조건과 같은 값이다. */
export const MAX_ADDRESS_LENGTH = 500;
export const MAX_CATEGORY_LENGTH = 200;
export const MAX_PHONE_LENGTH = 50;
export const MAX_EXTERNAL_ID_LENGTH = 200;
export const MAX_PLACE_URL_LENGTH = 2000;

/**
 * 좌표를 소수점 여섯 자리로.
 *
 * `numeric(9, 6)`에 담기 때문이다. 카카오는 `126.97689786832184`처럼
 * 열넷 자리를 준다. 그대로 보내면 **PostgreSQL이 말없이 반올림하고**,
 * 그러면 우리가 보낸 값과 담긴 값이 달라진다. 화면이 되읽어 만든 지도
 * 링크가 우리가 보낸 것과 다른 곳을 가리키게 된다.
 *
 * 여섯 자리면 10cm 남짓이다. 가게 문 앞을 가리키기에 넉넉하다.
 *
 * 범위를 벗어난 값은 `null`이다. **경도를 위도 칸에 넣는 실수가 여기서
 * 걸린다.** 카카오는 `x`가 경도, `y`가 위도인데 이름만 보면 반대로 읽기
 * 쉽다. 안 걸리면 지도 링크가 바다 한가운데를 열고, 사용자는 우리가
 * 장소를 잃었다고 생각한다.
 */
function coordinate(value: unknown, limit: number): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < -limit || parsed > limit) {
    return null;
  }

  // 반올림해서 붙는 부동소수 찌꺼기를 다시 숫자로 되돌린다.
  return Number(parsed.toFixed(6));
}

export function latitude(value: unknown): number | null {
  return coordinate(value, 90);
}

export function longitude(value: unknown): number | null {
  return coordinate(value, 180);
}

/**
 * 좌표 한 쌍. **짝이 아니면 둘 다 버린다.**
 *
 * 한쪽만 담기면 화면은 좌표가 있다고 보고 링크를 만들지만 그 링크는
 * 깨진다. **오류 없이 엉뚱한 곳이 열리는 쪽이 더 나쁘다.**
 * 데이터베이스의 `place_profiles_coordinate_pair`가 같은 것을 지킨다.
 */
export function coordinatePair(
  latitudeValue: unknown,
  longitudeValue: unknown,
): { latitude: number; longitude: number } | null {
  const lat = latitude(latitudeValue);
  const lng = longitude(longitudeValue);

  if (lat === null || lng === null) {
    return null;
  }

  return { latitude: lat, longitude: lng };
}

/**
 * 밖으로 나가는 주소는 http와 https만.
 *
 * `javascript:`로 시작하는 값이 화면의 링크에 들어가면 **누르는 순간
 * 실행된다.** 카카오는 `http://place.map.kakao.com/...`을 주므로 http도
 * 받는다. 데이터베이스도 막지만 화면에서도 막는다. (보안 원칙 10)
 */
export function placeWebUrl(value: unknown): string | null {
  const text = placeText(value, MAX_PLACE_URL_LENGTH);

  if (text === null) {
    return null;
  }

  return text.startsWith("http://") || text.startsWith("https://")
    ? text
    : null;
}

/**
 * 지도 링크에 실을 장소 이름.
 *
 * **쉼표를 뺀다.** 카카오맵 링크는 `이름,위도,경도`를 쉼표로 가른다.
 * 이름에 쉼표가 있으면 칸이 밀려 **엉뚱한 곳이 열린다.** 오류는 나지
 * 않는다. `서울, 종로` 같은 이름이 실제로 있다.
 */
function linkName(name: unknown): string {
  const text = typeof name === "string" ? name.trim() : "";

  return text.replace(/,/gu, " ").replace(/\s+/gu, " ").trim();
}

/**
 * 카카오맵으로 가는 링크. (17-1.2절)
 *
 * **우리가 지도를 그리지 않는다.** 1단계에서는 좌표까지 담아두고 링크만
 * 둔다. 지도를 그리려면 열쇠와 도메인 등록이 따로 필요하고, 이 저장소는
 * 도메인 등록을 빠뜨려 두 번 막혔다. (`AGENTS.md` 6절)
 *
 * 영화·드라마의 `볼 수 있는 곳`과 같은 판단이다. 우리가 틀어주지 않고
 * 갈 곳을 알려준다. (15절)
 */
export function kakaoMapUrl(
  latitudeValue: number,
  longitudeValue: number,
  name?: unknown,
): string {
  const label = linkName(name);
  const shown = label.length > 0 ? label : "담아둔 곳";

  return (
    "https://map.kakao.com/link/map/" +
    `${encodeURIComponent(shown)},${latitudeValue},${longitudeValue}`
  );
}

/**
 * 구글 지도로 가는 링크.
 *
 * **이름이 아니라 좌표로 보낸다.** 이름으로 보내면 같은 이름의 다른 곳이
 * 열린다. `경복궁`으로 물으면 549건이 나오는데 그중에 `다이소 경복궁역점`도
 * 있다. 좌표는 한 곳을 가리킨다.
 *
 * 해외 장소를 위해 둔다. 구글 지도는 **한국에서 유독 부실하다.** 지도
 * 데이터 반출 규제 때문에 길찾기가 안 되고 상세도가 떨어진다. 그래서
 * 국내를 구글로 덮으려 하지 않고, 두 링크를 나란히 둔다. (17-1.3절)
 */
export function googleMapsUrl(
  latitudeValue: number,
  longitudeValue: number,
): string {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    `${latitudeValue}%2C${longitudeValue}`
  );
}

/**
 * 후보 하나. 카카오가 준 것을 우리가 담을 모양으로 바꾼 것이다.
 *
 * **이 타입과 읽는 함수를 여기 두는 까닭이 있다.** 받아오는 쪽(`kakao.ts`)은
 * `fetch`와 열쇠를 다루므로 검사가 부를 수 없다. `@/` 별칭이 딸려 오면 Node
 * 검사 러너가 읽지 못한다. (`AGENTS.md` 6절)
 *
 * 그런데 **이 파일에서 가장 위험한 줄이 여기 있다.** `x`가 경도이고 `y`가
 * 위도인 것을 뒤집어 읽으면 지도가 바다 한가운데를 연다. 그 줄이 검사
 * 밖에 있으면 안 된다.
 */
export type PlaceCandidate = {
  /** 장소 이름. `sources.title`에 들어간다. 따로 칸을 두지 않는다. */
  name: string;
  /** 카카오의 장소 번호. 다시 받아올 열쇠다. */
  externalId: string;
  /** 도로명 주소. **없는 곳이 있다.** */
  roadAddress: string | null;
  /** 지번 주소. 국내는 둘 다 쓰인다. */
  address: string | null;
  /** 분류를 통째로. `음식점 > 한식 > 한정식`. (17-1.4절) */
  category: string | null;
  phone: string | null;
  placeUrl: string | null;
  latitude: number;
  longitude: number;
};

/** 장소 이름의 길이 한계. `sources.title`보다 넉넉하게 잡고 뒤에서 자른다. */
const MAX_NAME_LENGTH = 500;

/**
 * 카카오의 응답 한 줄을 후보로 읽는다. **모르는 모양은 버린다.**
 *
 * 받아온 값은 전부 남이 쓴 글이다. 모양을 하나하나 확인하고, 아닌 것은
 * 조용히 빼낸다. 하나가 이상해서 전부를 못 쓰게 만들지 않는다.
 */
export function readPlaceCandidate(value: unknown): PlaceCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;

  const name = placeText(row.place_name, MAX_NAME_LENGTH);

  // 이름이 없으면 고를 수가 없다. 화면에 빈 단추가 생긴다.
  if (name === null) {
    return null;
  }

  const externalId = placeText(row.id, MAX_EXTERNAL_ID_LENGTH);

  // 번호가 없으면 다시 받아올 길이 없다. 그 후보는 쓰지 않는다.
  if (externalId === null) {
    return null;
  }

  /*
    **`x`가 경도, `y`가 위도다.** 이름만 보면 반대로 읽기 쉽다.

    좌표가 없으면 후보에서 뺀다. 좌표가 이 기능의 핵심이고, 없으면 지도로
    갈 수 없어 손으로 적는 것과 다를 바가 없다. (17-1.2절)
  */
  const pair = coordinatePair(row.y, row.x);

  if (pair === null) {
    return null;
  }

  /*
    분류는 **길을 통째로** 담는다.

    짧은 쪽(`category_group_name`)은 열다섯 건 중 아홉 건에서 비어 왔다.
    하필 궁 안의 건물들이 그랬다. (17-1.4절)
  */
  return {
    name,
    externalId,
    roadAddress: placeText(row.road_address_name, MAX_ADDRESS_LENGTH),
    address: placeText(row.address_name, MAX_ADDRESS_LENGTH),
    category: placeText(row.category_name, MAX_CATEGORY_LENGTH),
    phone: placeText(row.phone, MAX_PHONE_LENGTH),
    placeUrl: placeWebUrl(row.place_url),
    latitude: pair.latitude,
    longitude: pair.longitude,
  };
}

/**
 * 응답 전체에서 후보 목록을 읽는다.
 *
 * `documents`가 배열이 아니면 빈 목록이다. **모양이 바뀌었다고 터지지
 * 않는다.** 화면은 "찾은 장소가 없습니다"를 보여주고 손으로 적는 길이
 * 그대로 열려 있다.
 */
export function readPlaceCandidates(
  payload: unknown,
  limit: number,
): PlaceCandidate[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const documents = (payload as { documents?: unknown }).documents;

  if (!Array.isArray(documents)) {
    return [];
  }

  return documents
    .map(readPlaceCandidate)
    .filter((candidate): candidate is PlaceCandidate => candidate !== null)
    .slice(0, limit);
}

/** 우편번호의 길이 한계. 마이그레이션의 제약조건과 같은 값이다. */
export const MAX_POSTAL_CODE_LENGTH = 20;

/**
 * 우편번호를 담을 모양으로.
 *
 * **다섯 자리로 못박지 않는다.** 국내는 다섯 자리지만 해외 장소는 손으로
 * 적고 거기에는 글자가 섞인다. 영국의 `SW1A 1AA`가 그렇다. 다섯 자리만
 * 받으면 그 장소를 담을 수 없고, **우편번호 하나 때문에 장소를 못 담게
 * 만들지 않는다.** (17-1.4절)
 *
 * 가운데 공백은 그대로 둔다. `SW1A 1AA`의 공백은 뜻이 있다.
 */
export function postalCode(value: unknown): string | null {
  return placeText(value, MAX_POSTAL_CODE_LENGTH);
}

/**
 * 주소로 찾은 후보 하나.
 *
 * **이름이 없다.** 주소 검색은 장소가 아니라 주소를 돌려주므로 상호명이
 * 오지 않는다. 그래서 이 후보를 골라도 **자료 제목을 건드리지 않는다.**
 *
 * 주소로 찾는 상황은 곧 "내가 적은 이름이 카카오에 없다"는 상황이다.
 * 그때 카카오가 아는 이름으로 덮으면 **사용자가 부르던 이름을 우리가
 * 지우는 것**이 된다. (17-1.3절)
 *
 * 장소 번호(`id`)도 없다. 주소에는 그런 것이 없다. 그래서 `external_id`는
 * 비워 둔다.
 */
export type AddressCandidate = {
  /** 도로명 주소. 없는 주소도 있다(지번만 있는 곳). */
  roadAddress: string | null;
  /** 지번 주소. */
  address: string | null;
  /** 우편번호. **이름으로 찾을 때는 오지 않는 값이다.** */
  postalCode: string | null;
  latitude: number;
  longitude: number;
};

/**
 * 주소 검색 응답 한 줄을 후보로 읽는다.
 *
 * 응답의 모양이 이름 검색과 다르다. 주소가 두 덩이로 나뉘어 오고, 좌표가
 * 세 군데에 있다.
 *
 *   맨 위의 `x`·`y`          대표 좌표
 *   `road_address.x`·`y`     도로명 기준
 *   `address.x`·`y`          지번 기준
 *
 * **맨 위를 먼저 쓰고 없으면 아래로 내려간다.** 셋이 거의 같지만, 하나가
 * 비어 올 때 좌표 없는 후보가 되는 것을 막는다.
 */
export function readAddressCandidate(value: unknown): AddressCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as Record<string, unknown>;

  const road = asRecord(row.road_address);
  const jibun = asRecord(row.address);

  /*
    좌표를 세 군데에서 찾는다. **`x`가 경도, `y`가 위도다.** 문서가 그렇게
    적어두었고, 뒤집어 읽으면 지도가 바다 한가운데를 연다.
  */
  const pair =
    coordinatePair(row.y, row.x) ??
    coordinatePair(road?.y, road?.x) ??
    coordinatePair(jibun?.y, jibun?.x);

  if (pair === null) {
    return null;
  }

  const roadAddress = placeText(road?.address_name, MAX_ADDRESS_LENGTH);
  const address = placeText(jibun?.address_name, MAX_ADDRESS_LENGTH);

  /*
    둘 다 없으면 보여줄 것이 없다.

    맨 위의 `address_name`은 **물어본 글자가 그대로 돌아온 것**이라 담지
    않는다. 사용자가 적은 것을 우리가 찾아준 값으로 되돌려 주면, 틀리게
    적었을 때 그것이 맞는 주소처럼 보인다.
  */
  if (roadAddress === null && address === null) {
    return null;
  }

  return {
    roadAddress,
    address,
    // 우편번호는 도로명 쪽에만 있다. 지번에는 없다.
    postalCode: postalCode(road?.zone_no),
    latitude: pair.latitude,
    longitude: pair.longitude,
  };
}

/** 객체가 아니면 `undefined`. 응답의 중첩된 덩이를 읽을 때 쓴다. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * 주소 검색 응답에서 후보 목록을 읽는다.
 *
 * `documents`가 배열이 아니면 빈 목록이다. **아는 모양만 읽는다.**
 */
export function readAddressCandidates(
  payload: unknown,
  limit: number,
): AddressCandidate[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const documents = (payload as { documents?: unknown }).documents;

  if (!Array.isArray(documents)) {
    return [];
  }

  return documents
    .map(readAddressCandidate)
    .filter((candidate): candidate is AddressCandidate => candidate !== null)
    .slice(0, limit);
}

/**
 * 지도가 뜨지 못한 까닭. (17-2.5절)
 *
 * **까닭을 구분해서 담는 이유가 있다.** "지도를 보여드리지 못합니다"만
 * 말하면 무엇을 고쳐야 하는지 알 수 없다. 이 저장소가 도메인 등록을
 * 빠뜨려 두 번 막혔고(12-A·12-C), 그때마다 화면은 아무 말도 하지 않았다.
 */
export const MAP_FAILURES = ["no-key", "script-failed", "draw-failed"] as const;

export type MapLoadFailure = (typeof MAP_FAILURES)[number];

/**
 * 까닭마다 사람에게 할 말.
 *
 * **무엇을 하면 되는지까지 적는다.** 까닭만 말하면 읽는 사람이 다음
 * 동작을 짐작해야 한다. `script-failed`가 특히 그렇다. 가장 잦은 원인은
 * 도메인 등록 누락이지만, 인터넷이나 확장 기능일 수도 있어서 둘을 함께
 * 말한다. **하나로 단정하면 엉뚱한 곳을 고치게 된다.**
 *
 * 화면에 이 글이 뜨더라도 **주소와 지도 링크는 그대로 보인다.** 지도를
 * 못 그리는 것이 장소를 못 쓸 이유는 아니다.
 */
const MAP_FAILURE_MESSAGES: Record<MapLoadFailure, string> = {
  "no-key":
    "지도를 보여드릴 준비가 아직 안 됐습니다. 아래 링크로 열어 보세요.",
  "script-failed":
    "지도를 불러오지 못했습니다. 인터넷 연결이나 브라우저 확장 기능 때문일 수 있습니다. 아래 링크로 열어 보세요.",
  "draw-failed":
    "지도를 그리지 못했습니다. 새로고침해 보시고, 계속 그러면 아래 링크로 열어 보세요.",
};

export function isMapLoadFailure(value: unknown): value is MapLoadFailure {
  return (
    typeof value === "string" && (MAP_FAILURES as readonly string[]).includes(value)
  );
}

/**
 * 지도가 안 뜰 때 화면에 띄울 글.
 *
 * 모르는 까닭에는 그리기 실패로 말한다. **비워 두지 않는다.** 빈 자리는
 * 고장처럼 보이고, 사용자는 자기가 뭘 잘못했는지 찾게 된다.
 */
export function mapFailureMessage(value: unknown): string {
  return MAP_FAILURE_MESSAGES[
    isMapLoadFailure(value) ? value : "draw-failed"
  ];
}
