"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import {
  lookupAddressAtPoint,
  lookupAddresses,
  lookupPlaces,
  type AddressCandidate,
  type CoordinateAddress,
  type PlaceCandidate,
} from "@/lib/places/kakao";
import {
  MAX_ADDRESS_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
  PLACE_PROVIDERS,
  PLACE_REGIONS,
  PLACE_VISIT_STATUSES,
  isPlaceProvider,
  isPlaceRegion,
  isPlaceVisitStatus,
  latitude,
  longitude,
  placeWebUrl,
} from "@/lib/places/places";
import { savePlaceProfile } from "@/lib/places/queries";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  formValue,
} from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * 장소 정보. (설계 문서 17-1절)
 *
 * 세 겹으로 막는다.
 *   1. 이 파일의 requireActiveAccount
 *   2. place_profiles 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 *
 * 여기서 내보내는 것은 브라우저가 부를 수 있다. 서버끼리만 쓰는 도우미는
 * `src/lib` 쪽에 둔다. (`docs/VERIFICATION.md` 4-27절)
 */

function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/** 이름으로 후보를 찾는다. 담지는 않는다. */
export async function findPlaces(
  query: string,
): Promise<
  | { ok: true; candidates: PlaceCandidate[]; notice: string | null }
  | { ok: false; message: string }
> {
  await requireActiveAccount();

  return lookupPlaces(query);
}

/**
 * 주소로 후보를 찾는다. 담지는 않는다. (2026-09-25, 사용자 요청)
 *
 * **이름으로 찾는 것과 다른 물음이다.** 상호명이 틀렸거나 카카오에 없는
 * 가게일 때 쓴다. 우편번호도 이쪽에만 있다. (17-1.3절)
 */
export async function findAddresses(
  query: string,
): Promise<
  | { ok: true; candidates: AddressCandidate[]; notice: string | null }
  | { ok: false; message: string }
> {
  await requireActiveAccount();

  return lookupAddresses(query);
}

/**
 * 지도에서 찍은 자리의 주소를 받아온다. (2026-09-25, 사용자 요청)
 *
 * **이름을 기억하지 못할 때 쓰는 길이다.** 이름으로도 주소로도 못 찾을 때가
 * 있다. 간판과 등록된 상호가 다르거나, "그 골목 그 자리"만 기억나는 경우다.
 * (17-3.3절)
 *
 * 좌표는 **브라우저가 보낸다.** 사용자가 지도에서 찍은 자리이므로 그것이
 * 맞다. 다만 그 값으로 밖에 묻기 전에 범위를 본다. `lookupAddressAtPoint`가
 * 위도 -90~90, 경도 -180~180을 확인하고 아니면 묻지 않는다.
 *
 * 주소를 못 알아내도 실패가 아니다. 바다나 산을 찍으면 그렇고, 그때도
 * 좌표는 쓸모가 있다.
 */
export async function findAddressAtPoint(
  latitudeValue: number,
  longitudeValue: number,
): Promise<
  | { ok: true; address: CoordinateAddress | null }
  | { ok: false; message: string }
> {
  await requireActiveAccount();

  return lookupAddressAtPoint(latitudeValue, longitudeValue);
}

/** 비워둘 수 있는 글 칸. 빈 칸은 빈 글자가 아니라 **없음**이다. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

/**
 * 좌표. 사람이 손으로 적을 수도 있다.
 *
 * **범위를 여기서 본다.** 데이터베이스도 막지만, 거기서 막히면 장소 정보
 * 전체가 저장되지 않고 화면에는 "저장하지 못했습니다" 한 줄만 보인다.
 * 어느 값이 문제였는지 알 수 없다.
 *
 * **빈 칸과 못 알아본 값을 가른다.** 둘을 같이 다루면 `서울` 같은 글자를
 * 적었을 때 조용히 버려지고, 저장은 성공했다고 나온다. 사용자는 좌표를
 * 적었다고 믿는데 지도 링크가 없다. **말없이 버리는 것이 거절보다 나쁘다.**
 *
 * 그래서 다듬기 전에 원래 글자를 먼저 본다. 비어 있으면 통과시키고,
 * 적었는데 못 알아보면 거절한다.
 */
const optionalCoordinate = (
  read: (value: unknown) => number | null,
  label: string,
) =>
  z
    .string()
    .trim()
    .refine((value) => value.length === 0 || read(value) !== null, {
      message: `${label}를 숫자로 적어 주세요. 위도는 -90~90, 경도는 -180~180입니다.`,
    })
    .transform((value) => (value.length === 0 ? null : read(value)));

const saveSchema = z
  .object({
    sourceId: z.string().uuid(),
    title: z
      .string()
      .trim()
      .min(1, "장소 이름을 적어 주세요.")
      .max(MAX_TITLE_LENGTH),
    description: optionalText(MAX_DESCRIPTION_LENGTH),
    /*
      국내인가 해외인가. **비워둘 수 없다.** (17-3.2절)

      `visit_status`와 다르다. 가봤는지는 안 정함이 뜻을 갖지만, 장소가
      국내인지 해외인지는 안 정한 상태가 없다. 화면이 반드시 하나를 보낸다.
    */
    region: z.enum(PLACE_REGIONS),
    /*
      아래는 찾아온 값을 그대로 넘기는 칸이다. 화면이 숨은 칸으로 들고
      있다가 함께 보낸다. **숨은 칸이라도 믿지 않는다.** 브라우저에서
      고칠 수 있다.
    */
    provider: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine(
        (value) =>
          value === null || (PLACE_PROVIDERS as readonly string[]).includes(value),
        { message: "어디서 받아온 값인지 알 수 없습니다." },
      ),
    externalId: optionalText(MAX_EXTERNAL_ID_LENGTH),
    roadAddress: optionalText(MAX_ADDRESS_LENGTH),
    address: optionalText(MAX_ADDRESS_LENGTH),
    category: optionalText(MAX_CATEGORY_LENGTH),
    postalCode: optionalText(MAX_POSTAL_CODE_LENGTH),
    phone: optionalText(MAX_PHONE_LENGTH),
    placeUrl: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : placeWebUrl(value))),
    latitudeValue: optionalCoordinate(latitude, "위도"),
    longitudeValue: optionalCoordinate(longitude, "경도"),
    /*
      가봤는가. **빈 값이 뜻을 가진다.** 안 정함이며 `가보고 싶다`와 다르다.
      되돌릴 수 있어야 하므로 빈 값을 거절하지 않는다. (17-1.5절)
    */
    visitStatus: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine(
        (value) =>
          value === null ||
          (PLACE_VISIT_STATUSES as readonly string[]).includes(value),
        { message: "가봤는지를 확인해 주세요." },
      ),
    returnTo: z.string(),
  })
  /*
    **좌표는 짝이다.** 한쪽만 적으면 지도 링크가 오류 없이 엉뚱한 곳을 연다.
    칸마다 따로 보면 "위도를 적어 주세요"라고 말하게 되는데, 실제 규칙은
    "둘 다 있거나 둘 다 없다"이다.
  */
  .refine(
    (values) =>
      (values.latitudeValue === null) === (values.longitudeValue === null),
    { message: "위도와 경도는 둘 다 적거나 둘 다 비워 주세요." },
  )
  /*
    국내·해외와 어디서 받아왔는지가 맞아야 한다. (17-3.2절)

    데이터베이스도 막는다(`place_profiles_region_provider_match`). 그런데
    **거기서 막히면 "저장하지 못했습니다" 한 줄만 뜨고 어느 값이 문제였는지
    알 수 없다.** 여기서 먼저 잡아 무엇이 어긋났는지 말한다.

    화면은 국내·해외를 바꿀 때 `provider`를 비우므로 보통은 여기 걸리지
    않는다. **숨은 칸이라도 믿지 않는다.** 브라우저에서 고칠 수 있다.
  */
  .refine(
    (values) =>
      values.provider === null ||
      (values.region === "domestic" && values.provider === "kakao") ||
      (values.region === "overseas" && values.provider === "google"),
    {
      message:
        "국내는 카카오에서, 해외는 구글에서 찾은 값만 담을 수 있습니다. 국내·해외를 다시 골라 주세요.",
    },
  );

/**
 * 장소를 담는다.
 *
 * 두 표에 나눠 담는다. 이름·왜 담았는지·지도 주소는 `sources`, 나머지는
 * `place_profiles`다. 그 덕에 **목록 화면의 표시와 검색이 그대로
 * 동작한다.** 책·YouTube·영화와 같은 방식이다.
 */
export async function savePlace(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = saveSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    title: formValue(formData.get("title")),
    description: formValue(formData.get("description")),
    region: formValue(formData.get("region")),
    provider: formValue(formData.get("provider")),
    externalId: formValue(formData.get("externalId")),
    roadAddress: formValue(formData.get("roadAddress")),
    address: formValue(formData.get("address")),
    category: formValue(formData.get("category")),
    postalCode: formValue(formData.get("postalCode")),
    phone: formValue(formData.get("phone")),
    placeUrl: formValue(formData.get("placeUrl")),
    latitudeValue: formValue(formData.get("latitude")),
    longitudeValue: formValue(formData.get("longitude")),
    visitStatus: formValue(formData.get("visitStatus")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    const fallback =
      sanitizeNextPath(formValue(formData.get("returnTo"))) ?? "/library";

    redirectWithQuery(fallback, {
      error:
        parsed.error.issues[0]?.message ?? "적어주신 내용을 확인해 주세요.",
    });
  }

  const values = parsed.data;
  const returnTo = sanitizeNextPath(values.returnTo) ?? "/library";

  const supabase = await createClient();

  /*
    자료 쪽을 먼저 고친다.

    **소유자 조건을 질의에도 건다.** 정책이 이미 막지만, 막는 것과 0건이
    바뀌는 것은 다르다. 여기서 걸면 남의 자료 id가 와도 0건이 되고
    아래에서 알아챈다. (보안 원칙 5)
  */
  /*
    자료의 주소.

    **없을 때 지우지 않는다.** 손으로 적은 장소에는 상세 화면 주소가 없는데,
    그때 `null`을 보내면 **자료를 만들 때 사용자가 넣어둔 주소가 조용히
    사라진다.** 블로그 글 주소를 넣고 만든 뒤 주소를 손으로 채워 저장하면
    그 링크를 잃는다. 오류는 나지 않는다.

    그래서 받아온 주소가 있을 때만 덮어쓴다. 다른 장소를 골라 다시 저장하면
    새 주소가 오므로 바뀐다. **아무 주소나 담기지도 않는다.**
    `placeWebUrl`이 http와 https만 통과시킨다.

    카카오 장소였다가 손으로 적는 장소로 바꾼 경우에는 옛 주소가 남는다.
    그것은 자료 고치기 화면에서 지울 수 있다. **남아 있는 것이 사라지는
    것보다 낫다.**
  */
  const sourceChanges =
    values.placeUrl === null
      ? { title: values.title, description: values.description }
      : {
          title: values.title,
          description: values.description,
          original_url: values.placeUrl,
        };

  const { data: updated, error: sourceError } = await supabase
    .from("sources")
    .update(sourceChanges)
    .eq("id", values.sourceId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (sourceError || !updated) {
    console.error(
      "[ThreadMark] 장소 자료 저장 실패:",
      sourceError?.message ?? "대상 없음",
    );

    redirectWithQuery(returnTo, {
      error: "저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  /*
    형변환 대신 앞에서 만든 확인 함수를 쓴다.

    위의 검증이 이미 아닌 값을 거절했으므로 여기서는 좁히기만 한다. 그래도
    `as`로 우기지 않는다. **우기면 검증을 고치다 실수했을 때 컴파일러가
    말해주지 않는다.** 같은 이유로 `isSourceType`이 있다.
  */
  const saved = await savePlaceProfile(values.sourceId, {
    region: isPlaceRegion(values.region) ? values.region : "domestic",
    provider: isPlaceProvider(values.provider) ? values.provider : null,
    externalId: values.externalId,
    roadAddress: values.roadAddress,
    address: values.address,
    latitude: values.latitudeValue,
    longitude: values.longitudeValue,
    category: values.category,
    postalCode: values.postalCode,
    phone: values.phone,
    placeUrl: values.placeUrl,
    visitStatus: isPlaceVisitStatus(values.visitStatus)
      ? values.visitStatus
      : null,
  });

  if (!saved) {
    redirectWithQuery(returnTo, {
      error: "장소 정보를 저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo);
  revalidatePath("/library");

  redirectWithQuery(returnTo, { notice: "장소를 담았습니다." });
}
