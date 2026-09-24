/**
 * 태그 이름을 다듬고 같은 태그인지 판정한다. (설계 문서 20-1절)
 *
 * 태그는 사용자가 손으로 치는 값이다. 고정 목록이 없다. (13.5절)
 * 그래서 같은 것을 뜻하는 글자가 여러 모양으로 들어온다.
 *
 *   "AI 융합수업"  "ai 융합수업"  " AI  융합수업 "
 *
 * 이것이 셋으로 쌓이면 태그 목록이 금세 못 쓰게 된다. 고르는 줄에 비슷한
 * 것이 셋 있으면 어느 것을 눌러야 할지 알 수 없고, 하나를 누르면 나머지
 * 둘에 달아둔 것이 안 보인다. **태그를 다는 이유가 사라진다.**
 *
 * 그래서 값을 둘로 나눠 담는다.
 *
 *   name  사람이 보는 그대로. 처음 친 모양을 지킨다.
 *   slug  같은 태그인지 판정하는 값. 이것에 unique를 건다.
 *
 * 보이는 것을 바꾸지 않으면서 겹치는 것만 막는 방법이다. `AI`를 쳤는데
 * 화면에 `ai`로 나오면 내가 친 것이 아닌 것 같아진다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 * 다듬는 규칙은 데이터베이스 제약조건과 같아야 한다.
 * (tests/tags-name.test.mjs가 마이그레이션과 맞대어 본다)
 */

/** 태그 하나의 길이 상한. 데이터베이스 제약조건과 같다. */
export const MAX_TAG_LENGTH = 40;

/** 한 자료나 기록에 달 수 있는 태그 수. */
export const MAX_TAGS_PER_ITEM = 20;

/** 여러 개를 한 번에 칠 때의 구분자. 화면 안내도 이 글자를 말한다. */
export const TAG_SEPARATOR = ",";

/**
 * 사람이 보는 이름으로 다듬는다.
 *
 *   - 유니코드 모양을 하나로 맞춘다(NFC). 한글은 자모를 따로 담는 방법과
 *     글자로 합쳐 담는 방법이 있는데, 눈에는 똑같고 글자로는 다르다.
 *     맥에서 복사한 글이 그렇게 들어온다.
 *   - 앞뒤 공백을 떼고, 가운데 이어진 공백은 하나로 줄인다.
 *   - 줄바꿈과 탭도 공백으로 본다. 붙여넣기로 들어온다.
 *
 * 대소문자는 **건드리지 않는다.** 보이는 것은 친 그대로여야 한다.
 */
export function toTagName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * 같은 태그인지 판정하는 값.
 *
 * 다듬은 이름을 소문자로 내린 것이다. 한글에는 대소문자가 없으므로
 * 실제로는 영문에만 영향을 준다. `AI`와 `ai`를 하나로 본다.
 *
 * 그 이상은 하지 않는다. 공백을 빼거나 붙임표를 지우면 `수업 준비`와
 * `수업준비`가 하나가 되는데, 사용자가 다르게 쓸 뜻이었을 수 있다.
 * 눈에 같아 보이는 것만 같다고 본다.
 */
export function toTagSlug(value: unknown): string {
  return toTagName(value).toLocaleLowerCase("en");
}

/** 쓸 수 있는 이름인지. 길이와 구분자를 본다. */
export function isUsableTagName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_TAG_LENGTH &&
    !name.includes(TAG_SEPARATOR)
  );
}

/**
 * 한 줄에 쉼표로 이어 친 것을 태그 목록으로 바꾼다.
 *
 * 쉼표로 가르는 이유는 태그 이름에 공백이 들어가기 때문이다. (`수업 준비`)
 * 공백으로 가르면 그 이름을 칠 방법이 없어진다.
 *
 * 같은 것이 여러 번 들어오면 **처음 친 모양을 남기고** 나머지를 버린다.
 * 나중 것을 남기면 목록의 순서가 친 순서와 어긋난다.
 *
 * 쓸 수 없는 것은 조용히 버린다. 쉼표만 친 빈칸이나 너무 긴 것이다.
 * 여기서 막으면 나머지 멀쩡한 태그까지 달리지 않는다.
 */
export function parseTagInput(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const names: string[] = [];

  for (const piece of value.split(TAG_SEPARATOR)) {
    const name = toTagName(piece);

    if (!isUsableTagName(name)) {
      continue;
    }

    const slug = toTagSlug(name);

    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    names.push(name);

    if (names.length >= MAX_TAGS_PER_ITEM) {
      break;
    }
  }

  return names;
}
