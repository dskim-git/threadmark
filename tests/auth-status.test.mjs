/**
 * 가입 승인 상태 판정 단위 테스트.
 *
 * canAccessProtectedArea가 잘못되면 승인받지 않은 계정이 앱 영역에 들어간다.
 * 통과시켜야 할 것과 막아야 할 것을 양쪽 다 명시적으로 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_STATUSES,
  canAccessProtectedArea,
  getStatusNotice,
  isAccountStatus,
} from "../src/lib/auth/status.ts";

test("승인 상태 목록은 데이터베이스 열거형과 같다", () => {
  assert.deepEqual(
    [...ACCOUNT_STATUSES],
    ["pending", "active", "rejected", "suspended"],
  );
});

test("active만 보호된 앱 영역에 접근할 수 있다", () => {
  assert.equal(canAccessProtectedArea("active"), true);

  for (const status of ["pending", "rejected", "suspended"]) {
    assert.equal(
      canAccessProtectedArea(status),
      false,
      `${status}는 차단되어야 한다`,
    );
  }
});

test("상태를 알 수 없으면 접근을 허용하지 않는다", () => {
  // 프로필 조회 실패, 행 없음, 스키마 변경 등으로 값이 비어 있을 수 있다.
  // 그런 상황을 승인으로 해석하면 안 된다.
  const unknown = [
    null,
    undefined,
    "",
    "ACTIVE",
    "Active",
    " active",
    "active ",
    "admin",
    true,
    1,
    {},
    ["active"],
  ];

  for (const value of unknown) {
    assert.equal(
      canAccessProtectedArea(value),
      false,
      `${JSON.stringify(value)}는 차단되어야 한다`,
    );
  }
});

test("isAccountStatus는 알려진 값만 인정한다", () => {
  for (const status of ACCOUNT_STATUSES) {
    assert.equal(isAccountStatus(status), true);
  }

  for (const value of [null, undefined, "", "banned", "ACTIVE", 0, {}]) {
    assert.equal(
      isAccountStatus(value),
      false,
      `${JSON.stringify(value)}는 승인 상태가 아니다`,
    );
  }
});

test("모든 상태에 안내 문구가 있다", () => {
  for (const status of ACCOUNT_STATUSES) {
    const notice = getStatusNotice(status);

    assert.ok(notice.title.length > 0, `${status}에 제목이 없다`);
    assert.ok(notice.description.length > 0, `${status}에 설명이 없다`);
    assert.equal(typeof notice.needsContact, "boolean");
  }
});

test("거절과 정지 상태는 문의 안내를 포함한다", () => {
  assert.equal(getStatusNotice("rejected").needsContact, true);
  assert.equal(getStatusNotice("suspended").needsContact, true);
});

test("대기 상태에는 문의 안내를 띄우지 않는다", () => {
  // 정상적인 대기 상황이다. 문의를 유도하면 불필요한 연락이 늘어난다.
  assert.equal(getStatusNotice("pending").needsContact, false);
});

test("알 수 없는 상태에도 안내 문구를 제공한다", () => {
  const notice = getStatusNotice("무언가 잘못된 값");

  assert.ok(notice.title.length > 0);
  assert.ok(notice.description.length > 0);
  assert.equal(notice.needsContact, true);
});
