import { z } from "zod";

/**
 * 이미지에서 남긴 기록의 자리. (설계 문서 16절, 2026-10-04)
 *
 * > pdf와 비슷하게 이미지가 여러장이라면 이를 하나의 메모에 기록해야 할
 * > 때도 있으니까 pdf에 메모를 기록하는 방식과 비슷했으면 좋겠어.
 *
 * 쪽과 장이 어떻게 다른가
 *   PDF는 **파일 하나에 쪽이 여럿**이라 `sourceFileId`와 `page`가 둘 다
 *   필요했다. 이미지는 **파일 하나가 곧 한 장**이다. 그래서 `page`를 두지
 *   않는다.
 *
 *   번호를 담고 싶어지는데, 담으면 **파일을 떼거나 더할 때 번호가 밀린다.**
 *   3장에 남긴 메모가 2장을 가리키게 되고, 오류는 나지 않는다. 몇 번째
 *   장인지는 **지금 목록에서 세면 알 수 있는 값**이라 담지 않는다.
 *
 *   `sourceFileId`는 그 파일이 지워지기 전까지 변하지 않는다. 되짚어 갈
 *   자리로 그쪽이 맞다.
 *
 * 왜 `pdf-page`를 같이 쓰지 않는가
 *   값이 같은 모양이라 그러고 싶어진다. 그러나 기록 목록에서 **`3쪽`이라고
 *   적힌 것이 PDF인지 이미지인지 가릴 수 없게 된다.** 되짚어 가는 화면도
 *   다르다. 갈래를 나누면 화면이 무엇을 그릴지 바로 안다.
 *
 * 이 파일은 `zod`만 쓴다. 담긴 값의 모양을 정하는 일만 하고 데이터베이스나
 * 화면을 모른다. (`pdf-locator.ts`와 같은 자리)
 */

/**
 * 한 장을 통째로 가리키는 메모.
 *
 * PDF의 `pdf-page`와 같은 뜻이다. 그림이나 사진에는 **고를 글자가 없어서**
 * 이 길이 기본이고, 영역을 고르는 길은 2차례에서 더한다.
 */
export const IMAGE_PAGE_KIND = "image-page";

export const imagePageLocatorSchema = z.object({
  kind: z.literal(IMAGE_PAGE_KIND),

  /**
   * 어느 장인지. **이 값 하나가 장을 가린다.**
   *
   * 번호를 함께 담지 않는 까닭은 머리말에 적었다. 파일을 떼거나 더하면
   * 번호가 밀리는데, 그때 오류는 나지 않고 가리키는 곳만 달라진다.
   */
  sourceFileId: z.uuid(),

  /**
   * 그 시점 파일의 md5Checksum.
   *
   * 파일이 교체되면 값이 달라진다. "기존 기록이 가리키던 그림이 아닐 수
   * 있다"를 알리는 데 쓴다. PDF와 같다. (설계 문서 9.2절)
   * 바이너리가 아닌 파일에는 값이 없으므로 null을 허용한다.
   */
  fileChecksum: z.string().max(128).nullable(),
});

export type ImagePageLocator = z.infer<typeof imagePageLocatorSchema>;

/**
 * 그림의 **한 부분**을 가리키는 메모. (16-2, 2026-10-04)
 *
 * 블루프린트 16절이 `사각형 영역 메모`라고 적어둔 자리다.
 *
 * 왜 상대값(0~1)으로 담는가
 *   **이 결정이 16-2에서 가장 중요하다.**
 *
 *   같은 그림을 **여러 크기로 본다.** 칸에 맞춰 볼 때와 원본으로 볼 때가
 *   다르고, 화면이 넓은 기기와 좁은 기기가 다르다. 화면에 보이는
 *   픽셀값으로 담으면 **다른 크기로 열었을 때 상자가 엉뚱한 데 생긴다.**
 *   그리고 오류는 나지 않는다. 그냥 다른 곳을 가리킨다.
 *
 *   원본 픽셀로 담는 길도 있다. 더 정확하지만 **파일이 다른 해상도로
 *   교체되면 상자가 그림 밖으로 나간다.** 상대값은 그 경우에도 0~1 안에
 *   머물고, 교체되었다는 것은 `fileChecksum`이 말한다.
 *
 *   그래서 상대값이다. `0.1, 0.2, 0.3, 0.4`는 "왼쪽에서 10%, 위에서 20%
 *   자리에 너비 30%, 높이 40%"다. 어느 크기로 열어도 같은 자리를 가리킨다.
 *
 * 왜 최소 크기를 두는가
 *   누르기만 해도 `width: 0`인 상자가 만들어진다. 그런 상자는 **화면에
 *   보이지 않으면서 "한 부분"이라고 적힌다.** 보는 사람은 어디를 가리키는지
 *   찾다가 못 찾는다. 1%는 되어야 눈에 보인다.
 *
 * 왜 그림 밖으로 나가지 못하게 하는가
 *   `x + width`가 1을 넘으면 그림 바깥을 가리킨다. 끌다가 칸 밖으로 나가면
 *   그런 값이 만들어지는데, 화면 쪽에서 가두더라도 **마지막 보장은 여기다.**
 */
export const IMAGE_REGION_KIND = "image-region";

/** 상대값 한 칸. 0과 1 사이다. */
const ratio = z.number().min(0).max(1);

/** 눈에 보이는 가장 작은 크기. 이보다 작으면 가리키는 것이 없다. */
export const MIN_REGION_SIZE = 0.01;

export const imageRegionLocatorSchema = z
  .object({
    kind: z.literal(IMAGE_REGION_KIND),
    sourceFileId: z.uuid(),
    fileChecksum: z.string().max(128).nullable(),

    /** 왼쪽에서 얼마나. 그림 너비를 1로 본다. */
    x: ratio,
    /** 위에서 얼마나. 그림 높이를 1로 본다. */
    y: ratio,
    width: ratio.min(MIN_REGION_SIZE, "고른 영역이 너무 작습니다."),
    height: ratio.min(MIN_REGION_SIZE, "고른 영역이 너무 작습니다."),
  })
  .refine((value) => value.x + value.width <= 1, {
    message: "고른 영역이 그림 오른쪽을 넘어갑니다.",
  })
  .refine((value) => value.y + value.height <= 1, {
    message: "고른 영역이 그림 아래쪽을 넘어갑니다.",
  });

export type ImageRegionLocator = z.infer<typeof imageRegionLocatorSchema>;

/**
 * 이미지에서 온 기록의 자리. 장 전체와 한 부분, 둘이다.
 *
 * **`discriminatedUnion`을 쓰지 않는다.** 영역 쪽에 `refine`을 걸어서
 * 그 갈래가 `ZodEffects`가 되고, `discriminatedUnion`은 그것을 받지 않는다.
 * `union`은 차례로 맞춰 보므로 `kind`가 가리는 일은 그대로 된다.
 */
export const imageLocatorSchema = z.union([
  imagePageLocatorSchema,
  imageRegionLocatorSchema,
]);

export type ImageLocator = z.infer<typeof imageLocatorSchema>;

/**
 * 담긴 값에서 이미지 자리를 읽는다. **모르는 모양은 null이다.**
 *
 * `locator`는 jsonb라 무엇이든 들어갈 수 있다. PDF 기록이나 음악 기록의
 * 자리가 여기로 들어와도 `kind`가 달라 걸러진다.
 */
export function parseImageLocator(value: unknown): ImageLocator | null {
  const parsed = imageLocatorSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * 몇 번째 장인지 세어 사람이 읽을 말로.
 *
 * **번호를 담아두지 않았으므로 지금 목록에서 센다.** 부르는 쪽이 그 자료의
 * 이미지 파일을 **보이는 차례대로** 넘긴다.
 *
 * 목록에 없으면 `null`이다. 파일을 뗐거나 지운 경우다. **`1장`으로 둘러대지
 * 않는다.** 없는 자리를 가리키는 링크가 생기고, 눌러도 다른 장이 열린다.
 */
export function describeImagePage(
  locator: { sourceFileId: string },
  fileIdsInOrder: readonly string[],
): string | null {
  const index = fileIdsInOrder.indexOf(locator.sourceFileId);

  return index === -1 ? null : `${index + 1}장`;
}

/**
 * 장 전체인지 한 부분인지까지 말해 준다. (16-2)
 *
 * **`3장`과 `3장의 한 부분`을 가른다.** 목록에서 그 차이가 보이지 않으면,
 * 상자를 그려 남긴 메모를 눌렀을 때 왜 그림에 상자가 뜨는지 알 수 없다.
 *
 * 세는 일은 `describeImagePage`가 한다. 여기서는 뒤에 말을 붙이기만 한다.
 */
export function describeImageLocator(
  locator: ImageLocator,
  fileIdsInOrder: readonly string[],
): string | null {
  const page = describeImagePage(locator, fileIdsInOrder);

  if (page === null) {
    return null;
  }

  return locator.kind === IMAGE_REGION_KIND ? `${page}의 한 부분` : page;
}

/**
 * 영역을 주소에 실어 보내는 글자. (16-2)
 *
 * **왜 주소에 싣는가.** 기록 목록의 `3장의 한 부분으로`를 누르면 그 장이
 * 열리는데, **어디를 가리키는지 보이지 않으면 누른 뜻이 없다.** 상자를
 * 함께 그려 주려면 그 값이 화면까지 가야 하고, 주소가 그 길이다.
 *
 * 칸을 넷으로 나누지 않고 하나에 담는 까닭은 읽고 쓰는 자리가 한 곳이면
 * 어긋날 자리도 한 곳이어서다. `x,y,너비,높이` 순서다.
 *
 * 소수점을 넷째 자리에서 끊는다. 그림이 1만 픽셀이어도 1픽셀 단위까지
 * 가리킨다. **더 길게 담아도 눈이 구분하지 못한다.**
 */
export function formatRegionParam(region: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  const round = (value: number) => Number(value.toFixed(4));

  return [
    round(region.x),
    round(region.y),
    round(region.width),
    round(region.height),
  ].join(",");
}

/**
 * 주소에 실린 영역을 읽는다. **모르는 모양은 `null`이다.**
 *
 * 주소는 사람이 손으로 고칠 수 있는 자리다. 숫자가 아니거나 0~1을
 * 벗어나거나 너무 작으면 상자를 그리지 않는다. **지어내지 않는다.**
 * 잘못된 상자는 엉뚱한 자리를 가리키고, 보는 사람은 그것이 틀렸다는 것을
 * 알 수 없다.
 */
export function parseRegionParam(
  value: string | null | undefined,
): { x: number; y: number; width: number; height: number } | null {
  if (typeof value !== "string") {
    return null;
  }

  const parts = value.split(",");

  if (parts.length !== 4) {
    return null;
  }

  const numbers = parts.map((part) => Number(part.trim()));

  if (numbers.some((number) => !Number.isFinite(number))) {
    return null;
  }

  const [x, y, width, height] = numbers;

  const inRange = (number: number) => number >= 0 && number <= 1;

  if (![x, y, width, height].every(inRange)) {
    return null;
  }

  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) {
    return null;
  }

  if (x + width > 1 || y + height > 1) {
    return null;
  }

  return { x, y, width, height };
}
