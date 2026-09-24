/**
 * YouTube 주소에서 영상 번호를 뽑는 셈의 단위 검사. (15-E-2b)
 *
 * **이 셈은 눈으로 검사할 수 없다.** 주소 두세 개를 넣어보고 되는 것 같으면
 * 넘어가기 쉬운데, 나중에 안 되는 주소를 만나면 "왜 이것만 안 되지"가 되고
 * 원인이 여기라는 것을 떠올리기 어렵다.
 *
 * 사용자가 넣는 주소는 어디서 복사했느냐에 따라 모양이 다르다. 브라우저
 * 주소창, 공유 단추, 쇼츠, 남이 보내준 것. 그 전부를 여기 적어둔다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVideoId,
  formatDuration,
  parseDurationSeconds,
  thumbnailUrl,
  watchUrl,
} from "../src/lib/youtube/video-id.ts";

/** 검사 내내 쓰는 진짜 모양의 번호. 열한 글자다. */
const ID = "dQw4w9WgXcQ";

// -----------------------------------------------------------------------------
// 받아들여야 하는 주소
// -----------------------------------------------------------------------------

test("브라우저 주소창에서 복사한 주소", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
});

test("공유 단추에서 받은 짧은 주소", () => {
  assert.equal(extractVideoId(`https://youtu.be/${ID}`), ID);
});

test("공유 단추가 붙이는 꼬리표가 있어도 뽑는다", () => {
  // `?si=`가 요즘 늘 붙는다. 이것 때문에 못 알아보면 대부분의 주소가 막힌다.
  assert.equal(extractVideoId(`https://youtu.be/${ID}?si=abcdefg`), ID);
});

test("쇼츠 주소", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
});

test("퍼가기와 옛 주소와 라이브 주소", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/v/${ID}`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/live/${ID}`), ID);
});

test("재생목록에서 연 주소도 그 영상으로 본다", () => {
  /*
    `list`와 `index`가 함께 온다. 재생목록을 담는 것이 아니라 지금 보고 있는
    영상을 담는 것이므로 `v`를 읽는다.
  */
  assert.equal(
    extractVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLabc&index=3`),
    ID,
  );
});

test("시작 시각이 붙어 있어도 뽑는다", () => {
  assert.equal(extractVideoId(`https://youtu.be/${ID}?t=90`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}&t=1m30s`), ID);
});

test("규칙 없이 붙여넣은 주소도 받는다", () => {
  // 사용자는 `youtu.be/...`만 복사해 오는 일이 잦다.
  assert.equal(extractVideoId(`youtu.be/${ID}`), ID);
  assert.equal(extractVideoId(`www.youtube.com/watch?v=${ID}`), ID);
});

test("번호만 붙여넣은 것도 받는다", () => {
  // 주소가 아니라 번호를 아는 경우가 있다. 돌려보낼 이유가 없다.
  assert.equal(extractVideoId(ID), ID);
});

test("앞뒤 공백을 넘긴다", () => {
  assert.equal(extractVideoId(`  https://youtu.be/${ID}  \n`), ID);
});

test("m.youtube.com과 대문자 주소도 받는다", () => {
  // 휴대폰에서 복사하면 `m.`이 붙는다.
  assert.equal(extractVideoId(`https://m.youtube.com/watch?v=${ID}`), ID);
  assert.equal(extractVideoId(`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`), ID);
});

// -----------------------------------------------------------------------------
// 받아들이면 안 되는 것
// -----------------------------------------------------------------------------

test("YouTube를 흉내 낸 주소는 받지 않는다", () => {
  /*
    **글자가 들어 있는지로 보면 안 된다.** `includes("youtube.com")`으로
    판정하면 아래가 통과하는데, 그 주소는 남의 것이다.
  */
  assert.equal(
    extractVideoId(`https://youtube.com.evil.example/watch?v=${ID}`),
    null,
  );
  assert.equal(extractVideoId(`https://notyoutube.com/watch?v=${ID}`), null);
  assert.equal(extractVideoId(`https://youtu.be.evil.example/${ID}`), null);
});

test("채널 주소는 영상이 아니다", () => {
  // 앞칸을 보지 않으면 채널 이름을 번호로 읽는다.
  assert.equal(extractVideoId("https://www.youtube.com/@somechannel"), null);
  assert.equal(extractVideoId("https://www.youtube.com/c/somechannel"), null);
  assert.equal(extractVideoId("https://www.youtube.com/feed/subscriptions"), null);
});

test("모양이 맞지 않는 번호는 번호로 보지 않는다", () => {
  /*
    **길이를 보지 않으면 엉뚱한 값을 YouTube에 물어보게 된다.** 그러면
    "없는 영상"이라는 답이 오고, 사용자에게는 "주소가 잘못됐다"가 아니라
    "영상이 없다"로 보인다. 무엇이 문제인지 알 수 없다.
  */
  assert.equal(extractVideoId("https://youtu.be/about"), null);
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}extra`), null);
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=has spaces"), null);
});

test("v가 없는 watch 주소는 뽑을 것이 없다", () => {
  assert.equal(extractVideoId("https://www.youtube.com/watch?list=PLabc"), null);
});

test("빈 값과 아무 글이나", () => {
  assert.equal(extractVideoId(""), null);
  assert.equal(extractVideoId("   "), null);
  assert.equal(extractVideoId("어제 본 영상"), null);
});

test("javascript 주소는 받지 않는다", () => {
  // 화면의 링크에 들어가면 누르는 순간 실행된다.
  assert.equal(extractVideoId("javascript:alert(1)"), null);
  assert.equal(extractVideoId("data:text/html,<script>"), null);
});

test("주소 안에 든 주소를 따라가지 않는다", () => {
  /*
    따라가기 시작하면 어디서 멈출지를 정해야 하고, 그 값은 **남이 만든
    주소**일 수 있다. 우리 서버가 그것을 열어보게 만드는 길을 열지 않는다.
  */
  assert.equal(
    extractVideoId(
      `https://www.youtube.com/oembed?url=https://youtu.be/${ID}`,
    ),
    null,
  );
});

test("다른 곳의 주소는 받지 않는다", () => {
  assert.equal(extractVideoId(`https://vimeo.com/${ID}`), null);
  assert.equal(extractVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

// -----------------------------------------------------------------------------
// 주소 만들기
// -----------------------------------------------------------------------------

test("담을 주소와 미리보기 그림 주소를 만든다", () => {
  assert.equal(watchUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
});

test("만든 주소를 다시 뽑으면 같은 번호가 나온다", () => {
  // 담고 다시 읽는 길이 어긋나지 않는지 본다.
  assert.equal(extractVideoId(watchUrl(ID)), ID);
});

// -----------------------------------------------------------------------------
// 길이
// -----------------------------------------------------------------------------

test("YouTube가 주는 모양의 길이를 초로 바꾼다", () => {
  assert.equal(parseDurationSeconds("PT3M24S"), 204);
  assert.equal(parseDurationSeconds("PT1H2M10S"), 3730);
  assert.equal(parseDurationSeconds("PT45S"), 45);
  assert.equal(parseDurationSeconds("PT2H"), 7200);
  assert.equal(parseDurationSeconds("PT10M"), 600);
});

test("못 알아보는 길이는 null이다", () => {
  /*
    라이브 방송은 `P0D`가 온다. 0초로 읽으면 **화면에 `0:00`이 뜨고
    사용자는 영상이 비었다고 생각한다.** 모르는 것은 모른다고 둔다.
  */
  assert.equal(parseDurationSeconds("P0D"), null);
  assert.equal(parseDurationSeconds("PT"), null);
  assert.equal(parseDurationSeconds(""), null);
  assert.equal(parseDurationSeconds("3분 24초"), null);
});

test("사람이 보는 모양으로 만든다", () => {
  assert.equal(formatDuration(204), "3:24");
  assert.equal(formatDuration(3730), "1:02:10");
  assert.equal(formatDuration(45), "0:45");
  assert.equal(formatDuration(0), "0:00");
});

test("한 시간이 넘을 때만 시간 칸을 붙인다", () => {
  // 늘 붙이면 3분짜리가 `0:03:24`로 나와서 읽기 어렵다.
  assert.equal(formatDuration(3599), "59:59");
  assert.equal(formatDuration(3600), "1:00:00");
});

test("모자란 자리를 0으로 채운다", () => {
  // `1:2:3`으로 나오면 시각처럼 읽히지 않는다.
  assert.equal(formatDuration(3723), "1:02:03");
  assert.equal(formatDuration(65), "1:05");
});
