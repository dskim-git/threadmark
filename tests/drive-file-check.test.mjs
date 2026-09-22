/**
 * 파일이 바뀌거나 사라진 것을 판단하는 규칙 단위 검사.
 *
 * 설계 문서 9.2절이 checksum을 비교해 "위치가 달라질 수 있음"을 표시하라고 했다.
 * 이 판단이 지나치면 멀쩡한 기록을 의심하게 만들고, 모자라면 틀어진 기록을
 * 맞다고 믿게 만든다. 둘 다 나쁘지만 뒤쪽이 더 나쁘다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  VERIFY_INTERVAL_MINUTES,
  compareDriveFile,
  describeFileCheck,
  locatorIsStale,
  shouldVerify,
} from "../src/lib/drive/file-check.ts";

function driveFile(overrides = {}) {
  return {
    id: "file-1",
    name: "논문.pdf",
    mimeType: "application/pdf",
    byteSize: 204800,
    checksum: "aaaa",
    modifiedAt: "2026-09-22T01:02:03.000Z",
    parents: ["folder-1"],
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 언제 다시 물어보는가
// -----------------------------------------------------------------------------

test("한 번도 확인한 적이 없으면 물어본다", () => {
  assert.equal(shouldVerify(null, new Date()), true);
});

test("최근에 확인했으면 다시 묻지 않는다", () => {
  // 뷰어를 열 때마다 Drive에 물으면 화면이 그만큼 늦게 뜬다.
  const now = new Date("2026-09-22T12:00:00.000Z");
  const justNow = new Date(now.getTime() - 60 * 1000).toISOString();

  assert.equal(shouldVerify(justNow, now), false);
});

test("정한 시간이 지나면 다시 물어본다", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");
  const longAgo = new Date(
    now.getTime() - (VERIFY_INTERVAL_MINUTES + 1) * 60 * 1000,
  ).toISOString();

  assert.equal(shouldVerify(longAgo, now), true);
});

test("시각을 읽지 못하면 확인한 적 없는 것으로 본다", () => {
  // 모르면 확인하는 쪽으로 기운다. 안 하는 쪽으로 기울면 영영 확인하지 않는다.
  assert.equal(shouldVerify("언제인지 모름", new Date()), true);
});

// -----------------------------------------------------------------------------
// 파일이 바뀌었는가
// -----------------------------------------------------------------------------

test("checksum이 같으면 그대로다", () => {
  const result = compareDriveFile({
    storedChecksum: "aaaa",
    current: driveFile({ checksum: "aaaa" }),
  });

  assert.equal(result.outcome, "unchanged");
});

test("checksum이 다르면 바뀐 것이다", () => {
  const result = compareDriveFile({
    storedChecksum: "aaaa",
    current: driveFile({ checksum: "bbbb" }),
  });

  assert.equal(result.outcome, "changed");
});

test("이름이나 크기가 같아도 checksum이 다르면 바뀐 것이다", () => {
  // 이름을 그대로 두고 내용만 바꿔치기하는 경우가 우리가 잡으려는 것이다.
  const result = compareDriveFile({
    storedChecksum: "aaaa",
    current: driveFile({ checksum: "bbbb", name: "논문.pdf", byteSize: 204800 }),
  });

  assert.equal(result.outcome, "changed");
});

test("checksum을 모르면 바뀌었다고 하지 않는다", () => {
  // Google 문서처럼 바이너리가 아닌 파일에는 값이 없다.
  // 모르는 것을 바뀌었다고 알리면 멀쩡한 기록을 의심하게 된다.
  assert.equal(
    compareDriveFile({
      storedChecksum: null,
      current: driveFile({ checksum: "bbbb" }),
    }).outcome,
    "unchanged",
  );

  assert.equal(
    compareDriveFile({
      storedChecksum: "aaaa",
      current: driveFile({ checksum: null }),
    }).outcome,
    "unchanged",
  );
});

// -----------------------------------------------------------------------------
// 기록의 위치를 믿어도 되는가
// -----------------------------------------------------------------------------

test("기록을 남긴 뒤 파일이 바뀌었으면 알린다", () => {
  assert.equal(
    locatorIsStale({ locatorChecksum: "aaaa", fileChecksum: "bbbb" }),
    true,
  );
});

test("같은 파일이면 알리지 않는다", () => {
  assert.equal(
    locatorIsStale({ locatorChecksum: "aaaa", fileChecksum: "aaaa" }),
    false,
  );
});

test("한쪽이라도 모르면 의심하지 않는다", () => {
  assert.equal(
    locatorIsStale({ locatorChecksum: null, fileChecksum: "bbbb" }),
    false,
  );
  assert.equal(
    locatorIsStale({ locatorChecksum: "aaaa", fileChecksum: null }),
    false,
  );
});

// -----------------------------------------------------------------------------
// 사용자에게 보여줄 문구
// -----------------------------------------------------------------------------

test("멀쩡할 때는 아무 말도 하지 않는다", () => {
  assert.equal(describeFileCheck("unchanged"), null);
});

test("바뀜·사라짐·휴지통·모름을 모두 다르게 알린다", () => {
  // 설계 문서 10.4절: 토큰 만료, 권한 취소, 파일 이동·삭제를 구분해 표시한다.
  // 할 일이 각각 다르므로 문구도 달라야 한다.
  const messages = ["changed", "missing", "trashed", "unknown"].map(
    (outcome) => describeFileCheck(outcome) ?? "",
  );

  assert.equal(new Set(messages).size, messages.length);

  const [changed, missing, trashed, unknown] = messages;

  // 파일이 사라져도 기록은 남는다는 것을 알린다. (10.4절)
  assert.match(missing, /기록은 그대로/);
  assert.match(trashed, /기록은 그대로/);

  // 휴지통은 복원하면 되는 일이다. 다시 올리라고 하면 안 된다.
  assert.match(trashed, /휴지통/);
  assert.match(trashed, /복원/);

  // 확인하지 못한 것을 사라졌다고 말하지 않는다.
  assert.ok(!unknown.includes("찾지 못했습니다"));

  assert.match(changed, /달라졌을 수 있습니다/);
});
