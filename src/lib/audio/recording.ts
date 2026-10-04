/**
 * 브라우저 녹음의 순수 판단. (설계 문서 17절, 17-V 3차례, 2026-10-04)
 *
 * **브라우저 API를 부르지 않는다.** `MediaRecorder`를 쓰는 쪽은 화면에 두고,
 * 여기에는 "어떤 형식으로 녹음하고, 그것을 어떤 이름과 종류로 올리는가"만
 * 남긴다. `upload.ts`와 `file-kinds.ts`가 같은 모양이다.
 *
 * **2차례에서 배운 것을 먼저 적용했다.** 그때 `isReadable`에 검사가 하나도
 * 없었던 까닭이 그것이 **검사가 불러올 수 없는 파일**에 있었기 때문이다.
 * 녹음 판단은 틀려도 조용한 자리가 많아서, 처음부터 떼어 두었다.
 *
 * 무엇이 조용히 틀리는가
 *   - 꼬리 붙은 종류를 그대로 보내면 **녹음이 통째로 안 올라간다**
 *   - 기기마다 되는 형식이 달라서 **그 기기에서만** 안 된다
 *   - 이름에 확장자가 안 붙으면 Drive에서 무엇인지 알 수 없다
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
// 별칭(`@/`)으로 적으면 그 러너가 풀지 못한다. `upload.ts`가 같은 까닭으로
// 같은 모양을 하고 있다.
import {
  isAllowedUploadMimeType,
  type AllowedUploadMimeType,
} from "../drive/upload.ts";

/**
 * 녹음해 볼 형식의 차례.
 *
 * **앞에서부터 되는 것을 쓴다.** 기기마다 되는 것이 다르고, 무엇이 되는지는
 * 브라우저만 안다.
 *
 * 차례를 이렇게 둔 까닭
 *   `audio/webm`이 먼저다. Opus로 압축되어 **같은 길이에 가장 작다.**
 *   설계 문서 17절이 "압축된 음성 형식을 사용한다"고 적은 쪽에 가장 가깝다.
 *   Android Chrome과 데스크톱이 이것을 준다.
 *
 *   `audio/mp4`가 다음이다. **iOS Safari는 webm을 녹음하지 못한다.**
 *   그 기기에서는 이것만 된다.
 *
 *   `audio/ogg`는 받쳐 주는 자리다. Firefox 쪽에서 나온다.
 *
 * **`audio/mpeg`(mp3)는 여기 없다.** 브라우저가 mp3로 녹음해 주지 않는다.
 * 받는 목록에는 있지만 그것은 **사람이 가진 mp3를 올리는 길**이다.
 * 녹음해 볼 형식과 받는 형식은 같은 목록이 아니다.
 */
export const RECORDING_MIME_CANDIDATES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
] as const satisfies readonly AllowedUploadMimeType[];

/**
 * 종류에서 꼬리를 뗀다.
 *
 * `MediaRecorder`는 `audio/webm;codecs=opus`처럼 **코덱을 붙여** 말한다.
 * 그런데 받는 쪽(`uploadStartSchema`)은 **글자가 똑같은지**를 보므로, 그대로
 * 보내면 거부당한다. **녹음이 통째로 안 올라간다.**
 *
 * 17-V.9절이 만들기 전에 적어둔 함정이고, 여기가 그것을 막는 자리다.
 *
 * 꼬리만 떼고 **그 앞을 고치지는 않는다.** 소문자로 바꾸거나 공백을 지우는
 * 것까지 하면, 받는 목록에 없는 값을 **있는 값으로 보이게 만들** 수 있다.
 * 받아도 되는지는 `isAllowedUploadMimeType`이 정한다.
 */
export function stripMimeParameters(value: string): string {
  const semicolon = value.indexOf(";");

  return (semicolon === -1 ? value : value.slice(0, semicolon)).trim();
}

/**
 * 이 기기에서 녹음할 형식을 고른다. 고를 것이 없으면 null이다.
 *
 * **되는지 묻는 일을 넘겨받는다.** `MediaRecorder.isTypeSupported`를 여기서
 * 부르면 이 판단을 브라우저 밖에서 검사할 수 없다. 묻는 쪽을 받으면
 * 검사에서 어떤 기기든 흉내 낼 수 있다.
 *
 * **코덱을 붙여 물어본다.** `audio/webm`만 물으면 참이라고 하면서 정작
 * `audio/webm;codecs=opus`로 녹음하는 브라우저가 있다. 붙여 물어 되는 것이
 * 있으면 그 말 그대로 녹음을 시작하고, **담는 종류는 꼬리를 뗀 쪽**을 쓴다.
 *
 * 돌려주는 것이 둘인 까닭이 그것이다. 녹음기에 건넬 말과 Drive에 적을
 * 종류가 **다른 값**이다. 하나로 돌려주면 둘 중 하나가 틀린다.
 */
export function pickRecordingMimeType(
  isSupported: (mimeType: string) => boolean,
): { recorder: string; stored: AllowedUploadMimeType } | null {
  for (const base of RECORDING_MIME_CANDIDATES) {
    /*
      코덱을 붙인 쪽을 먼저 물어본다. 붙인 것이 되면 그쪽이 더 분명하다.
      어느 코덱으로 담길지를 브라우저가 고르게 두지 않는다.
    */
    const withCodec: Record<string, string | null> = {
      "audio/webm": "audio/webm;codecs=opus",
      "audio/ogg": "audio/ogg;codecs=opus",
      "audio/mp4": null,
    };

    const candidate = withCodec[base] ?? null;

    if (candidate !== null && isSupported(candidate)) {
      return { recorder: candidate, stored: base };
    }

    if (isSupported(base)) {
      return { recorder: base, stored: base };
    }
  }

  return null;
}

/**
 * 녹음 파일에 붙일 확장자.
 *
 * **Drive에서 무엇인지 알 수 있게 한다.** 확장자가 없으면 목록에서 이름만
 * 보이고, 내려받아도 무엇으로 열어야 할지 알 수 없다.
 */
const EXTENSIONS: Record<AllowedUploadMimeType, string | null> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "application/pdf": null,
  "image/png": null,
  "image/jpeg": null,
  "image/webp": null,
  "application/json": null,
};

/**
 * `audio/mp4`에 `m4a`를 붙이는 까닭
 *   `mp4`를 붙이면 많은 기기가 **동영상으로 여기고** 영상 재생기로 연다.
 *   소리만 든 파일에는 `m4a`가 널리 쓰인다. 담는 종류는 `audio/mp4`
 *   그대로이므로 앱 안에서 듣는 데는 영향이 없다.
 */
export function recordingExtension(mimeType: string): string | null {
  const base = stripMimeParameters(mimeType);

  if (!isAllowedUploadMimeType(base)) {
    return null;
  }

  return EXTENSIONS[base];
}

/** 이름에 쓸 두 자리 숫자. */
function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * 녹음 파일 이름을 만든다.
 *
 * `녹음 2026-10-04 1532.webm` 모양이다.
 *
 * **사람이 이름을 적지 않아도 저장되게 한다.** 그림판은 이름을 적어야
 * 저장되는데, 녹음은 다르다. **말을 끝낸 직후가 이름을 생각하기 가장 나쁜
 * 때**이고, 이름 때문에 저장이 막히면 녹음한 것을 잃을 수 있다.
 * 적으면 그 이름을 쓰고, 안 적으면 시각으로 채운다.
 *
 * 시각을 넣는 까닭
 *   녹음은 **한 자리에서 여러 번** 만들어진다. 같은 이름이면 Drive에
 *   나란히 쌓여 어느 것이 무엇인지 알 수 없다. 날짜만으로는 하루에 둘
 *   이상이면 같아진다.
 *
 * 되돌려 받는 이름은 `sanitizeFileName`을 한 번 더 지난다. 거기서 빈
 * 이름이 되면 올리는 쪽이 거부한다.
 */
export function recordingFileName(options: {
  typed: string;
  mimeType: string;
  at: Date;
}): string {
  const extension = recordingExtension(options.mimeType);
  const suffix = extension === null ? "" : `.${extension}`;

  const typed = options.typed.trim();

  if (typed.length > 0) {
    /*
      **적은 이름에 확장자가 이미 있으면 또 붙이지 않는다.** `강의.webm`을
      적었을 때 `강의.webm.webm`이 되면 Drive 목록이 지저분해진다.
    */
    if (suffix.length > 0 && typed.toLowerCase().endsWith(suffix)) {
      return typed;
    }

    return `${typed}${suffix}`;
  }

  const at = options.at;
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;

  return `녹음 ${date} ${time}${suffix}`;
}

/*
  **녹음 길이를 적는 함수를 여기에 두지 않는다.** (2026-10-04에 고쳤다)

  처음에 `formatRecordingLength`를 여기 만들었는데, `src/lib/media/time.ts`의
  `formatPosition`이 **이미 같은 일을 하고 있었다.** 그 파일 머리말이
  `같은 뜻의 것을 두 벌 만들면 한쪽만 고쳐진다`고 적어둔 자리다.

  만들기 전에 음성 쪽만 세어 보고(갈래·폴더·올리는 길) **시간을 적는 자리는
  세지 않았다.** 음악과 영상이 이미 시점을 다루고 있다는 것을 음성 작업과
  잇지 못했다. 15-E에서 `같은 뜻의 입력칸을 두 벌 만들지 않는다`고 적은 것과
  같은 고장이다.

  길이와 시점은 **같은 값이다.** `187초`를 적는 규칙이 녹음 중일 때와 기록에
  적을 때 다를 이유가 없다. `formatPosition`을 쓴다.
*/

/**
 * 녹음 길이의 상한. 1시간이다.
 *
 * **상한을 두는 까닭은 크기다.** 파일 하나가 100MB를 넘으면 올리는 쪽이
 * 거부하고(`MAX_UPLOAD_BYTES`), 그때는 **녹음을 통째로 잃는다.** Opus로
 * 압축하면 1시간이 대개 30MB 안쪽이라 상한 안에 든다.
 *
 * **닿으면 조용히 버리지 않는다.** 그 자리에서 멈추고 알린다. 16-3에서
 * 획 한계에 닿았을 때 한 것과 같다. **녹음이 저장되지 않는 상태를 모르고
 * 계속 말하는 것이 가장 나쁘다.**
 */
export const MAX_RECORDING_SECONDS = 60 * 60;
