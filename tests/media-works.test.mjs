/**
 * 영화·드라마 값 다듬기의 단위 검사. (15-E-2c)
 *
 * **밖에서 온 값이 그대로 들어오는 자리다.** 빈 글자, 0, 없는 날짜가
 * 실제로 온다. 그대로 넘기면 데이터베이스가 받지 못해 **작품 정보 전체가
 * 저장되지 않는다.** 날짜 하나, 길이 하나 때문에 나머지를 잃는다.
 *
 * 그 실패가 화면에는 "저장하지 못했습니다" 한 줄로만 보여서, 어느 값이
 * 문제였는지 알 수 없다. 여기서 붙잡는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CAST_LIMIT,
  MAX_RUNTIME_MINUTES,
  cleanNames,
  formatRuntime,
  getMediaKindLabel,
  isMediaKind,
  normalizeReleaseDate,
  positiveCount,
  posterUrl,
  releaseYear,
  tmdbUrl,
} from "../src/lib/media/works.ts";

// -----------------------------------------------------------------------------
// 갈래
// -----------------------------------------------------------------------------

test("영화와 드라마만 갈래로 본다", () => {
  assert.equal(isMediaKind("movie"), true);
  assert.equal(isMediaKind("tv"), true);
  assert.equal(isMediaKind("person"), false, "TMDB는 사람도 돌려준다");
  assert.equal(isMediaKind(""), false);
  assert.equal(isMediaKind(null), false);
});

test("갈래 이름을 우리 말로 보여준다", () => {
  assert.equal(getMediaKindLabel("movie"), "영화");
  assert.equal(getMediaKindLabel("tv"), "드라마");
  assert.equal(getMediaKindLabel("person"), "작품", "모르는 값도 무너지지 않는다");
});

// -----------------------------------------------------------------------------
// 개봉일
// -----------------------------------------------------------------------------

test("개봉일을 그대로 읽는다", () => {
  assert.equal(normalizeReleaseDate("1999-10-15"), "1999-10-15");
});

test("빈 개봉일은 비워 둔다", () => {
  /*
    **TMDB가 빈 글자를 준다.** 아직 개봉하지 않았거나 모르는 작품이 그렇다.
    그대로 넘기면 `date` 칸이 받지 못해 작품 정보 전체가 저장되지 않는다.
  */
  assert.equal(normalizeReleaseDate(""), null);
  assert.equal(normalizeReleaseDate("   "), null);
  assert.equal(normalizeReleaseDate(null), null);
  assert.equal(normalizeReleaseDate(undefined), null);
});

test("모양이 다른 날짜는 받지 않는다", () => {
  assert.equal(normalizeReleaseDate("1999"), null);
  assert.equal(normalizeReleaseDate("1999-10"), null);
  assert.equal(normalizeReleaseDate("15/10/1999"), null);
});

test("모양은 맞지만 없는 날은 받지 않는다", () => {
  // `2024-02-31`은 모양이 맞다. 데이터베이스가 거절하는 것은 그다음이다.
  assert.equal(normalizeReleaseDate("2024-02-31"), null);
  assert.equal(normalizeReleaseDate("2024-13-01"), null);
});

test("연도만 뽑는다", () => {
  assert.equal(releaseYear("1999-10-15"), "1999");
  assert.equal(releaseYear(""), null);
});

// -----------------------------------------------------------------------------
// 숫자
// -----------------------------------------------------------------------------

test("0은 모르는 값으로 본다", () => {
  /*
    **TMDB는 모르는 길이를 0으로 준다.** 0을 담으면 화면에 `0분`이 떠서
    사용자는 잘못 담겼다고 생각한다. 데이터베이스도 0을 막고 있어서,
    거르지 않으면 작품 정보 전체가 저장되지 않는다.
  */
  assert.equal(positiveCount(0, MAX_RUNTIME_MINUTES), null);
  assert.equal(positiveCount(139, MAX_RUNTIME_MINUTES), 139);
});

test("음수와 한계를 넘는 값은 받지 않는다", () => {
  assert.equal(positiveCount(-5, MAX_RUNTIME_MINUTES), null);
  assert.equal(positiveCount(99_999, MAX_RUNTIME_MINUTES), null);
  assert.equal(positiveCount(MAX_RUNTIME_MINUTES, MAX_RUNTIME_MINUTES), 1440);
});

test("숫자가 아닌 값은 받지 않는다", () => {
  assert.equal(positiveCount("139", MAX_RUNTIME_MINUTES), null);
  assert.equal(positiveCount(null, MAX_RUNTIME_MINUTES), null);
  assert.equal(positiveCount(Number.NaN, MAX_RUNTIME_MINUTES), null);
});

test("소수는 버림한다", () => {
  assert.equal(positiveCount(48.7, MAX_RUNTIME_MINUTES), 48);
});

// -----------------------------------------------------------------------------
// 길이 보여주기
// -----------------------------------------------------------------------------

test("길이를 읽기 쉬운 모양으로 만든다", () => {
  assert.equal(formatRuntime(139), "2시간 19분");
  assert.equal(formatRuntime(49), "49분");
  assert.equal(formatRuntime(120), "2시간");
});

test("한 시간이 안 되면 시간 칸을 붙이지 않는다", () => {
  // `0시간 49분`은 읽기 어렵다.
  assert.equal(formatRuntime(59), "59분");
  assert.equal(formatRuntime(60), "1시간");
});

// -----------------------------------------------------------------------------
// 이름 목록
// -----------------------------------------------------------------------------

test("이름 목록을 다듬는다", () => {
  assert.deepEqual(
    cleanNames(["에드워드 노튼", "브래드 피트"], CAST_LIMIT),
    ["에드워드 노튼", "브래드 피트"],
  );
});

test("빈 이름을 빼낸다", () => {
  /*
    **빈 글자가 섞이면 화면에 `액션, , 드라마`로 보인다.** 데이터베이스도
    막고 있어서, 거르지 않으면 작품 정보 전체가 저장되지 않는다.
  */
  assert.deepEqual(cleanNames(["액션", "", "  ", "드라마"], 10), [
    "액션",
    "드라마",
  ]);
});

test("같은 이름을 두 번 담지 않는다", () => {
  assert.deepEqual(cleanNames(["드라마", "드라마"], 10), ["드라마"]);
});

test("너무 긴 이름을 빼낸다", () => {
  const long = "가".repeat(201);

  assert.deepEqual(cleanNames(["정상", long], 10), ["정상"]);
});

test("개수를 자른다", () => {
  // 출연진은 수십 명이 온다. 화면이 한 줄로 보여줄 만큼만 담는다.
  const many = Array.from({ length: 40 }, (_, index) => `배우${index}`);

  assert.equal(cleanNames(many, CAST_LIMIT).length, CAST_LIMIT);
});

test("목록이 아니면 빈 목록이다", () => {
  assert.deepEqual(cleanNames(null, 10), []);
  assert.deepEqual(cleanNames("드라마", 10), []);
  assert.deepEqual(cleanNames([1, 2, 3], 10), []);
});

// -----------------------------------------------------------------------------
// 주소
// -----------------------------------------------------------------------------

test("포스터 주소를 만든다", () => {
  assert.equal(
    posterUrl("/abc.jpg"),
    "https://image.tmdb.org/t/p/w500/abc.jpg",
  );
});

test("포스터가 없으면 null이다", () => {
  // 포스터가 없는 작품이 흔하다. 빈 주소를 만들면 깨진 그림이 뜬다.
  assert.equal(posterUrl(null), null);
  assert.equal(posterUrl(""), null);
  assert.equal(posterUrl("abc.jpg"), null, "경로는 / 로 시작한다");
});

test("작품 페이지 주소를 만든다", () => {
  assert.equal(tmdbUrl("movie", 550), "https://www.themoviedb.org/movie/550");
  assert.equal(tmdbUrl("tv", 1396), "https://www.themoviedb.org/tv/1396");
});

test("영화와 드라마의 번호가 겹쳐도 주소가 갈린다", () => {
  /*
    **TMDB는 영화와 드라마가 번호를 따로 센다.** 같은 번호가 둘 다에
    있으므로, 갈래를 함께 넘기지 않으면 엉뚱한 작품으로 간다.
  */
  assert.notEqual(tmdbUrl("movie", 1396), tmdbUrl("tv", 1396));
});
