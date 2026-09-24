/**
 * YouTube 주소에서 영상 번호를 뽑는다. (15-E-2b, 설계 문서 14절)
 *
 * **주소 모양이 한둘이 아니다.** 사용자는 브라우저 주소창에서 복사하거나,
 * 앱의 공유 단추에서 받거나, 남이 보내준 것을 그대로 붙여넣는다. 그때마다
 * 다른 모양이 온다.
 *
 * | 어디서 | 모양 |
 * | --- | --- |
 * | 브라우저 | `youtube.com/watch?v=<번호>` |
 * | 공유 단추 | `youtu.be/<번호>?si=...` |
 * | 쇼츠 | `youtube.com/shorts/<번호>` |
 * | 퍼가기 | `youtube.com/embed/<번호>` |
 * | 옛 주소 | `youtube.com/v/<번호>` |
 * | 재생목록에서 | `watch?v=<번호>&list=...&index=3` |
 * | 시간이 붙은 것 | `youtu.be/<번호>?t=90` |
 *
 * **이 셈은 눈으로 검사할 수 없다.** 몇 개 넣어보고 되는 것 같으면 넘어가기
 * 쉬운데, 나중에 안 되는 주소를 만나면 "왜 이것만 안 되지"가 된다. 그때
 * 원인이 여기라는 것을 떠올리기 어렵다. 그래서 검사로 붙잡는다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** `outline.ts`와 같은 이유다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 영상 번호의 모양.
 *
 * 열한 글자이고 영문·숫자·`-`·`_`만 쓴다. YouTube가 그렇게 만들고 있고
 * 바뀐 적이 없다.
 *
 * **길이를 확인하는 이유는 엉뚱한 값을 번호로 넘기지 않기 위해서다.**
 * `youtu.be/about` 같은 주소에서 `about`을 번호로 읽으면, 우리는 YouTube에
 * 그것을 물어보고 "없는 영상"이라는 답을 받는다. 사용자에게는 "주소가
 * 잘못됐다"가 아니라 "영상이 없다"로 보여서 무엇이 문제인지 알 수 없다.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** 번호가 경로에 오는 주소들. `youtube.com/shorts/<번호>` 같은 것. */
const PATH_PREFIXES = ["shorts", "embed", "v", "live"];

/**
 * 주소에서 영상 번호를 뽑는다. 못 알아보면 `null`이다.
 *
 * **번호만 붙여넣은 것도 받는다.** 사용자가 주소가 아니라 번호를 아는
 * 경우가 있고, 그때 "주소를 넣으라"고 돌려보낼 이유가 없다.
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  // 번호를 그대로 넣은 경우.
  if (VIDEO_ID.test(trimmed)) {
    return trimmed;
  }

  const url = parseUrl(trimmed);

  if (!url) {
    return null;
  }

  if (!isYouTubeHost(url.hostname)) {
    return null;
  }

  /*
    `youtu.be`는 경로 첫 칸이 곧 번호다.

    이 주소에만 있는 모양이라 따로 본다. 아래의 경로 규칙에 섞으면
    `youtube.com/<번호>` 같은 없는 주소까지 받아들이게 된다.
  */
  if (isShortHost(url.hostname)) {
    return asVideoId(firstSegment(url.pathname));
  }

  const segments = url.pathname.split("/").filter(Boolean);

  // `watch?v=<번호>`. 재생목록이나 시작 시각이 함께 와도 상관없다.
  if (segments[0] === "watch") {
    return asVideoId(url.searchParams.get("v"));
  }

  /*
    경로에 번호가 오는 것들.

    `/shorts/<번호>`, `/embed/<번호>`, `/v/<번호>`, `/live/<번호>`.
    앞칸이 목록에 있을 때만 그다음 칸을 번호로 본다. 아무 경로나 받으면
    `youtube.com/@채널이름`의 채널 이름을 번호로 읽게 된다.
  */
  if (segments.length >= 2 && PATH_PREFIXES.includes(segments[0])) {
    return asVideoId(segments[1]);
  }

  /*
    `/oembed?url=...`처럼 주소 안에 주소가 든 경우는 따라가지 않는다.

    따라가기 시작하면 어디서 멈출지를 정해야 하고, 그 값은 사용자가 아니라
    **남이 만든 주소**일 수 있다. 우리 서버가 그것을 열어보게 만드는 길을
    열지 않는다. (보안 원칙 10과 같은 생각이다)
  */

  return null;
}

/** 영상 번호로 앱에서 쓸 주소를 만든다. 담을 때 `sources.original_url`이 된다. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * 미리보기 그림 주소.
 *
 * **API가 돌려주는 주소를 쓰지 않고 우리가 만든다.** 돌려주는 값은 영상마다
 * 있는 크기가 달라서(`maxres`가 없는 영상이 흔하다) 어느 것을 골랐는지에
 * 따라 빈 그림이 뜬다. `hqdefault`는 모든 영상에 있다.
 */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * `PT1H2M10S` 같은 ISO 8601 기간을 초로 바꾼다. 못 알아보면 `null`이다.
 *
 * YouTube가 길이를 이 모양으로 준다. 초로 바꿔 담는 이유는 **사람이 보는
 * 모양을 화면이 만들게 하기 위해서다.** 글자로 담으면 `1:02:10`으로 보여줄
 * 때마다 다시 뜯어야 하고, 기록의 시점과 견줄 수도 없다.
 *
 * 날짜 부분(`P1D`)은 다루지 않는다. 하루가 넘는 영상은 사실상 없고,
 * 다루려면 "하루가 24시간인가"까지 정해야 한다. 못 알아본 것으로 둔다.
 */
export function parseDurationSeconds(value: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds] = match;

  // `PT`만 온 경우. 모양은 맞지만 값이 없다.
  if (hours === undefined && minutes === undefined && seconds === undefined) {
    return null;
  }

  return (
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
  );
}

/**
 * 초를 사람이 보는 모양으로. `1:02:10` 또는 `3:24`.
 *
 * 한 시간이 넘을 때만 시간 칸을 붙인다. 늘 붙이면 3분짜리가 `0:03:24`로
 * 나와서 읽기 어렵다.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);

  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}

function parseUrl(value: string): URL | null {
  /*
    주소에 규칙(scheme)이 없으면 붙여 본다.

    사용자는 `youtu.be/...`만 복사해 오는 일이 잦다. 그것을 못 알아본다고
    돌려보내면 **사용자는 자기가 맞는 주소를 넣었다고 생각한다.**
  */
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//iu.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(candidate);

    /*
      http와 https만. `javascript:`가 화면의 링크에 들어가면 누르는 순간
      실행된다. 위의 규칙 확인을 통과하는 모양이라 여기서 한 번 더 본다.
    */
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * YouTube의 주소인가.
 *
 * **끝이 맞는지를 본다.** `includes("youtube.com")`으로 보면
 * `youtube.com.evil.example`이 통과한다. 그 주소는 남의 것이다.
 */
function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./u, "");

  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    isShortHost(hostname)
  );
}

function isShortHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/^www\./u, "") === "youtu.be";
}

function firstSegment(pathname: string): string | null {
  return pathname.split("/").filter(Boolean)[0] ?? null;
}

function asVideoId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return VIDEO_ID.test(value) ? value : null;
}
