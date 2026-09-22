/**
 * Drive의 파일이 그대로인지 판단하는 규칙.
 *
 * 설계 문서 9.2절
 *   파일이 교체된 경우 checksum을 비교하여 기존 annotation 위치가
 *   달라질 수 있음을 표시한다.
 *
 * 설계 문서 10.4절
 *   토큰 만료, 권한 취소, 파일 이동·삭제를 구분해 표시한다.
 *   Drive 파일이 사라져도 Source와 Capture 메타데이터는 유지한다.
 *
 * 네트워크 호출은 여기에 두지 않는다. "무엇을 보고 어떻게 판단하는가"만 남긴다.
 * 데이터베이스 의존성도 없어 단위 검사로 확인한다.
 */

import type { DriveFileFacts } from "./upload.ts";

/**
 * 얼마나 자주 확인할 것인가.
 *
 * 뷰어를 열 때마다 Drive에 물으면 화면이 그만큼 늦게 뜬다. 파일이 바뀌는 일은
 * 드물고, 조금 늦게 알아차려도 큰일이 나지 않는다. 기록이 사라지는 것이
 * 아니라 "위치가 달라졌을 수 있다"는 안내가 늦어질 뿐이다.
 *
 * 반대로 너무 길게 잡으면, 파일을 바꿔놓고 한참을 모른 채 읽게 된다.
 */
export const VERIFY_INTERVAL_MINUTES = 10;

/**
 * 지금 다시 물어봐야 하는가.
 *
 * 한 번도 확인한 적이 없으면 물어본다. 업로드 직후에는 방금 확인했으므로
 * last_verified_at이 차 있고, 그래서 바로 다시 묻지 않는다.
 */
export function shouldVerify(
  lastVerifiedAt: string | null,
  now: Date,
): boolean {
  if (!lastVerifiedAt) {
    return true;
  }

  const verified = new Date(lastVerifiedAt).getTime();

  if (!Number.isFinite(verified)) {
    // 시각을 읽지 못하면 확인한 적이 없는 것으로 본다.
    return true;
  }

  return now.getTime() - verified >= VERIFY_INTERVAL_MINUTES * 60 * 1000;
}

/** 확인 결과. 무엇을 사용자에게 알릴지 이 값으로 정한다. */
export type FileCheck =
  /** 그대로다. */
  | { outcome: "unchanged" }
  /** 내용이 바뀌었다. 기록의 위치가 달라졌을 수 있다. (설계 문서 9.2절) */
  | { outcome: "changed"; facts: DriveFileFacts }
  /** Drive에 없다. 영구 삭제되었거나 권한이 사라졌다. (설계 문서 10.4절) */
  | { outcome: "missing" }
  /**
   * 휴지통에 있다. (설계 문서 10.4절의 "복구 가능한 오류 상태")
   *
   * 없어진 것과 나눠 두는 이유는 사용자가 할 일이 다르기 때문이다.
   * 휴지통에 있으면 복원하면 되고, 영구 삭제면 다시 올려야 한다.
   */
  | { outcome: "trashed" }
  /** 물어보지 못했다. 연결이 끊겼거나 일시적인 문제다. */
  | { outcome: "unknown" };

/**
 * Drive가 알려준 지금 상태와 우리가 적어둔 것을 견준다.
 *
 * checksum이 다르면 내용이 바뀐 것이다. 파일 이름이나 수정 시각이 아니라
 * checksum을 보는 이유는, 그것만이 **내용**이 같은지 말해주기 때문이다.
 * 이름은 그대로 두고 내용만 바꿔치기하는 경우가 우리가 잡으려는 것이다.
 *
 * checksum을 모르면 바뀌었다고 하지 않는다. Google 문서처럼 바이너리가 아닌
 * 파일에는 값이 없다. 모르는 것을 "바뀌었다"고 알리면, 사용자는 멀쩡한 기록을
 * 의심하게 된다. 모르면 조용히 둔다.
 */
export function compareDriveFile(options: {
  storedChecksum: string | null;
  current: DriveFileFacts;
}): FileCheck {
  const { storedChecksum, current } = options;

  if (!storedChecksum || !current.checksum) {
    return { outcome: "unchanged" };
  }

  return storedChecksum === current.checksum
    ? { outcome: "unchanged" }
    : { outcome: "changed", facts: current };
}

/**
 * 기록이 가리키는 파일이 그 뒤로 바뀌었는가.
 *
 * 기록에는 남길 당시의 checksum이 함께 저장되어 있다. (설계 문서 6.3절)
 * 그 값과 지금 파일의 값을 견주면, 그 기록의 쪽 번호와 좌표를 믿어도 되는지
 * 알 수 있다.
 *
 * 둘 중 하나라도 모르면 false다. 모르면 의심하지 않는다.
 */
export function locatorIsStale(options: {
  locatorChecksum: string | null;
  fileChecksum: string | null;
}): boolean {
  const { locatorChecksum, fileChecksum } = options;

  if (!locatorChecksum || !fileChecksum) {
    return false;
  }

  return locatorChecksum !== fileChecksum;
}

/** 사용자에게 보여줄 문구. 무엇이 일어났고 무엇을 하면 되는지만 알린다. */
export function describeFileCheck(outcome: FileCheck["outcome"]): string | null {
  switch (outcome) {
    case "unchanged":
      return null;
    case "changed":
      return "이 파일은 기록을 남긴 뒤에 바뀌었습니다. 예전 기록이 가리키는 쪽과 위치가 달라졌을 수 있습니다.";
    case "missing":
      return "Drive에서 이 파일을 찾지 못했습니다. 지웠거나 옮겼을 수 있습니다. 기록은 그대로 남아 있습니다.";
    case "trashed":
      return "이 파일은 Drive 휴지통에 있습니다. 휴지통에서 복원한 뒤 다시 확인해 주세요. 기록은 그대로 남아 있습니다.";
    case "unknown":
      return "파일 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
