/**
 * 관리자 승인 상태 전이 단위 테스트.
 *
 * 화면은 이 목록으로 버튼을 그리고 서버는 같은 목록으로 요청을 검증한다.
 * 여기가 느슨해지면 화면에 없는 처리가 요청만으로 통과할 수 있다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STATUS_TRANSITIONS,
  getAvailableTransitions,
  isAllowedTransition,
} from "../src/lib/admin/transitions.ts";
import { ACCOUNT_STATUSES } from "../src/lib/auth/status.ts";

test("모든 승인 상태에 전이 목록이 정의되어 있다", () => {
  for (const status of ACCOUNT_STATUSES) {
    assert.ok(
      Array.isArray(STATUS_TRANSITIONS[status]),
      `${status}에 전이 목록이 없다`,
    );
  }
});

test("전이 대상은 모두 알려진 승인 상태다", () => {
  for (const status of ACCOUNT_STATUSES) {
    for (const transition of STATUS_TRANSITIONS[status]) {
      assert.ok(
        ACCOUNT_STATUSES.includes(transition.to),
        `${status} -> ${transition.to}는 알 수 없는 상태다`,
      );
    }
  }
});

test("자기 자신으로 가는 전이는 없다", () => {
  for (const status of ACCOUNT_STATUSES) {
    for (const transition of STATUS_TRANSITIONS[status]) {
      assert.notEqual(
        transition.to,
        status,
        `${status}에 같은 상태로 가는 전이가 있다`,
      );
    }
  }
});

test("승인 대기 상태는 승인과 거절만 가능하다", () => {
  assert.deepEqual(
    getAvailableTransitions("pending").map((transition) => transition.to),
    ["active", "rejected"],
  );
});

test("승인된 사용자는 정지만 가능하다", () => {
  assert.deepEqual(
    getAvailableTransitions("active").map((transition) => transition.to),
    ["suspended"],
  );
});

test("승인된 상태에서 대기로 되돌릴 수 없다", () => {
  // 승인을 취소하려면 정지나 거절이라는 분명한 상태를 써야
  // 감사 기록에서 의도가 드러난다.
  assert.equal(isAllowedTransition("active", "pending"), false);
  assert.equal(isAllowedTransition("rejected", "pending"), false);
  assert.equal(isAllowedTransition("suspended", "pending"), false);
});

test("정지와 거절은 되돌릴 수 있다", () => {
  assert.equal(isAllowedTransition("suspended", "active"), true);
  assert.equal(isAllowedTransition("rejected", "active"), true);
});

test("거절된 사용자를 바로 정지시킬 수 없다", () => {
  assert.equal(isAllowedTransition("rejected", "suspended"), false);
});

test("허용 목록에 없는 조합은 모두 거부한다", () => {
  for (const from of ACCOUNT_STATUSES) {
    const allowed = new Set(
      getAvailableTransitions(from).map((transition) => transition.to),
    );

    for (const to of ACCOUNT_STATUSES) {
      assert.equal(
        isAllowedTransition(from, to),
        allowed.has(to),
        `${from} -> ${to} 판정이 목록과 어긋난다`,
      );
    }
  }
});

test("되돌리기 어려운 처리는 사유 기록을 권한다", () => {
  for (const status of ACCOUNT_STATUSES) {
    for (const transition of STATUS_TRANSITIONS[status]) {
      if (transition.destructive) {
        assert.equal(
          transition.reasonRecommended,
          true,
          `${status} -> ${transition.to}는 사유를 권해야 한다`,
        );
      }
    }
  }
});
