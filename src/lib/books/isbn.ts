/**
 * ISBN 다루기. (15-E-2a, 설계 문서 12절)
 *
 * **열 자리와 열세 자리를 따로 담는다.** 서점마다 요구하는 것이 다르고,
 * 한 칸에 몰아넣으면 어느 쪽인지 되묻게 된다.
 *
 * Kakao는 둘을 **한 칸에 띄어쓰기로 붙여서** 준다.
 *
 *   "8932917248 9788932917245"   둘 다 있는 책
 *   "9788934972464"              열세 자리만 있는 책
 *   ""                           둘 다 없는 책
 *
 * 받는 쪽에서 가르지 않으면 `isbn13` 칸에 스무 글자가 들어간다.
 *
 * **하이픈을 지운다.** `978-89-349-7246-4`와 `9788934972464`는 같은 책인데
 * 글자로는 다르다. 지우지 않으면 같은 책이 둘로 보이고, ISBN으로 찾는 일이
 * 되지 않는다. 사람에게 보여줄 때만 필요하면 다시 끼운다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

export type Isbn = {
  isbn10: string | null;
  isbn13: string | null;
};

/**
 * 한 덩어리로 온 ISBN을 열 자리와 열세 자리로 가른다.
 *
 * 모르는 모양은 **버린다.** 자리에 맞지 않는 값을 담아두면 데이터베이스의
 * 제약조건에 걸려 책 자체를 저장하지 못한다. ISBN이 없다고 책을 담지
 * 못하게 만들 이유가 없다.
 */
export function splitIsbn(value: unknown): Isbn {
  if (typeof value !== "string") {
    return { isbn10: null, isbn13: null };
  }

  const found: Isbn = { isbn10: null, isbn13: null };

  for (const piece of value.split(/\s+/u)) {
    const normalized = normalizeIsbn(piece);

    if (!normalized) {
      continue;
    }

    if (normalized.length === 10) {
      found.isbn10 ??= normalized;
    } else {
      found.isbn13 ??= normalized;
    }
  }

  return found;
}

/**
 * 하나의 ISBN을 담을 수 있는 모양으로 고른다. 아니면 `null`이다.
 *
 * 하이픈과 공백을 지우고 대문자로 맞춘 뒤, 열 자리나 열세 자리인지 본다.
 * **열 자리의 마지막은 숫자 대신 `X`일 수 있다.** 10을 한 글자로 적은
 * 것인데, 이것을 빠뜨리면 멀쩡한 ISBN이 버려진다.
 *
 * 체크 숫자가 맞는지까지는 보지 않는다. 우리가 할 일은 **담을 수 있는
 * 모양인지**를 가리는 것이고, 맞는 책인지는 사용자가 화면에서 본다.
 * 여기서 더 깐깐하게 굴면 절판된 옛 책처럼 표기가 어긋난 것을 못 담는다.
 */
export function normalizeIsbn(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[\s-]/gu, "").toUpperCase();

  if (/^[0-9]{9}[0-9X]$/u.test(cleaned)) {
    return cleaned;
  }

  if (/^[0-9]{13}$/u.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * 적어 넣은 글자가 ISBN으로 찾을 값인지 본다.
 *
 * 찾기 칸 하나로 제목과 ISBN을 모두 받는다. 칸을 둘로 나누면 "어느 칸에
 * 적어야 하지"를 사용자가 정해야 하는데, 그 판단을 우리가 할 수 있다.
 * 숫자와 하이픈만으로 된 열/열세 자리면 ISBN이고 아니면 제목이다.
 */
export function looksLikeIsbn(value: string): boolean {
  return normalizeIsbn(value) !== null;
}
