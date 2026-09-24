/**
 * 책 자료의 순수 셈 단위 테스트. (15-E-2a)
 *
 * ISBN 가르기와 읽기 진행 셈은 데이터베이스 없이 확인할 수 있다.
 * 여기서 붙잡지 않으면 화면에서 이상한 숫자를 보고 나서야 알게 된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  looksLikeIsbn,
  normalizeIsbn,
  splitIsbn,
} from "../src/lib/books/isbn.ts";
import {
  HOLDINGS,
  HOLDING_LABELS,
  READING_STATUSES,
  READING_STATUS_LABELS,
  isHolding,
  isReadingStatus,
  readingDays,
  readingProgress,
} from "../src/lib/books/reading.ts";
import {
  readNames,
  readPublishedOn,
  readText,
  readWebUrl,
} from "../src/lib/books/metadata.ts";

// -----------------------------------------------------------------------------
// ISBN
// -----------------------------------------------------------------------------

test("Kakao가 붙여 보내는 두 ISBN을 가른다", () => {
  /*
    Kakao는 열 자리와 열세 자리를 한 칸에 띄어쓰기로 붙여 준다.
    가르지 않으면 isbn13 칸에 스무 글자가 들어가고 저장이 통째로 막힌다.
  */
  assert.deepEqual(splitIsbn("8932917248 9788932917245"), {
    isbn10: "8932917248",
    isbn13: "9788932917245",
  });
});

test("한쪽만 온 것도 제자리에 담는다", () => {
  assert.deepEqual(splitIsbn("9788934972464"), {
    isbn10: null,
    isbn13: "9788934972464",
  });
  assert.deepEqual(splitIsbn("8934972467"), {
    isbn10: "8934972467",
    isbn13: null,
  });
});

test("ISBN이 없는 책도 담을 수 있다", () => {
  for (const value of ["", "   ", null, undefined, 123, {}]) {
    assert.deepEqual(splitIsbn(value), { isbn10: null, isbn13: null });
  }
});

test("모르는 모양은 버린다", () => {
  // 자리에 맞지 않는 값을 담으면 제약조건에 걸려 책 전체가 저장되지 않는다.
  assert.deepEqual(splitIsbn("없음 12345 ABCDEFGHIJ"), {
    isbn10: null,
    isbn13: null,
  });
});

test("하이픈과 공백을 지운다", () => {
  // `978-89-349-7246-4`와 `9788934972464`는 같은 책이다.
  assert.equal(normalizeIsbn("978-89-349-7246-4"), "9788934972464");
  assert.equal(normalizeIsbn(" 8934972467 "), "8934972467");
});

test("열 자리 ISBN의 마지막 X를 받아들인다", () => {
  // 10을 한 글자로 적은 것이다. 빠뜨리면 멀쩡한 ISBN이 버려진다.
  assert.equal(normalizeIsbn("097522980X"), "097522980X");
  assert.equal(normalizeIsbn("097522980x"), "097522980X");
});

test("X는 마지막 자리에만 올 수 있다", () => {
  assert.equal(normalizeIsbn("09752298X0"), null);
  assert.equal(normalizeIsbn("978893497246X"), null);
});

test("자리 수가 맞지 않으면 ISBN이 아니다", () => {
  for (const value of ["123456789", "12345678901", "978893497246", "12345678901234"]) {
    assert.equal(normalizeIsbn(value), null, value);
  }
});

test("적어 넣은 것이 ISBN인지 제목인지 가른다", () => {
  // 찾기 칸 하나로 둘 다 받는다. 어느 칸에 적을지 사용자가 정하지 않는다.
  assert.equal(looksLikeIsbn("9788932917245"), true);
  assert.equal(looksLikeIsbn("978-89-329-1724-5"), true);
  assert.equal(looksLikeIsbn("사피엔스"), false);
  assert.equal(looksLikeIsbn("1984"), false);
});

// -----------------------------------------------------------------------------
// 출판일
// -----------------------------------------------------------------------------

test("출판일에서 시각을 떼어낸다", () => {
  // Kakao는 `2017-03-24T00:00:00.000+09:00`처럼 준다. 책에 시각은 뜻이 없다.
  assert.equal(readPublishedOn("2017-03-24T00:00:00.000+09:00"), "2017-03-24");
  assert.equal(readPublishedOn("2017-03-24"), "2017-03-24");
});

test("못 알아본 출판일은 온 그대로 둔다", () => {
  // 버리는 것보다 적힌 그대로 보여주는 쪽이 낫다. 담는 칸이 글이다.
  assert.equal(readPublishedOn("2017년 3월"), "2017년 3월");
  assert.equal(readPublishedOn(""), null);
  assert.equal(readPublishedOn(null), null);
});

// -----------------------------------------------------------------------------
// 밖에서 온 값 다듬기
// -----------------------------------------------------------------------------

test("빈 글과 없는 값을 같게 본다", () => {
  // `""`를 담아두면 화면이 "적혀 있다"고 보고 빈 줄을 그린다.
  for (const value of ["", "   ", null, undefined, 7, {}, []]) {
    assert.equal(readText(value), null);
  }

  assert.equal(readText("  한길사 "), "한길사");
});

test("이름 목록에서 빈 것과 너무 긴 것을 빼낸다", () => {
  /*
    데이터베이스의 book_names_valid가 같은 규칙을 본다. 여기서 거르지
    않으면 이름 하나 때문에 책 전체가 저장되지 않는다.
  */
  assert.deepEqual(readNames(["유발 하라리", "", "   ", null]), ["유발 하라리"]);
  assert.deepEqual(readNames(["a".repeat(201)]), []);
  assert.deepEqual(readNames(["a".repeat(200)]), ["a".repeat(200)]);
  assert.deepEqual(readNames("유발 하라리"), []);
  assert.deepEqual(readNames(null), []);
});

test("이름이 지나치게 많으면 앞에서 끊는다", () => {
  const many = Array.from({ length: 80 }, (_, index) => `이름${index}`);

  assert.equal(readNames(many).length, 50);
});

test("주소 자리에는 http와 https만 받는다", () => {
  /*
    favicon 자리에 `javascript:`가 오는 일이 실제로 있었다. (15-C)
    이 값이 그대로 화면의 그림 주소로 들어간다.
  */
  assert.equal(readWebUrl("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
  assert.equal(readWebUrl("HTTP://example.com/a.png"), "HTTP://example.com/a.png");

  for (const value of [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "//example.com/a.png",
    "example.com/a.png",
  ]) {
    assert.equal(readWebUrl(value), null, value);
  }
});

test("지나치게 긴 주소는 받지 않는다", () => {
  assert.equal(readWebUrl(`https://example.com/${"a".repeat(2000)}`), null);
});

// -----------------------------------------------------------------------------
// 읽기 상태
// -----------------------------------------------------------------------------

test("읽기 상태와 소장 형태 값이 데이터베이스 열거형과 같다", () => {
  assert.deepEqual([...READING_STATUSES], ["unread", "reading", "finished"]);
  assert.deepEqual([...HOLDINGS], ["paper", "ebook", "borrowed"]);
});

test("값마다 화면에 보일 이름이 있다", () => {
  // 빠뜨리면 화면에 `undefined`가 나온다.
  for (const status of READING_STATUSES) {
    assert.ok(READING_STATUS_LABELS[status]?.length > 0, status);
  }

  for (const holding of HOLDINGS) {
    assert.ok(HOLDING_LABELS[holding]?.length > 0, holding);
  }
});

test("모르는 값을 상태로 받아들이지 않는다", () => {
  for (const value of ["", "READING", "읽는 중", null, 1, {}]) {
    assert.equal(isReadingStatus(value), false);
    assert.equal(isHolding(value), false);
  }
});

// -----------------------------------------------------------------------------
// 진행률
// -----------------------------------------------------------------------------

test("읽은 쪽과 전체 쪽수로 진행률을 센다", () => {
  assert.equal(readingProgress(0, 300), 0);
  assert.equal(readingProgress(150, 300), 50);
  assert.equal(readingProgress(300, 300), 100);
  assert.equal(readingProgress(100, 300), 33);
});

test("셀 수 없으면 0이 아니라 모른다고 한다", () => {
  /*
    0%는 "펴지도 않았다"이고 null은 "모른다"다. 둘을 같게 만들면 전체
    쪽수를 안 적은 책이 전부 시작도 안 한 것처럼 보인다.
  */
  assert.equal(readingProgress(null, 300), null);
  assert.equal(readingProgress(50, null), null);
  assert.equal(readingProgress(null, null), null);
});

test("전체 쪽수가 0이면 나누지 않는다", () => {
  // 담을 수는 있는 값이다(0 이상). 나누면 Infinity가 막대 너비로 들어간다.
  assert.equal(readingProgress(0, 0), null);
  assert.equal(readingProgress(10, 0), null);
});

test("진행률이 100을 넘지 않는다", () => {
  // 데이터베이스가 막지만 화면이 그것에만 기대지 않는다.
  assert.equal(readingProgress(400, 300), 100);
});

// -----------------------------------------------------------------------------
// 읽은 날수
// -----------------------------------------------------------------------------

test("하루에 다 읽으면 1일이다", () => {
  // 0일은 "안 읽었다"로 읽힌다. 시작한 날과 끝낸 날을 모두 센다.
  assert.equal(readingDays("2026-09-24", "2026-09-24"), 1);
});

test("걸린 날수를 센다", () => {
  assert.equal(readingDays("2026-09-01", "2026-09-10"), 10);
  // 달을 넘어가도 센다.
  assert.equal(readingDays("2026-08-30", "2026-09-02"), 4);
});

test("날짜가 모자라거나 거꾸로면 세지 않는다", () => {
  assert.equal(readingDays(null, "2026-09-10"), null);
  assert.equal(readingDays("2026-09-10", null), null);
  assert.equal(readingDays("2026-09-10", "2026-09-01"), null);
  assert.equal(readingDays("어제", "2026-09-01"), null);
});
