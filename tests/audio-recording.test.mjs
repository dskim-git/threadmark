/**
 * 브라우저 녹음 판단 단위 검사. (17-V 3차례, 2026-10-04)
 *
 * 여기서 틀리면 **녹음이 통째로 안 올라간다.** 그리고 대개 조용하다.
 *
 *   꼬리 붙은 종류를 그대로 보내면  받는 쪽이 거부한다
 *   기기마다 되는 형식이 달라서    그 기기에서만 안 된다
 *   확장자가 안 붙으면             Drive에서 무엇인지 알 수 없다
 *
 * 가운데 것이 특히 나쁘다. **우리 기기에서는 끝까지 보이지 않는다.**
 * 그래서 기기를 흉내 내는 검사를 쓴다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedUploadMimeType } from "../src/lib/drive/upload.ts";
import { formatPosition } from "../src/lib/media/time.ts";
import * as recording from "../src/lib/audio/recording.ts";
import {
  MAX_RECORDING_SECONDS,
  RECORDING_MIME_CANDIDATES,
  pickRecordingMimeType,
  recordingExtension,
  recordingFileName,
  stripMimeParameters,
} from "../src/lib/audio/recording.ts";

/** 되는 것만 참이라고 답하는 기기를 흉내 낸다. */
function device(supported) {
  return (mimeType) => supported.includes(mimeType);
}

// -----------------------------------------------------------------------------
// 꼬리 떼기
// -----------------------------------------------------------------------------

test("코덱 꼬리를 뗀다", () => {
  /*
    MediaRecorder가 주는 모양이다. 그대로 보내면 받는 쪽이 글자가 다르다고
    거부한다. **녹음이 통째로 안 올라가는 자리다.** (17-V.9절)
  */
  assert.equal(stripMimeParameters("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(stripMimeParameters("audio/ogg;codecs=opus"), "audio/ogg");
  assert.equal(
    stripMimeParameters('audio/mp4;codecs="mp4a.40.2"'),
    "audio/mp4",
  );
});

test("꼬리가 없으면 그대로 둔다", () => {
  for (const mimeType of ["audio/webm", "audio/mp4", "application/pdf"]) {
    assert.equal(stripMimeParameters(mimeType), mimeType);
  }
});

test("꼬리를 뗀 것이 받는 목록에 든다", () => {
  /*
    **이 둘이 이어져야 뜻이 산다.** 꼬리를 떼기만 하고 그 값이 받는 목록에
    없으면 여전히 거부당한다. 두 모듈의 약속을 여기서 견준다.
  */
  for (const mimeType of [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    'audio/mp4;codecs="mp4a.40.2"',
  ]) {
    assert.ok(
      isAllowedUploadMimeType(stripMimeParameters(mimeType)),
      `${mimeType}을 꼬리 떼고도 못 올린다`,
    );
  }
});

test("꼬리를 뗀다고 없는 종류가 생기지는 않는다", () => {
  /*
    **떼는 일이 통과시키는 일이 되면 안 된다.** 소문자로 바꾸거나 공백을
    지우는 것까지 하면 받는 목록에 없는 값이 있는 값처럼 보인다.
  */
  assert.equal(stripMimeParameters("AUDIO/WEBM;codecs=opus"), "AUDIO/WEBM");
  assert.ok(!isAllowedUploadMimeType(stripMimeParameters("audio/wav;x=1")));
  assert.ok(!isAllowedUploadMimeType(stripMimeParameters("video/mp4")));
});

// -----------------------------------------------------------------------------
// 기기마다 형식 고르기
// -----------------------------------------------------------------------------

test("녹음해 볼 형식은 모두 받는 종류다", () => {
  /*
    되는 형식으로 녹음해 놓고 못 올리면 **말한 것을 그 자리에서 잃는다.**
  */
  for (const mimeType of RECORDING_MIME_CANDIDATES) {
    assert.ok(
      isAllowedUploadMimeType(mimeType),
      `${mimeType}으로 녹음하는데 올릴 수 없다`,
    );
  }
});

test("Android Chrome처럼 webm이 되는 기기는 webm을 고른다", () => {
  const picked = pickRecordingMimeType(
    device(["audio/webm", "audio/webm;codecs=opus"]),
  );

  assert.equal(picked?.recorder, "audio/webm;codecs=opus");
  assert.equal(picked?.stored, "audio/webm");
});

test("iOS Safari처럼 mp4만 되는 기기는 mp4를 고른다", () => {
  /*
    **이 검사가 이 차례에서 가장 값지다.** iOS Safari는 webm을 녹음하지
    못한다. 차례를 webm만 두거나 되는지 묻지 않고 webm으로 시작하면
    **그 기기에서만 녹음이 안 되고**, 우리 기기에서는 끝까지 보이지 않는다.
    설계 문서 17절 마지막 줄이 이것을 테스트하라고 적었다.
  */
  const picked = pickRecordingMimeType(device(["audio/mp4"]));

  assert.equal(picked?.recorder, "audio/mp4");
  assert.equal(picked?.stored, "audio/mp4");
});

test("Firefox처럼 ogg만 되는 기기는 ogg를 고른다", () => {
  const picked = pickRecordingMimeType(device(["audio/ogg;codecs=opus"]));

  assert.equal(picked?.recorder, "audio/ogg;codecs=opus");
  assert.equal(picked?.stored, "audio/ogg");
});

test("담는 종류에는 꼬리가 붙지 않는다", () => {
  /*
    녹음기에 건넬 말과 Drive에 적을 종류가 **다른 값**이다. 하나로
    돌려주면 둘 중 하나가 틀린다. 담는 쪽에 꼬리가 붙으면 거부당한다.
  */
  const devices = [
    ["audio/webm", "audio/webm;codecs=opus"],
    ["audio/ogg;codecs=opus"],
    ["audio/mp4"],
    ["audio/webm;codecs=opus", "audio/mp4"],
  ];

  for (const supported of devices) {
    const picked = pickRecordingMimeType(device(supported));

    assert.ok(picked !== null, `${supported.join(",")}에서 못 골랐다`);
    assert.ok(
      !picked.stored.includes(";"),
      `담는 종류에 꼬리가 붙었다: ${picked.stored}`,
    );
    assert.ok(
      isAllowedUploadMimeType(picked.stored),
      `담는 종류를 올릴 수 없다: ${picked.stored}`,
    );
  }
});

test("아무것도 안 되는 기기에서는 고르지 않는다", () => {
  /*
    **모르면 거부한다.** (보안 원칙 7) 되는 것이 없는데 아무거나 골라
    시작하면, 녹음이 되는 척하다가 저장할 때 깨진다.
  */
  assert.equal(pickRecordingMimeType(device([])), null);
  assert.equal(pickRecordingMimeType(device(["audio/wav"])), null);
});

test("받는 목록에 없는 형식은 고르지 않는다", () => {
  // 브라우저가 된다고 해도 우리가 받지 못하면 쓸 수 없다.
  assert.equal(
    pickRecordingMimeType(device(["audio/wav", "audio/flac", "video/webm"])),
    null,
  );
});

// -----------------------------------------------------------------------------
// 파일 이름
// -----------------------------------------------------------------------------

test("종류마다 확장자를 붙인다", () => {
  assert.equal(recordingExtension("audio/webm"), "webm");
  assert.equal(recordingExtension("audio/ogg"), "ogg");
  assert.equal(recordingExtension("audio/mpeg"), "mp3");
});

test("audio/mp4에는 m4a를 붙인다", () => {
  /*
    `mp4`를 붙이면 많은 기기가 **동영상으로 여기고** 영상 재생기로 연다.
    소리만 든 파일에는 `m4a`가 널리 쓰인다.
  */
  assert.equal(recordingExtension("audio/mp4"), "m4a");
  assert.equal(recordingExtension('audio/mp4;codecs="mp4a.40.2"'), "m4a");
});

test("음성이 아닌 종류에는 녹음 확장자가 없다", () => {
  for (const mimeType of ["application/pdf", "image/png", "application/json"]) {
    assert.equal(recordingExtension(mimeType), null);
  }
});

test("받지 않는 종류에는 확장자를 주지 않는다", () => {
  assert.equal(recordingExtension("audio/wav"), null);
  assert.equal(recordingExtension("video/mp4"), null);
  assert.equal(recordingExtension(""), null);
});

test("이름을 적지 않아도 시각으로 이름을 만든다", () => {
  /*
    **말을 끝낸 직후가 이름을 생각하기 가장 나쁜 때다.** 이름 때문에
    저장이 막히면 녹음한 것을 잃을 수 있다. 그림판과 다르게 둔 자리다.
  */
  assert.equal(
    recordingFileName({
      typed: "",
      mimeType: "audio/webm",
      at: new Date(2026, 9, 4, 15, 32),
    }),
    "녹음 2026-10-04 1532.webm",
  );
});

test("시각에 두 자리를 채운다", () => {
  // 한 자리로 두면 이름이 들쭉날쭉하고 차례로 늘어놓을 때 어긋난다.
  assert.equal(
    recordingFileName({
      typed: "",
      mimeType: "audio/mp4",
      at: new Date(2026, 0, 2, 3, 4),
    }),
    "녹음 2026-01-02 0304.m4a",
  );
});

test("적은 이름을 쓰고 확장자를 붙인다", () => {
  assert.equal(
    recordingFileName({
      typed: "  3학년 수업 녹음  ",
      mimeType: "audio/webm",
      at: new Date(2026, 9, 4, 15, 32),
    }),
    "3학년 수업 녹음.webm",
  );
});

test("확장자를 두 번 붙이지 않는다", () => {
  assert.equal(
    recordingFileName({
      typed: "강의.webm",
      mimeType: "audio/webm",
      at: new Date(2026, 9, 4, 15, 32),
    }),
    "강의.webm",
  );

  // 대문자로 적어도 같다.
  assert.equal(
    recordingFileName({
      typed: "강의.WEBM",
      mimeType: "audio/webm",
      at: new Date(2026, 9, 4, 15, 32),
    }),
    "강의.WEBM",
  );
});

test("같은 시각이 아니면 이름이 겹치지 않는다", () => {
  /*
    녹음은 한 자리에서 여러 번 만들어진다. 날짜만 넣으면 하루에 둘 이상일
    때 같아지고, Drive에 나란히 쌓여 어느 것이 무엇인지 알 수 없다.
  */
  const first = recordingFileName({
    typed: "",
    mimeType: "audio/webm",
    at: new Date(2026, 9, 4, 15, 32),
  });
  const second = recordingFileName({
    typed: "",
    mimeType: "audio/webm",
    at: new Date(2026, 9, 4, 16, 5),
  });

  assert.notEqual(first, second);
});

// -----------------------------------------------------------------------------
// 길이
// -----------------------------------------------------------------------------

test("녹음 상한이 올릴 수 있는 크기 안에 든다", () => {
  /*
    상한을 두는 까닭은 크기다. 100MB를 넘으면 올리는 쪽이 거부하고,
    그때는 **녹음을 통째로 잃는다.** Opus로 압축하면 1시간이 대개 30MB
    안쪽이다. 이 숫자를 늘릴 때는 그 계산을 다시 한다.
  */
  assert.equal(MAX_RECORDING_SECONDS, 3600);
  assert.equal(formatPosition(MAX_RECORDING_SECONDS), "1:00:00");
});

test("녹음 길이를 적는 함수를 따로 두지 않는다", () => {
  /*
    **처음에 `formatRecordingLength`를 녹음 쪽에 따로 만들었다.**
    `media/time.ts`의 `formatPosition`이 이미 같은 일을 하고 있었고,
    그 파일 머리말이 `같은 뜻의 것을 두 벌 만들면 한쪽만 고쳐진다`고
    적어둔 자리다. 2026-10-04에 지웠다.

    **검사로 못 박는다.** 말로만 적은 약속은 잊히고, 다음에 녹음 쪽에서
    시간을 적을 일이 생기면 또 만들고 싶어진다.
  */
  assert.equal(
    typeof recording.formatRecordingLength,
    "undefined",
    "녹음 쪽에 시간 적는 함수가 다시 생겼다. media/time.ts의 formatPosition을 쓴다",
  );

  // 그 함수가 하던 일을 공용 쪽이 그대로 한다.
  assert.equal(formatPosition(0), "00:00");
  assert.equal(formatPosition(187), "03:07");
  assert.equal(formatPosition(3750), "1:02:30");
});
