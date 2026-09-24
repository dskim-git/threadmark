/**
 * 밖에서 받아온 책 정보를 다듬는다. (15-E-2a, 설계 문서 12절)
 *
 * **받아온 값은 전부 남이 쓴 글이다.** 모양을 하나하나 확인하고, 아닌 것은
 * 조용히 빼낸다. 하나가 이상해서 책 전체를 못 담게 만들지 않는다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** 검사가 이 규칙만 따로
 * 들여다볼 수 있어야 한다. 여기가 밖에서 온 값이 우리 쪽으로 들어오는
 * 문이고, 문을 검사하려면 문만 떼어 볼 수 있어야 한다.
 * `request-headers.ts`와 `legal/content.ts`가 같은 이유로 그렇게 되어 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 이름 목록에 담을 수 있는 최대 인원. 데이터베이스의 규칙과 같다. */
export const MAX_NAMES = 50;

/** 이름 하나의 최대 길이. 데이터베이스의 규칙과 같다. */
export const MAX_NAME_LENGTH = 200;

/**
 * 글로 쓸 수 있는 값만 남긴다. 비어 있으면 `null`이다.
 *
 * 빈 글과 없는 값을 같게 본다. `""`를 담아두면 화면이 "적혀 있다"고 보고
 * 빈 줄을 그린다.
 */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 출판일을 다듬는다.
 *
 * Kakao는 `2017-03-24T00:00:00.000+09:00`처럼 시각까지 붙여 준다. 책의
 * 출판일에 시각은 뜻이 없고, 그대로 보여주면 읽는 사람에게 잡음이다.
 * 날짜 부분만 남긴다.
 *
 * **못 알아보면 온 그대로 둔다.** 담는 칸이 글이라 버릴 이유가 없고,
 * 버리는 것보다 적힌 그대로 보여주는 쪽이 낫다. 길이만 잘라 담는다.
 */
export function readPublishedOn(value: unknown): string | null {
  const raw = readText(value);

  if (!raw) {
    return null;
  }

  const match = /^(\d{4}-\d{2}-\d{2})/u.exec(raw);

  return match ? match[1] : raw.slice(0, 100);
}

/**
 * 이름 목록을 읽는다.
 *
 * 빈 이름과 지나치게 긴 이름을 빼낸다. 데이터베이스의 `book_names_valid`가
 * 같은 규칙을 본다. **여기서 거르지 않으면 저장할 때 통째로 막힌다.**
 * 이름 하나 때문에 책을 못 담는 일이 생긴다.
 */
export function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((name) => readText(name))
    .filter(
      (name): name is string => name !== null && name.length <= MAX_NAME_LENGTH,
    )
    .slice(0, MAX_NAMES);
}

/**
 * 주소 자리에는 http와 https만 받는다.
 *
 * 받아온 값에 `javascript:`나 `data:`가 오는 일이 **실제로 있다.** 15-C에서
 * favicon 자리에서 겪었다. 이 값이 그대로 화면의 그림 주소나 링크로 들어간다.
 * 화면·서버·데이터베이스 세 곳에서 모두 본다.
 *
 * 앞뒤 공백을 지운 뒤에 본다. ` javascript:...`처럼 한 칸 띄워 보내는 것이
 * 오래된 우회 수법이다.
 */
export function readWebUrl(value: unknown): string | null {
  const raw = readText(value);

  if (!raw || raw.length > 2000) {
    return null;
  }

  return /^https?:\/\//iu.test(raw) ? raw : null;
}
