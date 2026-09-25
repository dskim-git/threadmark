import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  isPlaceProvider,
  isPlaceRegion,
  isPlaceVisitStatus,
  type PlaceProvider,
  type PlaceRegion,
  type PlaceVisitStatus,
} from "./places";

/**
 * 장소 자료 조회와 저장. (설계 문서 17-1절)
 *
 * `sources`가 담지 않는 것만 여기 있다. 장소 이름은 `sources.title`,
 * 왜 담았는지는 `sources.description`, 지도 주소는 `sources.original_url`이
 * 들고 있다. **같은 뜻의 칸이 두 벌이 되면 한쪽이 저장되지 않는다.**
 */

export type PlaceProfile = {
  /** 국내인가 해외인가. **비어 있을 수 없다.** (17-3.2절) */
  region: PlaceRegion;
  /** 어디서 받아온 값인가. 비어 있으면 직접 적은 장소다. */
  provider: PlaceProvider | null;
  externalId: string | null;
  roadAddress: string | null;
  address: string | null;
  /** 좌표. **짝으로만 담긴다.** 데이터베이스가 그것을 지킨다. */
  latitude: number | null;
  longitude: number | null;
  /** 분류를 통째로. 화면은 마지막 토막만 보여준다. */
  category: string | null;
  /** 우편번호. **주소로 찾을 때만 온다.** 이름으로 찾으면 비어 있다. */
  postalCode: string | null;
  phone: string | null;
  placeUrl: string | null;
  fetchedAt: string | null;
  /** 가봤는가. **비어 있으면 안 정한 것이다.** */
  visitStatus: PlaceVisitStatus | null;
};

export async function getPlaceProfile(
  sourceId: string,
): Promise<PlaceProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    고르는 칸 목록을 변수로 빼지 않는다. Supabase 타입은 이 글자를
    그대로 읽어 돌아올 모양을 정한다. (AGENTS.md 6절)
  */
  const { data, error } = await supabase
    .from("place_profiles")
    .select(
      "region, provider, external_id, road_address, address, latitude, longitude, category, postal_code, phone, place_url, fetched_at, visit_status",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 장소 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  /*
    모르는 값은 비워서 돌려준다. **없는 것으로 보지는 않는다.**

    작품 갈래는 모르면 전체를 없는 것으로 봤다. 그쪽은 그 값 없이 TMDB에
    다시 물을 수 없어서다. 장소는 다르다. 주소와 좌표가 이미 있고, 그것만
    있어도 지도로 갈 수 있다. **모르는 값 하나 때문에 담아둔 주소를
    감추지 않는다.** (보안 원칙 7은 접근 판단에 쓰는 규칙이다)
  */
  return {
    /*
      모르는 값은 국내로 본다. **비우지 않는다.** 이 칸은 비움이 뜻을
      갖지 않으므로, 비우면 화면이 지도를 어느 것으로 그릴지 못 정한다.
    */
    region: isPlaceRegion(data.region) ? data.region : "domestic",
    provider: isPlaceProvider(data.provider) ? data.provider : null,
    externalId: data.external_id,
    roadAddress: data.road_address,
    address: data.address,
    latitude: data.latitude,
    longitude: data.longitude,
    category: data.category,
    postalCode: data.postal_code,
    phone: data.phone,
    placeUrl: data.place_url,
    fetchedAt: data.fetched_at,
    visitStatus: isPlaceVisitStatus(data.visit_status)
      ? data.visit_status
      : null,
  };
}

export type PlaceProfileInput = {
  region: PlaceRegion;
  provider: PlaceProvider | null;
  externalId: string | null;
  roadAddress: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  postalCode: string | null;
  phone: string | null;
  placeUrl: string | null;
  visitStatus: PlaceVisitStatus | null;
};

/**
 * 장소 정보를 담는다. 이미 있으면 덮어쓴다.
 *
 * **덮어쓰는 것이 맞다.** 후보를 누른 것이 곧 "이 장소가 맞다"는 뜻이다.
 * 빈 칸만 채우게 두면 한 곳을 담은 뒤 다른 곳으로 바꿀 수 없다. 음악에서
 * 겪은 고장이다. (`AGENTS.md` 2절)
 *
 * 사용자가 적는 값(이름, 왜 담았는지, 그곳의 생각)은 `sources`와 `captures`에
 * 있어서 이 함수가 건드리지 않는다. **담는 표를 나눈 덕에 덮어쓸 것과
 * 지킬 것이 저절로 갈린다.**
 *
 * `visit_status`만 예외다. 사람이 적는 값인데 이 표에 있다. 그래서 화면이
 * 지금 값을 함께 보내고, 여기서는 받은 것을 그대로 담는다. 장소를 바꿔도
 * `가보고 싶다`는 그대로 남는다 — 같은 곳을 다시 고르는 일이 흔하기 때문이다.
 */
export async function savePlaceProfile(
  sourceId: string,
  input: PlaceProfileInput,
): Promise<boolean> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    좌표는 **짝으로만** 보낸다.

    한쪽만 보내면 `place_profiles_coordinate_pair`에 걸려 장소 정보 전체가
    저장되지 않고, 화면에는 "저장하지 못했습니다" 한 줄만 보인다. 어느 값이
    문제였는지 알 수 없다. 여기서 갈라 두면 그 일이 생기지 않는다.
  */
  const hasPair = input.latitude !== null && input.longitude !== null;

  /*
    받아온 값에는 **어디서 받았는지가 함께 있어야 한다.**

    `provider`가 없으면 `external_id`와 `fetched_at`을 보내지 않는다.
    데이터베이스의 `place_profiles_provider_required`가 같은 것을 지키는데,
    거기서 막히면 역시 전체가 저장되지 않는다.
  */
  const fromProvider = input.provider !== null;

  // owner_id를 보내지 않는다. 트리거가 채운다. (보안 원칙 2)
  const { error } = await supabase.from("place_profiles").upsert(
    {
      source_id: sourceId,
      region: input.region,
      provider: input.provider,
      external_id: fromProvider ? input.externalId : null,
      road_address: input.roadAddress,
      address: input.address,
      latitude: hasPair ? input.latitude : null,
      longitude: hasPair ? input.longitude : null,
      category: input.category,
      postal_code: input.postalCode,
      phone: input.phone,
      place_url: input.placeUrl,
      /*
        **받아온 때는 우리가 찍는다.** 화면이 보내는 값을 쓰지 않는다.
        브라우저에서 고칠 수 있는 값이면 "언제 본 값인가"를 믿을 수 없다.
      */
      fetched_at: fromProvider ? new Date().toISOString() : null,
      visit_status: input.visitStatus,
    },
    { onConflict: "source_id" },
  );

  if (error) {
    console.error("[ThreadMark] 장소 정보 저장 실패:", error.message);

    return false;
  }

  return true;
}
