/**
 * 파일 갈래를 가리는 순수 판단. (17-V 2차례, 2026-10-04)
 *
 * **`files.ts`에서 떼어냈다.** 그 파일은 `@/lib/supabase/server`와
 * `requireActiveAccount`를 가져오는데, 그러면 **단위 검사가 이 판단을
 * 불러올 수 없다.** 서버 전용 모듈이 함께 끌려 들어온다.
 *
 * 떼어낸 까닭이 생긴 자리
 *   `isReadable`에 검사가 **하나도 없었다.** 그 함수가 "앱 안에서 열 수
 *   있는가"를 혼자 정하는데, PDF만 참이던 때부터 그림이 들어오고 음성이
 *   들어올 때까지 아무도 그것을 조이지 않았다.
 *
 *   틀려도 오류가 나지 않는 자리다. **목록에 파일이 있는데 `열기`가 안
 *   보이거나**, 열리면 안 되는 것이 열려 빈 화면이 뜬다. 둘 다 조용하다.
 *
 * `upload.ts`가 같은 까닭으로 같은 모양을 하고 있다. 그 머리말이
 * "네트워크 호출은 files.ts에, 데이터베이스 접근은 Server Action에 둔다.
 * 여기에는 무엇을 받아들이고 무엇을 거부하는가만 남긴다"고 적었다.
 *
 * **받는 값을 구조로만 적는다.** `SourceFileItem`을 가져오지 않고 필요한
 * 칸만 받는다. 그 타입은 `files.ts`에 있어서 가져오면 떼어낸 뜻이 없어지고,
 * 무엇을 보고 판단하는지가 함수 모양에 드러나는 편이 읽기에도 낫다.
 * (`describeUnacceptableFile`이 같은 방식이다)
 *
 * `files.ts`가 이 넷을 그대로 다시 내보낸다. 불러 쓰는 쪽은 고치지 않았다.
 */

/** 갈래를 가리는 데 필요한 것만. */
type FileKindFacts = {
  mimeType: string;
};

/** 열 수 있는지 가리는 데 필요한 것만. */
type FileOpenFacts = FileKindFacts & {
  status: "pending" | "ready" | "missing";
};

/**
 * 그림 파일인가. (설계 문서 16절, 2026-10-04)
 *
 * **`image/`로 시작하는지로 본다.** 올릴 때 받는 종류는
 * `ALLOWED_UPLOAD_MIME_TYPES`가 좁게 정해두었고, 거기 한 종류가 늘 때마다
 * 이 함수를 고치게 만들지 않는다.
 */
export function isImageFile(file: FileKindFacts): boolean {
  return file.mimeType.startsWith("image/");
}

/** PDF인가. 뷰어가 갈리는 자리라 이름을 붙여 둔다. */
export function isPdfFile(file: FileKindFacts): boolean {
  return file.mimeType === "application/pdf";
}

/**
 * 음성 파일인가. (설계 문서 17절, 17-V 2차례, 2026-10-04)
 *
 * **`audio/`로 시작하는지로 본다.** `isImageFile`과 같은 생각이다.
 */
export function isAudioFile(file: FileKindFacts): boolean {
  return file.mimeType.startsWith("audio/");
}

/**
 * 뷰어가 다룰 수 있는 파일인가. PDF와 그림과 음성이다.
 *
 * **2026-10-04에 그림이 들어왔다.** 그전까지 PDF만이었고, 그림은 올릴 수
 * 있는데 앱 안에서 볼 길이 없어 `Drive에서 열기`로 나가야 했다. 담는 길은
 * 처음부터 있었던 셈이다. `source_type`에 `image`가 있고 Drive 업로드도
 * 그림을 받고 있었다. **없던 것은 보는 길 하나였다.**
 *
 * **같은 날 음성이 들어왔다.** (17-V 2차례) 그림과 다른 점이 하나 있다.
 * 그림은 올릴 수는 있었는데 음성은 **올리는 것부터 막혀 있었다.** 그래서
 * 그 차례가 `ALLOWED_UPLOAD_MIME_TYPES`를 함께 늘렸다.
 *
 * 음성도 **없던 것은 듣는 길 하나**였다. 내보내는 경로가 Range 요청을
 * 이미 넘겨서(9.2절) 중간으로 건너뛰는 것까지 깔려 있었다.
 *
 * 사라진 파일도 포함한다. 열어보면 "Drive에서 찾지 못했습니다"와 함께
 * `다시 확인`을 보여줘야 하기 때문이다. 목록에서 아예 빼버리면 되살린 뒤에도
 * 들어갈 길이 없다. (설계 문서 10.4절: 복구 가능한 오류 상태)
 *
 * 아직 올라가는 중인 파일은 뺀다. 그것은 열 수 있는 상태가 아니다.
 */
export function isReadable(file: FileOpenFacts): boolean {
  if (!isPdfFile(file) && !isImageFile(file) && !isAudioFile(file)) {
    return false;
  }

  return file.status === "ready" || file.status === "missing";
}

/** 지금 실제로 열리는가. 사라진 파일은 목록에 있어도 열리지 않는다. */
export function isOpenable(file: FileOpenFacts): boolean {
  return isReadable(file) && file.status === "ready";
}
