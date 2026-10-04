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

/** 이미지에서 온 기록의 자리. 지금은 한 갈래뿐이다. */
export const imageLocatorSchema = z.discriminatedUnion("kind", [
  imagePageLocatorSchema,
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
