/**
 * 장소 값 다듬기와 지도 링크의 단위 검사. (설계 문서 17-1절)
 *
 * **여기서 막는 것들은 전부 오류가 나지 않는 고장이다.**
 *
 *   경도를 위도에 넣으면    지도가 바다 한가운데를 연다
 *   좌표가 한쪽만 있으면    링크가 엉뚱한 곳을 연다
 *   빈 글자를 담으면        화면에 빈 줄만 뜬다
 *   이름에 쉼표가 있으면    카카오맵 링크의 칸이 밀린다
 *
 * 화면을 봐도 무엇이 잘못됐는지 알 수 없는 것들이다. 그래서 검사로 잡는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_FAILURES,
  MAX_ADDRESS_LENGTH,
  PLACE_PROVIDERS,
  PLACE_REGIONS,
  PLACE_VISIT_STATUSES,
  GOOGLE_ENTERPRISE_PLACE_FIELDS,
  GOOGLE_PLACE_FIELDS,
  canSearchByAddress,
  categoryLabel,
  coordinatePair,
  getPlaceRegionLabel,
  isMapLoadFailure,
  isPlaceRegion,
  mapProviderForRegion,
  readGoogleCoordinateAddress,
  readGooglePlaceCandidates,
  readCoordinateAddress,
  mapFailureMessage,
  getPlaceProviderLabel,
  getPlaceVisitStatusLabel,
  googleMapsUrl,
  isPlaceProvider,
  isPlaceVisitStatus,
  kakaoMapUrl,
  latitude,
  longitude,
  placeText,
  placeWebUrl,
  postalCode,
  readAddressCandidates,
  readPlaceCandidates,
} from "../src/lib/places/places.ts";

// -----------------------------------------------------------------------------
// 분류
// -----------------------------------------------------------------------------

test("분류의 마지막 토막을 보여준다", () => {
  /*
    카카오가 주는 그대로다. **좁은 쪽이 그 장소를 말한다.**
    `음식점`은 수천 곳이고 `한정식`은 그 가게가 무엇인지 말한다.
  */
  assert.equal(categoryLabel("음식점 > 한식 > 한정식"), "한정식");
  assert.equal(
    categoryLabel("여행 > 관광,명소 > 문화유적 > 고궁,궁"),
    "고궁,궁",
  );
  assert.equal(categoryLabel("교통,수송 > 교통시설 > 주차장"), "주차장");
});

test("토막이 하나면 그것을 보여준다", () => {
  assert.equal(categoryLabel("음식점"), "음식점");
});

test("분류가 없으면 비운다", () => {
  /*
    **빈 글자로 오는 일이 실제로 있다.** 그때 `없음`이라는 글자를 담지 않는다.
    담긴 값과 화면에 보이는 말을 섞으면 검색이 `없음`을 찾게 된다.
  */
  assert.equal(categoryLabel(""), null);
  assert.equal(categoryLabel("   "), null);
  assert.equal(categoryLabel(" > > "), null);
  assert.equal(categoryLabel(null), null);
  assert.equal(categoryLabel(undefined), null);
  assert.equal(categoryLabel(123), null);
});

// -----------------------------------------------------------------------------
// 글 칸
// -----------------------------------------------------------------------------

test("빈 글자를 없음으로 바꾼다", () => {
  /*
    **카카오가 실제로 이렇게 준다.** 도로명 주소가 없는 곳에 null이 아니라
    빈 글자를 준다. `경복궁` 열다섯 건 중 둘이 그랬다(별빛야행, 경회루).

    그대로 담으면 화면은 `주소가 있다`고 보고 빈 줄만 띄운다.
  */
  assert.equal(placeText("", MAX_ADDRESS_LENGTH), null);
  assert.equal(placeText("   ", MAX_ADDRESS_LENGTH), null);
});

test("앞뒤 공백을 떼고 길이를 자른다", () => {
  assert.equal(placeText("  서울 종로구 사직로 161  ", 500), "서울 종로구 사직로 161");
  assert.equal(placeText("가나다라마", 3), "가나다");
});

test("글자가 아닌 것은 받지 않는다", () => {
  assert.equal(placeText(null, 500), null);
  assert.equal(placeText(37.5, 500), null);
  assert.equal(placeText({ a: 1 }, 500), null);
});

// -----------------------------------------------------------------------------
// 좌표
// -----------------------------------------------------------------------------

test("카카오가 주는 글자 좌표를 읽는다", () => {
  // 실제 응답의 값이다. 소수점 열넷 자리로 온다.
  assert.equal(latitude("37.577613288258206"), 37.577613);
  assert.equal(longitude("126.97689786832184"), 126.976898);
});

test("소수점 여섯 자리로 줄인다", () => {
  /*
    `numeric(9, 6)`에 담기 때문이다. 그대로 보내면 **PostgreSQL이 말없이
    반올림하고**, 우리가 보낸 값과 담긴 값이 달라진다. 화면이 되읽어 만든
    지도 링크가 우리가 보낸 것과 다른 곳을 가리킨다.
  */
  assert.equal(latitude(37.5776132882582), 37.577613);
  assert.equal(longitude(126.9768978683218), 126.976898);
});

test("경도를 위도 칸에 넣으면 거절한다", () => {
  /*
    **이것이 가장 잦은 실수다.** 카카오는 `x`가 경도, `y`가 위도인데 이름만
    보면 반대로 읽기 쉽다. 안 막으면 지도 링크가 바다 한가운데를 열고,
    사용자는 우리가 장소를 잃었다고 생각한다.
  */
  assert.equal(latitude("126.976898"), null);
  assert.equal(latitude(90.000001), null);
  assert.equal(latitude(-90.000001), null);
});

test("위도와 경도의 한계가 다르다", () => {
  assert.equal(latitude(90), 90);
  assert.equal(latitude(-90), -90);
  assert.equal(longitude(180), 180);
  assert.equal(longitude(-180), -180);
  assert.equal(longitude(180.000001), null);
});

test("숫자가 아니면 거절한다", () => {
  /*
    **말없이 버리지 않으려고 `null`을 돌려준다.** 부르는 쪽이 빈 칸과
    못 알아본 값을 가려 사용자에게 알린다.
  */
  assert.equal(latitude("서울"), null);
  assert.equal(latitude(""), null);
  assert.equal(latitude("   "), null);
  assert.equal(latitude(Number.NaN), null);
  assert.equal(latitude(Number.POSITIVE_INFINITY), null);
  assert.equal(latitude(null), null);
});

test("좌표는 짝이 아니면 둘 다 버린다", () => {
  /*
    한쪽만 담기면 화면은 좌표가 있다고 보고 링크를 만들지만 그 링크는
    깨진다. **오류 없이 엉뚱한 곳이 열리는 쪽이 더 나쁘다.**
  */
  assert.deepEqual(coordinatePair("37.577613", "126.976898"), {
    latitude: 37.577613,
    longitude: 126.976898,
  });

  assert.equal(coordinatePair("37.577613", ""), null);
  assert.equal(coordinatePair("", "126.976898"), null);
  // 뒤바뀐 경우. 위도 자리에 경도가 들어와 짝이 깨진다.
  assert.equal(coordinatePair("126.976898", "37.577613"), null);
});

test("0도는 값이 있는 것이다", () => {
  /*
    적도와 본초자오선이다. **0을 빈 값으로 읽으면 그 자리를 담을 수 없다.**
    쓰는 곳은 드물지만, 0을 없음으로 보는 실수는 이 저장소가 이미 겪었다.
  */
  assert.deepEqual(coordinatePair(0, 0), { latitude: 0, longitude: 0 });
});

// -----------------------------------------------------------------------------
// 밖으로 나가는 주소
// -----------------------------------------------------------------------------

test("카카오가 주는 http 주소를 받는다", () => {
  // 실제로 http로 온다. https만 받으면 상세 화면 링크가 전부 사라진다.
  assert.equal(
    placeWebUrl("http://place.map.kakao.com/18619553"),
    "http://place.map.kakao.com/18619553",
  );
  assert.equal(
    placeWebUrl("https://place.map.kakao.com/18619553"),
    "https://place.map.kakao.com/18619553",
  );
});

test("누르면 실행되는 주소는 받지 않는다", () => {
  assert.equal(placeWebUrl("javascript:alert(1)"), null);
  assert.equal(placeWebUrl("JAVASCRIPT:alert(1)"), null);
  assert.equal(placeWebUrl("data:text/html,<script>"), null);
  assert.equal(placeWebUrl("//place.map.kakao.com/1"), null);
  assert.equal(placeWebUrl("place.map.kakao.com/1"), null);
  assert.equal(placeWebUrl(""), null);
});

// -----------------------------------------------------------------------------
// 지도 링크
// -----------------------------------------------------------------------------

test("카카오맵 링크에 이름과 좌표를 싣는다", () => {
  assert.equal(
    kakaoMapUrl(37.577613, 126.976898, "경복궁"),
    "https://map.kakao.com/link/map/%EA%B2%BD%EB%B3%B5%EA%B6%81,37.577613,126.976898",
  );
});

test("이름의 쉼표를 뺀다", () => {
  /*
    카카오맵 링크는 `이름,위도,경도`를 쉼표로 가른다. 이름에 쉼표가 있으면
    **칸이 밀려 엉뚱한 곳이 열린다.** 오류는 나지 않는다.
  */
  const url = kakaoMapUrl(37.5, 127.0, "서울, 종로");

  assert.ok(!url.includes("%2C"), "쉼표가 인코딩된 채로 남았다");
  assert.equal(url.split(",").length, 3, "쉼표로 가른 칸이 셋이 아니다");
  assert.ok(url.endsWith(",37.5,127"));
});

test("이름이 없어도 링크를 만든다", () => {
  /*
    **손으로 좌표만 적은 장소가 있을 수 있다.** 그때 링크를 안 만들면
    담아둔 좌표를 쓸 데가 없어진다.
  */
  const url = kakaoMapUrl(37.5, 127.0, "");

  assert.ok(url.startsWith("https://map.kakao.com/link/map/"));
  assert.ok(url.endsWith(",37.5,127"));

  assert.equal(kakaoMapUrl(37.5, 127.0, null), url);
  assert.equal(kakaoMapUrl(37.5, 127.0, undefined), url);
});

test("구글 지도에는 좌표만 보낸다", () => {
  /*
    **이름으로 보내면 같은 이름의 다른 곳이 열린다.** `경복궁`으로 물으면
    549건이 나오고 그중에 `다이소 경복궁역점`도 있다.
  */
  const url = googleMapsUrl(37.577613, 126.976898);

  assert.equal(
    url,
    "https://www.google.com/maps/search/?api=1&query=37.577613%2C126.976898",
  );
  assert.ok(!url.includes("경복궁"));
});

test("지도 링크는 https다", () => {
  assert.ok(kakaoMapUrl(37.5, 127, "가").startsWith("https://"));
  assert.ok(googleMapsUrl(37.5, 127).startsWith("https://"));
});

// -----------------------------------------------------------------------------
// 갈래와 상태
// -----------------------------------------------------------------------------

test("어디서 받아왔는지 둘뿐이다", () => {
  assert.deepEqual([...PLACE_PROVIDERS], ["kakao", "google"]);
  assert.ok(isPlaceProvider("kakao"));
  assert.ok(!isPlaceProvider("manual"));
  assert.ok(!isPlaceProvider(""));
});

test("직접 적은 장소에는 어디서 왔는지가 없다", () => {
  /*
    **`manual` 값을 두지 않는다.** 비어 있는 것이 곧 직접 적었다는 뜻이다.
    둘 다 두면 같은 뜻의 값이 두 벌이 되고, 화면이 어느 쪽을 보아야 하는지
    알 수 없어진다.
  */
  assert.equal(getPlaceProviderLabel(""), null);
  assert.equal(getPlaceProviderLabel(null), null);
  assert.equal(getPlaceProviderLabel("manual"), null);
  assert.equal(getPlaceProviderLabel("kakao"), "카카오맵");
});

test("가봤는지는 둘이고 비움이 세 번째다", () => {
  assert.deepEqual([...PLACE_VISIT_STATUSES], ["want_to_visit", "visited"]);
  assert.ok(isPlaceVisitStatus("want_to_visit"));
  assert.ok(isPlaceVisitStatus("visited"));
  assert.ok(!isPlaceVisitStatus(""));
  assert.ok(!isPlaceVisitStatus("unknown"));
});

test("안 정한 것에는 아무 말도 붙이지 않는다", () => {
  /*
    **`안 정함`이라고 적으면 정해야 할 일처럼 보인다.** 수업 준비에는
    이 구분이 쓸모없을 수 있다. (17-1.5절, 사용자가 정함)
  */
  assert.equal(getPlaceVisitStatusLabel(null), null);
  assert.equal(getPlaceVisitStatusLabel(""), null);
  assert.equal(getPlaceVisitStatusLabel("want_to_visit"), "가보고 싶다");
  assert.equal(getPlaceVisitStatusLabel("visited"), "가봤다");
});

// -----------------------------------------------------------------------------
// 카카오 응답 읽기
// -----------------------------------------------------------------------------

/**
 * 실제로 받은 응답에서 가져왔다. (2026-09-25, `경복궁`으로 물음)
 *
 * **지어낸 값으로 검사하지 않는다.** 이 응답에서 알게 된 것이 둘이다.
 * 도로명 주소가 빈 글자로 오고, 짧은 분류가 절반 넘게 비어 온다.
 * 지어낸 값에는 그런 것이 없다.
 */
const REAL_DOCUMENTS = [
  {
    address_name: "서울 종로구 세종로 1-1",
    category_group_code: "AT4",
    category_group_name: "관광명소",
    category_name: "여행 > 관광,명소 > 문화유적 > 고궁,궁",
    distance: "",
    id: "18619553",
    phone: "02-3700-3900",
    place_name: "경복궁",
    place_url: "http://place.map.kakao.com/18619553",
    road_address_name: "서울 종로구 사직로 161",
    x: "126.97689786832184",
    y: "37.577613288258206",
  },
  {
    // 궁 안의 건물. **짧은 분류가 비어 온다.**
    address_name: "서울 종로구 세종로 1-1",
    category_group_code: "",
    category_group_name: "",
    category_name: "여행 > 관광,명소 > 문화유적",
    distance: "",
    id: "17343711",
    phone: "",
    place_name: "경복궁 근정전",
    place_url: "http://place.map.kakao.com/17343711",
    road_address_name: "서울 종로구 사직로 161",
    x: "126.977018705336",
    y: "37.5785710686383",
  },
  {
    // **도로명 주소가 빈 글자로 온다.**
    address_name: "서울 종로구 세종로 1-1",
    category_group_code: "",
    category_group_name: "",
    category_name: "여행 > 관광,명소 > 문화유적",
    distance: "",
    id: "18619551",
    phone: "",
    place_name: "경복궁 경회루",
    place_url: "http://place.map.kakao.com/18619551",
    road_address_name: "",
    x: "126.976035671158",
    y: "37.5797746011469",
  },
  {
    // 찾던 곳이 아닌 것도 함께 온다. 549건 중 열다섯을 받는다.
    address_name: "서울 종로구 적선동 107-1",
    category_group_code: "",
    category_group_name: "",
    category_name: "가정,생활 > 생활용품점 > 다이소",
    distance: "",
    id: "917290272",
    phone: "1522-4400",
    place_name: "다이소 경복궁역점",
    place_url: "http://place.map.kakao.com/917290272",
    road_address_name: "서울 종로구 사직로 125",
    x: "126.97284219238949",
    y: "37.576161824007634",
  },
];

/**
 * 카카오는 **늘 `documents`에 담아 준다.** 배열을 그대로 주는 일은 없다.
 *
 * 처음에 배열을 바로 넘기는 검사를 썼다가 전부 실패했다. **있지도 않은
 * 모양을 받아들이게 고치지 않았다.** 그러면 검사는 통과하지만 실제 응답의
 * 모양이 바뀌었을 때 알아챌 그물이 헐거워진다.
 */
const REAL_PAYLOAD = {
  documents: REAL_DOCUMENTS,
  meta: { is_end: false, pageable_count: 40, total_count: 549 },
};

test("x가 경도이고 y가 위도다", () => {
  /*
    **이 검사가 이 파일에서 가장 중요하다.** 뒤집어 읽으면 위도 칸에 126이
    들어가 제약조건에 걸리거나, 걸리지 않는 값이면 지도가 엉뚱한 곳을 연다.

    경복궁은 북위 37도, 동경 126도다. 위도가 더 작은 쪽이다.
  */
  const [first] = readPlaceCandidates(REAL_PAYLOAD, 10);

  assert.equal(first.latitude, 37.577613);
  assert.equal(first.longitude, 126.976898);
  assert.ok(first.latitude < first.longitude, "위도와 경도가 뒤바뀌었다");
});

test("실제 응답에서 담을 값을 뽑는다", () => {
  const [first] = readPlaceCandidates(REAL_PAYLOAD, 10);

  assert.equal(first.name, "경복궁");
  assert.equal(first.externalId, "18619553");
  assert.equal(first.roadAddress, "서울 종로구 사직로 161");
  assert.equal(first.address, "서울 종로구 세종로 1-1");
  assert.equal(first.phone, "02-3700-3900");
  assert.equal(first.placeUrl, "http://place.map.kakao.com/18619553");
});

test("분류는 짧은 쪽이 아니라 길을 통째로 담는다", () => {
  /*
    **짧은 쪽이 절반 넘게 비어 온다.** 열다섯 건 중 아홉이 그랬고, 하필
    궁 안의 건물들이 그랬다. 그것으로 거르면 근정전도 경회루도 안 나오고
    오류는 나지 않는다. (17-1.4절에서 설계를 고친 까닭)
  */
  const [palace, hall] = readPlaceCandidates(REAL_PAYLOAD, 10);

  assert.equal(palace.category, "여행 > 관광,명소 > 문화유적 > 고궁,궁");

  // 짧은 분류가 빈 건물도 분류를 갖는다.
  assert.equal(hall.category, "여행 > 관광,명소 > 문화유적");
  assert.equal(categoryLabel(hall.category), "문화유적");
});

test("빈 글자로 온 주소를 없음으로 담는다", () => {
  const withoutRoad = readPlaceCandidates(REAL_PAYLOAD, 10).find(
    (candidate) => candidate.name === "경복궁 경회루",
  );

  assert.equal(withoutRoad.roadAddress, null);
  // 지번 주소는 있다. **한쪽이 없다고 둘 다 버리지 않는다.**
  assert.equal(withoutRoad.address, "서울 종로구 세종로 1-1");
});

test("전화가 빈 글자면 없음이다", () => {
  const hall = readPlaceCandidates(REAL_PAYLOAD, 10).find(
    (candidate) => candidate.name === "경복궁 근정전",
  );

  assert.equal(hall.phone, null);
});

test("찾던 곳이 아닌 것도 버리지 않는다", () => {
  /*
    **우리가 고르지 않는다.** `다이소 경복궁역점`이 찾던 곳일 수도 있다.
    우리가 정하면 틀린 값이 조용히 들어간다. 화면이 분류와 주소를 함께
    보여주고 사람이 고른다.
  */
  const names = readPlaceCandidates(REAL_PAYLOAD, 10).map((c) => c.name);

  assert.ok(names.includes("다이소 경복궁역점"));
  assert.equal(names.length, 4);
});

test("보여줄 수만큼만 자른다", () => {
  assert.equal(readPlaceCandidates(REAL_PAYLOAD, 2).length, 2);
  assert.equal(readPlaceCandidates(REAL_PAYLOAD, 0).length, 0);
});

test("이름이나 번호가 없는 줄은 버린다", () => {
  /*
    이름이 없으면 화면에 빈 단추가 생기고, 번호가 없으면 다시 받아올 길이
    없다. **하나가 이상해서 전부를 못 쓰게 만들지는 않는다.**
  */
  const mixed = [
    { id: "1", x: "127", y: "37" },
    { place_name: "이름만", x: "127", y: "37" },
    { place_name: "온전한 곳", id: "2", x: "127", y: "37" },
  ];

  const read = readPlaceCandidates({ documents: mixed }, 10);

  assert.equal(read.length, 1);
  assert.equal(read[0].name, "온전한 곳");
});

test("좌표가 없는 줄은 버린다", () => {
  /*
    좌표가 이 기능의 핵심이다. 없으면 지도로 갈 수 없어 손으로 적는 것과
    다를 바가 없다. **한쪽만 있는 것도 버린다.**
  */
  const noCoords = [
    { place_name: "좌표 없음", id: "1" },
    { place_name: "위도만", id: "2", y: "37.5" },
    { place_name: "글자 좌표", id: "3", x: "여기", y: "저기" },
  ];

  assert.equal(readPlaceCandidates({ documents: noCoords }, 10).length, 0);
});

test("모양이 바뀌어도 터지지 않는다", () => {
  /*
    **밖에서 온 값이다.** 모양이 바뀌면 빈 목록을 돌려주고, 화면은 "찾은
    장소가 없습니다"를 보여준다. 손으로 적는 길은 그대로 열려 있다.
  */
  assert.deepEqual(readPlaceCandidates(null, 10), []);
  assert.deepEqual(readPlaceCandidates("문서", 10), []);
  assert.deepEqual(readPlaceCandidates({}, 10), []);
  assert.deepEqual(readPlaceCandidates({ documents: "하나" }, 10), []);
  assert.deepEqual(readPlaceCandidates({ documents: [null, 1, "둘"] }, 10), []);
});

test("배열을 바로 주면 읽지 않는다", () => {
  /*
    **카카오는 늘 `documents`에 담아 준다.** 배열을 그대로 받아들이게
    만들면, 응답 모양이 바뀌었을 때 빈 목록이 아니라 엉뚱한 것을 읽으려
    들 수 있다. 아는 모양만 읽는다. (보안 원칙 7과 같은 생각이다)
  */
  assert.deepEqual(readPlaceCandidates(REAL_DOCUMENTS, 10), []);
});

// -----------------------------------------------------------------------------
// 주소로 찾기
// -----------------------------------------------------------------------------

/**
 * 주소 검색 응답의 모양. (2026-09-25, 사용자 요청으로 더함)
 *
 * **이름 검색과 모양이 다르다.** 주소가 두 덩이로 나뉘어 오고, 좌표가 세
 * 군데에 있고, **우편번호가 여기에만 있다.**
 */
const ADDRESS_PAYLOAD = {
  documents: [
    {
      address_name: "서울 종로구 사직로 161",
      address_type: "ROAD_ADDR",
      x: "126.976893",
      y: "37.5796223",
      address: {
        address_name: "서울 종로구 세종로 1-1",
        region_1depth_name: "서울",
        main_address_no: "1",
        sub_address_no: "1",
        x: "126.976893",
        y: "37.5796223",
      },
      road_address: {
        address_name: "서울 종로구 사직로 161",
        building_name: "경복궁",
        zone_no: "03045",
        x: "126.976893",
        y: "37.5796223",
      },
    },
  ],
  meta: { is_end: true, pageable_count: 1, total_count: 1 },
};

test("주소 검색에서 우편번호를 읽는다", () => {
  /*
    **이 값이 이름 검색에는 없다.** 그래서 주소로 찾기를 함께 만들었다.
    (2026-09-25, 사용자 요청)
  */
  const [first] = readAddressCandidates(ADDRESS_PAYLOAD, 10);

  assert.equal(first.postalCode, "03045");
});

test("주소 검색에서 도로명과 지번을 둘 다 읽는다", () => {
  const [first] = readAddressCandidates(ADDRESS_PAYLOAD, 10);

  assert.equal(first.roadAddress, "서울 종로구 사직로 161");
  assert.equal(first.address, "서울 종로구 세종로 1-1");
  assert.equal(first.latitude, 37.579622);
  assert.equal(first.longitude, 126.976893);
});

test("좌표가 맨 위에 없으면 안쪽에서 찾는다", () => {
  /*
    셋이 거의 같지만 하나가 비어 올 때 **좌표 없는 후보가 되는 것을 막는다.**
    좌표가 없으면 지도로 갈 수 없어 이 기능의 뜻이 사라진다.
  */
  const inner = {
    documents: [
      {
        address_name: "서울 종로구 사직로 161",
        road_address: {
          address_name: "서울 종로구 사직로 161",
          zone_no: "03045",
          x: "126.976893",
          y: "37.5796223",
        },
      },
    ],
  };

  const [first] = readAddressCandidates(inner, 10);

  assert.equal(first.latitude, 37.579622);
  assert.equal(first.longitude, 126.976893);
});

test("물어본 글자를 주소로 되돌려 주지 않는다", () => {
  /*
    맨 위의 `address_name`은 **물어본 것이 그대로 돌아온 값**이다. 그것을
    담으면 틀리게 적은 주소가 찾아준 주소처럼 보인다. 도로명과 지번 덩이가
    둘 다 없으면 후보로 쓰지 않는다.
  */
  const onlyEcho = {
    documents: [
      { address_name: "내가 잘못 적은 주소", x: "127", y: "37" },
    ],
  };

  assert.deepEqual(readAddressCandidates(onlyEcho, 10), []);
});

test("우편번호가 없는 주소도 받는다", () => {
  /*
    지번만 있는 주소에는 도로명 덩이가 없고, 우편번호도 없다. **그래도
    좌표는 쓸모가 있다.** 우편번호 하나 때문에 버리지 않는다.
  */
  const jibunOnly = {
    documents: [
      {
        address_name: "제주 서귀포시 성산읍 고성리 1",
        x: "126.9",
        y: "33.4",
        address: { address_name: "제주 서귀포시 성산읍 고성리 1" },
      },
    ],
  };

  const [first] = readAddressCandidates(jibunOnly, 10);

  assert.equal(first.postalCode, null);
  assert.equal(first.roadAddress, null);
  assert.equal(first.address, "제주 서귀포시 성산읍 고성리 1");
  assert.equal(first.latitude, 33.4);
});

test("좌표가 어디에도 없으면 버린다", () => {
  const noCoords = {
    documents: [
      { address_name: "어딘가", address: { address_name: "어딘가" } },
    ],
  };

  assert.deepEqual(readAddressCandidates(noCoords, 10), []);
});

test("주소 검색도 모양이 바뀌면 빈 목록이다", () => {
  assert.deepEqual(readAddressCandidates(null, 10), []);
  assert.deepEqual(readAddressCandidates({ documents: "하나" }, 10), []);
  assert.deepEqual(readAddressCandidates({ documents: [1, null] }, 10), []);
});

// -----------------------------------------------------------------------------
// 우편번호
// -----------------------------------------------------------------------------

test("국내 우편번호 다섯 자리를 받는다", () => {
  assert.equal(postalCode("03045"), "03045");
  assert.equal(postalCode("  03045  "), "03045");
});

test("해외 우편번호도 받는다", () => {
  /*
    **다섯 자리로 못박지 않는다.** 해외 장소는 손으로 적고 거기에는 글자가
    섞인다. 다섯 자리만 받으면 그 장소를 담을 수 없고, **우편번호 하나
    때문에 장소를 못 담게 만들지 않는다.** (17-1.4절)

    가운데 공백은 그대로 둔다. `SW1A 1AA`의 공백은 뜻이 있다.
  */
  assert.equal(postalCode("SW1A 1AA"), "SW1A 1AA");
  assert.equal(postalCode("100-0001"), "100-0001");
});

test("빈 우편번호는 없음이다", () => {
  assert.equal(postalCode(""), null);
  assert.equal(postalCode("   "), null);
  assert.equal(postalCode(null), null);
  assert.equal(postalCode(3045), null);
});

test("너무 긴 우편번호는 자른다", () => {
  // 제약조건이 스무 글자까지다. 길이에서 막히면 장소 전체가 저장되지 않는다.
  assert.equal(postalCode("0".repeat(30)).length, 20);
});

// -----------------------------------------------------------------------------
// 지도가 안 뜰 때
// -----------------------------------------------------------------------------

test("까닭마다 다른 말을 한다", () => {
  /*
    **"지도를 보여드리지 못합니다"만 말하면 무엇을 고쳐야 하는지 알 수
    없다.** 이 저장소가 도메인 등록을 빠뜨려 두 번 막혔고(12-A·12-C),
    그때마다 화면은 아무 말도 하지 않았다.
  */
  const said = MAP_FAILURES.map((reason) => mapFailureMessage(reason));

  assert.equal(new Set(said).size, MAP_FAILURES.length, "같은 말을 두 번 한다");
});

test("어느 까닭에도 링크로 가라고 말한다", () => {
  /*
    **지도가 안 떠도 장소 기능은 돌아간다.** 주소는 보이고 링크는 눌린다.
    그 사실을 안내문이 말해야 한다. 안 말하면 사용자는 장소가 망가진 줄 안다.
  */
  for (const reason of MAP_FAILURES) {
    assert.ok(
      mapFailureMessage(reason).includes("링크"),
      `${reason}: 링크로 가라고 말하지 않는다`,
    );
  }
});

test("모르는 까닭에도 빈 말을 하지 않는다", () => {
  /*
    **빈 자리는 고장처럼 보인다.** 사용자는 자기가 뭘 잘못했는지 찾게 된다.
  */
  for (const unknown of [null, undefined, "", "무엇인가", 3]) {
    assert.ok(
      mapFailureMessage(unknown).length > 0,
      `${String(unknown)}: 할 말이 없다`,
    );
  }
});

test("아는 까닭만 까닭으로 본다", () => {
  assert.deepEqual(
    [...MAP_FAILURES],
    ["no-key", "script-failed", "draw-failed"],
  );
  assert.ok(isMapLoadFailure("no-key"));
  assert.ok(!isMapLoadFailure("domain-not-registered"));
  assert.ok(!isMapLoadFailure(""));
});

test("스크립트 실패를 한 가지 원인으로 단정하지 않는다", () => {
  /*
    가장 잦은 원인은 도메인 등록 누락이다. 그런데 인터넷이 끊겼거나 확장
    기능이 막은 것일 수도 있다. **하나로 단정하면 엉뚱한 곳을 고치게 된다.**

    그리고 도메인 등록은 **운영자가 할 일이지 쓰는 사람이 할 일이 아니다.**
    화면에 "도메인을 등록하세요"라고 적으면 이용자가 할 수 없는 일을
    시키는 셈이다. 그 사정은 코드 주석에 적혀 있다.
  */
  const said = mapFailureMessage("script-failed");

  assert.ok(said.includes("인터넷") || said.includes("확장"));
  assert.ok(!said.includes("도메인"), "이용자가 할 수 없는 일을 시킨다");
});

// -----------------------------------------------------------------------------
// 국내와 해외
// -----------------------------------------------------------------------------

test("국내와 해외 둘뿐이고 비워둘 수 없다", () => {
  /*
    **`visit_status`와 다르다.** 가봤는지는 안 정함이 뜻을 갖지만, 장소가
    국내인지 해외인지는 **안 정한 상태가 없다.** 담는 순간 정해져 있고,
    모르면 지도를 어느 것으로 그릴지도 못 정한다. (17-3.2절)
  */
  assert.deepEqual([...PLACE_REGIONS], ["domestic", "overseas"]);
  assert.ok(isPlaceRegion("domestic"));
  assert.ok(isPlaceRegion("overseas"));
  assert.ok(!isPlaceRegion(""));
  assert.ok(!isPlaceRegion("korea"));
});

test("모르는 값에도 빈 자리를 만들지 않는다", () => {
  /*
    비움이 뜻을 갖지 않는 칸이라 **빈 말을 돌려주면 안 된다.**
    데이터베이스가 `not null default 'domestic'`으로 같은 것을 지킨다.
  */
  assert.equal(getPlaceRegionLabel("domestic"), "국내");
  assert.equal(getPlaceRegionLabel("overseas"), "해외");
  assert.equal(getPlaceRegionLabel(null), "국내");
  assert.equal(getPlaceRegionLabel(""), "국내");
  assert.equal(getPlaceRegionLabel("무엇인가"), "국내");
});

test("국내만 찾아줄 수 있다", () => {
  /*
    **화면이 이것을 보고 단추를 그릴지 정한다.** 없는 길을 눌러보고 나서야
    없다는 것을 알게 하지 않는다. 1단계에서 해외를 찾으면 `찾은 장소가
    없습니다`만 떴고, 그것이 "카카오에 없다"인지 "이름을 잘못 적었다"인지
    알 수 없었다. (17-3.1절)

    해외를 무엇으로 찾을지 정하면 이 검사가 함께 바뀐다. **바뀌는 것을
    잊지 않도록 값을 콕 집어 적어 둔다.**
  */
  assert.ok(canSearchByAddress("domestic"));
  assert.ok(!canSearchByAddress("overseas"));
});

test("지도는 국내면 카카오맵, 해외면 구글 지도로 그린다", () => {
  /*
    17-3.4절 1차례. 카카오맵은 해외 자료가 부실해 찍을 것이 안 보이고,
    구글 지도는 국내에서 길찾기가 안 된다. 어느 한쪽으로 통일하면 반쪽이
    못 쓰게 된다.
  */
  assert.equal(mapProviderForRegion("domestic"), "kakao");
  assert.equal(mapProviderForRegion("overseas"), "google");
});

test("어느 지도를 그릴지와 찾아줄 수 있는지는 다른 물음이다", () => {
  /*
    한 값에 두 가지를 묻고 있었다. 화면이 `찾을 수 있는 쪽에만 지도를
    그린다`로 되어 있어서, **해외에 지도를 붙이는 순간 찾기 단추까지
    함께 살아났다.**

    둘은 서로 다른 때에 되기 시작한다. 지도는 1차례에 되고, 해외를 이름으로
    찾는 것은 3차례가 되어야 된다. **그동안 두 값이 갈라져 있어야 한다.**
  */
  assert.equal(canSearchByAddress("overseas"), false);
  assert.equal(mapProviderForRegion("overseas"), "google");
});

test("모르는 값에는 카카오맵으로 답한다", () => {
  // region의 기본값이 domestic이고 데이터베이스가 not null로 같은 것을 지킨다.
  assert.equal(mapProviderForRegion(null), "kakao");
  assert.equal(mapProviderForRegion("DOMESTIC"), "kakao");
  assert.equal(mapProviderForRegion(""), "kakao");
});

// -----------------------------------------------------------------------------
// 찍은 자리의 주소
// -----------------------------------------------------------------------------

test("찍은 자리의 주소와 우편번호를 읽는다", () => {
  /*
    `coord2address`의 응답 모양이다. **좌표가 응답에 없다.** 우리가 보낸
    값이므로 돌려줄 이유가 없다. 그래서 주소 검색 쪽 읽기를 쓸 수 없다.
  */
  const payload = {
    documents: [
      {
        road_address: {
          address_name: "서울 종로구 사직로 161",
          building_name: "경복궁",
          zone_no: "03045",
        },
        address: {
          address_name: "서울 종로구 세종로 1-1",
          region_1depth_name: "서울",
        },
      },
    ],
    meta: { total_count: 1 },
  };

  assert.deepEqual(readCoordinateAddress(payload), {
    roadAddress: "서울 종로구 사직로 161",
    address: "서울 종로구 세종로 1-1",
    postalCode: "03045",
  });
});

test("도로명 주소가 없는 자리도 읽는다", () => {
  /*
    **지도에서 찍을 때는 이런 자리가 오히려 잦다.** 산, 논밭, 새로 낸 길이
    그렇다. 그때도 지번 주소는 있으니 버리지 않는다.
  */
  const payload = {
    documents: [
      { road_address: null, address: { address_name: "강원 평창군 대관령면 산1" } },
    ],
  };

  assert.deepEqual(readCoordinateAddress(payload), {
    roadAddress: null,
    address: "강원 평창군 대관령면 산1",
    postalCode: null,
  });
});

test("바다를 찍으면 주소가 없다", () => {
  /*
    **그래도 좌표는 쓸모가 있다.** 주소를 못 알아낸 것이 장소를 못 담을
    이유는 아니다. 부르는 쪽이 `null`을 실패가 아니라 "주소 없음"으로 읽는다.
  */
  assert.equal(readCoordinateAddress({ documents: [] }), null);
  assert.equal(
    readCoordinateAddress({ documents: [{ road_address: null, address: null }] }),
    null,
  );
});

test("찍은 자리 주소도 모양이 바뀌면 빈 값이다", () => {
  assert.equal(readCoordinateAddress(null), null);
  assert.equal(readCoordinateAddress({ documents: "하나" }), null);
  assert.equal(readCoordinateAddress({ documents: [null] }), null);
  assert.equal(readCoordinateAddress("문서"), null);
});

// -----------------------------------------------------------------------------
// 해외를 이름으로 찾기 (17-3.4절 2차례)
// -----------------------------------------------------------------------------

test("구글에 청하는 칸에 값이 뛰는 것이 섞이지 않았다", () => {
  /*
    **이 목록이 곧 값이다.** 구글은 청한 칸에 따라 값을 다르게 매기고,
    칸 하나가 등급을 통째로 올린다.

    19-E.5절이 하루 상한 50으로 한 달 최대 1,550번을 잡아두었는데 Pro의
    월 무료가 5,000번이다. Enterprise 칸을 하나라도 청하면 그 셈이 무너지고,
    **무너진 것은 청구서가 와야 안다.**

    말로만 적은 약속은 잊힌다. 전화번호를 채우고 싶어지는 날이 온다.
  */
  const expensive = GOOGLE_PLACE_FIELDS.filter((field) =>
    GOOGLE_ENTERPRISE_PLACE_FIELDS.includes(field),
  );

  assert.deepEqual(
    expensive,
    [],
    `값이 뛰는 칸을 청하고 있다: ${expensive.join(", ")}`,
  );
});

test("청하는 칸이 비어 있지 않고 겹치지 않는다", () => {
  // 비면 이름도 좌표도 안 와서 후보가 하나도 안 남는다.
  assert.ok(GOOGLE_PLACE_FIELDS.length > 0);
  assert.equal(
    new Set(GOOGLE_PLACE_FIELDS).size,
    GOOGLE_PLACE_FIELDS.length,
  );
});

test("구글이 준 장소를 후보로 읽는다", () => {
  /*
    지도 SDK가 주는 모양이다. 이름은 글자 하나이고 좌표는 `lat()`·`lng()`로
    꺼내는 객체다.
  */
  const candidates = readGooglePlaceCandidates(
    [
      {
        id: "ChIJLU7jZClu5kcR4PcOOO6p3I0",
        displayName: "에펠탑",
        formattedAddress: "Av. Gustave Eiffel, 75007 Paris, France",
        primaryTypeDisplayName: "관광 명소",
        location: { lat: () => 48.85837, lng: () => 2.294481 },
      },
    ],
    10,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "에펠탑");
  assert.equal(candidates[0].externalId, "ChIJLU7jZClu5kcR4PcOOO6p3I0");
  assert.equal(
    candidates[0].address,
    "Av. Gustave Eiffel, 75007 Paris, France",
  );
  assert.equal(candidates[0].category, "관광 명소");
  assert.equal(candidates[0].latitude, 48.85837);
  assert.equal(candidates[0].longitude, 2.294481);
});

test("좌표가 숫자로 와도 읽는다", () => {
  // 같은 API를 주소로 부르면 객체가 아니라 숫자로 온다.
  const candidates = readGooglePlaceCandidates(
    [
      {
        id: "x",
        displayName: { text: "루브르 박물관", languageCode: "ko" },
        location: { lat: 48.860611, lng: 2.337644 },
      },
    ],
    10,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "루브르 박물관");
  assert.equal(candidates[0].latitude, 48.860611);
});

test("해외 후보의 도로명 주소와 전화번호는 비운다", () => {
  /*
    **해외에는 도로명과 지번이라는 구분이 없다.** 구글은 주소를 한 줄로
    준다. 그 한 줄을 도로명 칸에 넣으면 국내 장소와 같은 뜻인 것처럼
    보이는데 아니다.

    전화번호는 값이 뛰는 칸이라 아예 청하지 않는다. **모르는 것을
    지어내지 않는다.**
  */
  const [only] = readGooglePlaceCandidates(
    [
      {
        id: "x",
        displayName: "에펠탑",
        formattedAddress: "Av. Gustave Eiffel, 75007 Paris, France",
        location: { lat: 48.85837, lng: 2.294481 },
      },
    ],
    10,
  );

  assert.equal(only.roadAddress, null);
  assert.equal(only.phone, null);
  assert.equal(only.address, "Av. Gustave Eiffel, 75007 Paris, France");
});

test("이름이나 좌표가 없는 후보는 버린다", () => {
  /*
    이름이 없으면 화면에 **누를 수 없는 빈 단추**가 생긴다. 좌표가 없으면
    눌렀을 때 지도가 사라진다. 해외에서는 좌표가 거의 전부다.

    **하나가 이상해서 전부를 못 쓰게 만들지 않는다.** 멀쩡한 것은 남는다.
  */
  const candidates = readGooglePlaceCandidates(
    [
      { id: "a", location: { lat: 1, lng: 2 } },
      { id: "b", displayName: "좌표 없음" },
      { displayName: "번호 없음", location: { lat: 1, lng: 2 } },
      { id: "d", displayName: "멀쩡한 곳", location: { lat: 1, lng: 2 } },
    ],
    10,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "멀쩡한 곳");
});

test("바다 밖 좌표를 가진 후보는 버린다", () => {
  // 위도와 경도를 바꿔 넣는 실수가 여기서 걸린다.
  const candidates = readGooglePlaceCandidates(
    [{ id: "a", displayName: "어딘가", location: { lat: 200, lng: 2 } }],
    10,
  );

  assert.deepEqual(candidates, []);
});

test("목록이 아니면 빈 목록이다", () => {
  assert.deepEqual(readGooglePlaceCandidates(null, 10), []);
  assert.deepEqual(readGooglePlaceCandidates({ places: [] }, 10), []);
  assert.deepEqual(readGooglePlaceCandidates(undefined, 10), []);
});

test("청한 수보다 많이 와도 그만큼만 남긴다", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    id: `id-${index}`,
    displayName: `곳 ${index}`,
    location: { lat: 1, lng: 2 },
  }));

  assert.equal(readGooglePlaceCandidates(many, 10).length, 10);
});

// -----------------------------------------------------------------------------
// 해외에서 찍은 자리의 주소 (17-3.4절 3차례)
// -----------------------------------------------------------------------------

test("구글이 좌표로 돌려준 주소를 읽는다", () => {
  const address = readGoogleCoordinateAddress([
    {
      formatted_address: "5 Av. Anatole France, 75007 Paris, France",
      address_components: [
        { long_name: "5", short_name: "5", types: ["street_number"] },
        { long_name: "75007", short_name: "75007", types: ["postal_code"] },
      ],
    },
  ]);

  assert.equal(address.address, "5 Av. Anatole France, 75007 Paris, France");
  assert.equal(address.postalCode, "75007");
});

test("해외 주소의 도로명 칸은 비운다", () => {
  /*
    **해외에는 도로명과 지번이라는 구분이 없다.** 구글은 주소를 한 줄로
    준다. 그 한 줄을 도로명 칸에 넣으면 국내 장소와 같은 뜻인 것처럼
    보이는데 아니다. 이름으로 찾을 때와 같은 판단이다.
  */
  const address = readGoogleCoordinateAddress([
    { formatted_address: "1 Chome-1-2 Oshiage, Sumida City, Tokyo, Japan" },
  ]);

  assert.equal(address.roadAddress, null);
  assert.ok(address.address.startsWith("1 Chome"));
});

test("우편번호가 없어도 주소는 읽는다", () => {
  // 우편번호가 없는 나라가 있고, 길 한가운데를 찍으면 구글도 주지 않는다.
  const address = readGoogleCoordinateAddress([
    {
      formatted_address: "Serengeti National Park, Tanzania",
      address_components: [
        { long_name: "Tanzania", short_name: "TZ", types: ["country"] },
      ],
    },
  ]);

  assert.equal(address.postalCode, null);
  assert.equal(address.address, "Serengeti National Park, Tanzania");
});

test("주소가 있는 첫 줄을 쓴다", () => {
  /*
    구글은 같은 자리를 건물·길·동네·시 차례로 여러 줄 돌려준다. 앞엣것일수록
    좁고, 찍은 자리를 말하는 것은 좁은 쪽이다. 앞엣것에 주소가 없으면
    다음 것을 본다.
  */
  const address = readGoogleCoordinateAddress([
    { address_components: [] },
    { formatted_address: "좁은 곳" },
    { formatted_address: "넓은 곳" },
  ]);

  assert.equal(address.address, "좁은 곳");
});

test("줄 것이 없으면 null이다", () => {
  // 바다 한가운데를 찍으면 구글도 줄 것이 없다. 그때는 좌표만 담는다.
  assert.equal(readGoogleCoordinateAddress([]), null);
  assert.equal(readGoogleCoordinateAddress(null), null);
  assert.equal(readGoogleCoordinateAddress(undefined), null);
  assert.equal(readGoogleCoordinateAddress([{ formatted_address: "  " }]), null);
});

test("우편번호가 아닌 조각을 우편번호로 읽지 않는다", () => {
  const address = readGoogleCoordinateAddress([
    {
      formatted_address: "어딘가",
      address_components: [
        { long_name: "75007", short_name: "75007", types: ["street_number"] },
        { long_name: "Paris", short_name: "Paris", types: ["locality"] },
      ],
    },
  ]);

  assert.equal(address.postalCode, null);
});
