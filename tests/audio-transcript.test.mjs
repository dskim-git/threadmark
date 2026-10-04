/**
 * 전사문과 녹음 정보 판단의 단위 검사. (17-V 4차례, 2026-10-04)
 *
 * 여기서 틀리면 조용하다.
 *
 *   길이를 정수로 안 만들면   데이터베이스가 거부해 **전사문까지 통째로**
 *                             저장되지 않는다
 *   목소리 범위를 못 읽으면   비어 있는 것으로 담기고, 그 녹음은 영원히
 *                             공개할 수 없게 된다 (17-V.3절)
 *   낡음 판정이 틀리면        멀쩡한 글에 "다른 녹음의 것"이라고 적힌다
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_POSITION_SECONDS } from "../src/lib/media/time.ts";
import {
  MAX_TRANSCRIPT_LENGTH,
  VOICE_SCOPES,
  getVoiceScopeLabel,
  isVoiceScope,
  mayEverBePublic,
  toStoredDuration,
  toStoredTranscript,
  transcriptIsStale,
} from "../src/lib/audio/transcript.ts";

// -----------------------------------------------------------------------------
// 누구의 목소리인가
// -----------------------------------------------------------------------------

test("정해둔 두 값만 받는다", () => {
  for (const scope of VOICE_SCOPES) {
    assert.ok(isVoiceScope(scope), `${scope}를 못 알아본다`);
  }

  for (const value of ["", "unknown", "self", null, undefined, 1]) {
    assert.ok(!isVoiceScope(value), `${String(value)}가 통과했다`);
  }
});

test("밝히지 않은 것에는 아무 말도 적지 않는다", () => {
  /*
    `안 밝힘`이라고 적으면 정해야 할 일처럼 보인다. 혼자 쓰는 녹음에는
    이 구분이 쓸모없을 수 있다. 장소의 가봤나 칸이 같은 판단을 했다.
  */
  assert.equal(getVoiceScopeLabel(null), null);
  assert.equal(getVoiceScopeLabel(""), null);
  assert.equal(getVoiceScopeLabel("몰라요"), null);

  assert.equal(getVoiceScopeLabel("self_only"), "내 목소리만");
});

test("모르는 녹음은 공개할 수 없다", () => {
  /*
    **모르면 거부한다.** (보안 원칙 7) 지금은 전사문이 통째로 공개되지
    않아 아무 데도 쓰이지 않지만, 공개를 열 때 이 판단이 한 곳에 있어야
    한다. 화면마다 적으면 한 곳만 고쳐진다.
  */
  assert.equal(mayEverBePublic("self_only"), true);
  assert.equal(mayEverBePublic("others_included"), false);
  assert.equal(mayEverBePublic(null), false);
  assert.equal(mayEverBePublic(undefined), false);
  assert.equal(mayEverBePublic(""), false);
});

// -----------------------------------------------------------------------------
// 길이
// -----------------------------------------------------------------------------

test("브라우저가 준 소수를 정수로 내린다", () => {
  /*
    **이것이 이 모듈에서 가장 값진 자리다.** 칸이 정수라 소수를 그대로
    보내면 데이터베이스가 거부하고, 그러면 한 시간 적은 전사문까지 함께
    저장되지 않는다.
  */
  assert.deepEqual(toStoredDuration(187.432), { ok: true, seconds: 187 });
  assert.deepEqual(toStoredDuration("187.9"), { ok: true, seconds: 187 });
  assert.deepEqual(toStoredDuration(187), { ok: true, seconds: 187 });
});

test("아주 짧은 녹음은 0초로 담는다", () => {
  // 실수로 눌렀다 뗀 녹음이 생긴다. 그것에도 메모를 달 수 있어야 한다.
  assert.deepEqual(toStoredDuration(0.4), { ok: true, seconds: 0 });
  assert.deepEqual(toStoredDuration(0), { ok: true, seconds: 0 });
});

test("길이를 모르면 비워 둔다", () => {
  /*
    어떤 형식은 끝까지 받기 전에는 길이를 모르고 `Infinity`가 온다.
    **0으로 적으면 "길이 0인 녹음"이라는 거짓말이 담긴다.**
  */
  for (const value of [null, undefined, "", Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.deepEqual(
      toStoredDuration(value),
      { ok: true, seconds: null },
      `${String(value)}에서 비우지 않았다`,
    );
  }
});

test("말이 안 되는 길이는 거부한다", () => {
  assert.equal(toStoredDuration(-1).ok, false);
  assert.equal(toStoredDuration(MAX_POSITION_SECONDS + 1).ok, false);

  // 경계는 받는다. 막는 것만 보면 과잉 차단을 놓친다. (보안 원칙 6)
  assert.deepEqual(toStoredDuration(MAX_POSITION_SECONDS), {
    ok: true,
    seconds: MAX_POSITION_SECONDS,
  });
});

// -----------------------------------------------------------------------------
// 전사문
// -----------------------------------------------------------------------------

test("빈 글은 null로 담는다", () => {
  /*
    빈 글자와 null이 섞이면 "적었는데 비운 것"과 "아직 안 적은 것"을
    가릴 수 없다. 마이그레이션의 제약도 null을 기준으로 본다.
  */
  for (const value of ["", "   ", "\n\n", null, undefined]) {
    assert.deepEqual(
      toStoredTranscript(value),
      { ok: true, transcript: null },
      `${JSON.stringify(value)}에서 null로 담지 않았다`,
    );
  }
});

test("가운데 줄바꿈과 들여쓰기를 건드리지 않는다", () => {
  /*
    **말을 옮긴 글에는 단락이 뜻을 가진다.** 누가 말했는지를 줄 앞에 적는
    일이 흔하다. 공백을 뭉개면 그것이 한 덩어리가 된다.
  */
  const written = "  선생님: 안녕하세요\n\n  학생: 네\n";

  assert.deepEqual(toStoredTranscript(written), {
    ok: true,
    transcript: "선생님: 안녕하세요\n\n  학생: 네",
  });
});

test("길이 한계를 넘으면 거부한다", () => {
  assert.equal(toStoredTranscript("가".repeat(MAX_TRANSCRIPT_LENGTH)).ok, true);
  assert.equal(
    toStoredTranscript("가".repeat(MAX_TRANSCRIPT_LENGTH + 1)).ok,
    false,
  );
});

test("전사문 한계가 기록보다 넉넉하다", () => {
  /*
    `captures`의 2만 자로는 15분쯤이면 찬다. 한 시간짜리 강의를 옮기면
    수만 자가 된다. 이 숫자를 줄이려면 그 계산을 다시 한다.
  */
  assert.equal(MAX_TRANSCRIPT_LENGTH, 100000);
});

test("글이 아닌 것은 거부한다", () => {
  assert.equal(toStoredTranscript(123).ok, false);
  assert.equal(toStoredTranscript({}).ok, false);
});

// -----------------------------------------------------------------------------
// 파일이 바뀌었는가
// -----------------------------------------------------------------------------

test("checksum이 다르면 낡았다고 말한다", () => {
  assert.equal(
    transcriptIsStale({ storedChecksum: "aaa", fileChecksum: "bbb" }),
    true,
  );
});

test("같으면 낡지 않았다", () => {
  assert.equal(
    transcriptIsStale({ storedChecksum: "aaa", fileChecksum: "aaa" }),
    false,
  );
});

test("모르면 낡았다고 말하지 않는다", () => {
  /*
    **모르는 것을 아는 척하지 않는다.** Drive가 md5를 주지 않는 파일이
    있고, 전사문을 적을 때 파일이 떨어져 있었을 수도 있다.

    여기서는 거부가 아니라 침묵이 맞다. **틀린 경고는 사람이 멀쩡한 글을
    지우게 만든다.** 보안 판단이 아니라 알림이라 방향이 반대다.
  */
  assert.equal(
    transcriptIsStale({ storedChecksum: null, fileChecksum: "bbb" }),
    false,
  );
  assert.equal(
    transcriptIsStale({ storedChecksum: "aaa", fileChecksum: null }),
    false,
  );
  assert.equal(
    transcriptIsStale({ storedChecksum: null, fileChecksum: null }),
    false,
  );
});
