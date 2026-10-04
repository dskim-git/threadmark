/**
 * 음성 기록의 자리 단위 검사. (설계 문서 17-4절, 2026-10-04)
 *
 * 여기서 틀리면 **조용하다.** 오류가 나지 않고 가리키는 자리만 달라진다.
 * 기록을 눌러 들어가면 엉뚱한 대목에서 재생이 시작되고, 보는 사람은 그것이
 * 틀렸다는 것을 알 수 없다. 16-2에서 그림 상자가 같은 자리였다.
 *
 * **담길 때와 주소에서 읽힐 때 같은 규칙을 쓴다.** 한쪽만 느슨하면 그 길로
 * 들어온다. 그래서 두 자리를 나란히 확인한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_POSITION_SECONDS } from "../src/lib/media/time.ts";
import {
  AUDIO_TIME_KIND,
  MIN_AUDIO_RANGE_SECONDS,
  audioTimeLocatorSchema,
  describeAudioTime,
  formatAudioTimeParam,
  isAudioRange,
  parseAudioTimeLocator,
  parseAudioTimeParam,
} from "../src/lib/captures/audio-locator.ts";

const FILE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function locator(overrides = {}) {
  return {
    kind: AUDIO_TIME_KIND,
    sourceFileId: FILE_ID,
    fileChecksum: "d41d8cd98f00b204e9800998ecf8427e",
    startSeconds: 200,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 담길 때
// -----------------------------------------------------------------------------

test("시점만 있는 자리를 받는다", () => {
  const parsed = parseAudioTimeLocator(locator());

  assert.equal(parsed?.startSeconds, 200);
  assert.ok(!isAudioRange(parsed));
});

test("구간이 있는 자리를 받는다", () => {
  const parsed = parseAudioTimeLocator(locator({ endSeconds: 250 }));

  assert.equal(parsed?.endSeconds, 250);
  assert.ok(isAudioRange(parsed));
});

test("어느 파일인지 없으면 받지 않는다", () => {
  /*
    **파일 번호가 없으면 되짚어 갈 수 없다.** 한 자료에 녹음이 둘 붙어
    있으면 어느 쪽의 3분 20초인지 알 수 없다.
  */
  assert.equal(parseAudioTimeLocator(locator({ sourceFileId: undefined })), null);
  assert.equal(parseAudioTimeLocator(locator({ sourceFileId: "열기" })), null);
});

test("checksum 칸은 비어 있어도 받는다", () => {
  // 바이너리가 아닌 파일에는 Drive가 md5를 주지 않는다.
  assert.ok(parseAudioTimeLocator(locator({ fileChecksum: null })) !== null);
});

test("거꾸로 된 구간을 받지 않는다", () => {
  /*
    그대로 그리면 `04:10–03:20`이 된다. 화면에서 막지만 예전 값이나 다른
    길로 들어온 값이 있을 수 있다. (음악 쪽에서 같은 자리를 막아 두었다)
  */
  assert.equal(
    parseAudioTimeLocator(locator({ startSeconds: 250, endSeconds: 200 })),
    null,
  );
});

test("길이가 없는 구간을 받지 않는다", () => {
  /*
    **16-2의 `크기 0인 상자`와 같은 자리다.** `03:20–03:20`은 구간이라고
    적혀 있으면서 아무 길이도 없고, 반복을 걸면 제자리걸음을 한다.
    같은 자리를 찍었다면 그것은 시점이다.
  */
  assert.equal(
    parseAudioTimeLocator(locator({ startSeconds: 200, endSeconds: 200 })),
    null,
  );

  assert.equal(
    parseAudioTimeLocator(locator({ startSeconds: 200, endSeconds: 200.5 })),
    null,
  );
});

test("가장 짧은 구간은 받는다", () => {
  // 막는 것만 보면 과하게 잠근 것을 놓친다. (보안 원칙 6)
  assert.ok(
    parseAudioTimeLocator(
      locator({ startSeconds: 200, endSeconds: 200 + MIN_AUDIO_RANGE_SECONDS }),
    ) !== null,
  );
});

test("음수와 소수와 터무니없는 값을 받지 않는다", () => {
  for (const startSeconds of [-1, 1.5, MAX_POSITION_SECONDS + 1, "200"]) {
    assert.equal(
      parseAudioTimeLocator(locator({ startSeconds })),
      null,
      `${startSeconds}가 통과했다`,
    );
  }
});

test("다른 갈래의 자리를 음성으로 읽지 않습니다", () => {
  /*
    `locator`는 jsonb라 무엇이든 들어간다. 모양이 비슷한 음악 기록이
    특히 위험하다. **`kind`가 가린다.**
  */
  assert.equal(
    parseAudioTimeLocator({ kind: "music-time", startSeconds: 200 }),
    null,
  );
  assert.equal(
    parseAudioTimeLocator({
      kind: "image-page",
      sourceFileId: FILE_ID,
      fileChecksum: null,
    }),
    null,
  );
  assert.equal(parseAudioTimeLocator({}), null);
  assert.equal(parseAudioTimeLocator(null), null);
});

test("쓰는 쪽과 읽는 쪽이 같은 모양을 쓴다", () => {
  // 스키마로 직접 넣어 본다. 두 길이 어긋나면 담은 것을 못 읽는다.
  const made = audioTimeLocatorSchema.parse(locator({ endSeconds: 250 }));

  assert.deepEqual(parseAudioTimeLocator(made), made);
});

// -----------------------------------------------------------------------------
// 사람이 읽을 말
// -----------------------------------------------------------------------------

test("시점은 한 자리로 적는다", () => {
  assert.equal(describeAudioTime(parseAudioTimeLocator(locator())), "03:20");
});

test("구간은 두 자리를 이어 적는다", () => {
  assert.equal(
    describeAudioTime(parseAudioTimeLocator(locator({ endSeconds: 250 }))),
    "03:20–04:10",
  );
});

test("한 시간이 넘으면 시간 칸이 붙는다", () => {
  // `media/time.ts`가 하는 일이다. 녹음도 같은 규칙을 쓴다.
  assert.equal(
    describeAudioTime(parseAudioTimeLocator(locator({ startSeconds: 3750 }))),
    "1:02:30",
  );
});

// -----------------------------------------------------------------------------
// 주소에 싣고 읽기
// -----------------------------------------------------------------------------

test("시점과 구간을 주소에 싣는다", () => {
  assert.equal(formatAudioTimeParam({ startSeconds: 200 }), "200");
  assert.equal(
    formatAudioTimeParam({ startSeconds: 200, endSeconds: 250 }),
    "200-250",
  );
});

test("실은 것을 그대로 읽는다", () => {
  /*
    **이 검사가 두 자리를 잇는다.** 싣는 쪽과 읽는 쪽이 어긋나면 기록을
    눌러 들어가도 그 자리로 가지 않고, 오류는 나지 않는다.
  */
  for (const value of [
    { startSeconds: 0, endSeconds: null },
    { startSeconds: 200, endSeconds: null },
    { startSeconds: 200, endSeconds: 250 },
    { startSeconds: 3750, endSeconds: 3800 },
  ]) {
    assert.deepEqual(
      parseAudioTimeParam(formatAudioTimeParam(value)),
      value,
      `${JSON.stringify(value)}가 돌아오지 않는다`,
    );
  }
});

test("주소에서도 담길 때와 같은 규칙으로 막는다", () => {
  /*
    **한쪽만 느슨하면 그 길로 들어온다.** 주소는 사람이 손으로 고칠 수 있는
    자리다. 16-2에서 같은 생각으로 두 곳을 같은 규칙으로 묶었다.
  */
  const rejected = [
    "200-200", // 길이가 없는 구간
    "250-200", // 거꾸로
    "200-200.5", // 소수
    "-5", // 음수
    "3.5", // 소수
    "1e3", // 지수
    "abc",
    "200-250-300", // 칸이 셋
    "",
    "   ",
    `${MAX_POSITION_SECONDS + 1}`,
    `200-${MAX_POSITION_SECONDS + 1}`,
  ];

  for (const value of rejected) {
    assert.equal(
      parseAudioTimeParam(value),
      null,
      `주소값 \`${value}\`가 통과했다`,
    );
  }

  assert.equal(parseAudioTimeParam(null), null);
  assert.equal(parseAudioTimeParam(undefined), null);
});

test("0초를 받는다", () => {
  /*
    **막는 쪽만 보면 과잉 차단을 놓친다.** (보안 원칙 6) `0`은 빈 값처럼
    보여서 걸러버리기 쉬운데, 녹음 맨 앞에 메모를 남기는 일은 흔하다.
  */
  assert.deepEqual(parseAudioTimeParam("0"), {
    startSeconds: 0,
    endSeconds: null,
  });

  assert.deepEqual(parseAudioTimeParam("0-5"), {
    startSeconds: 0,
    endSeconds: 5,
  });
});
