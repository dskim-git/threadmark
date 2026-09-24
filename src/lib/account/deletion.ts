/**
 * 계정과 그 계정의 모든 자료를 지운다. (17-A, 개인정보 초안 9절)
 *
 * **지우는 질의를 표마다 쓰지 않는다.** 자료를 담는 표가 전부 `auth.users`를
 * `on delete cascade`로 물고 있어서, 계정 행 하나가 사라지면 자료·기록·
 * 프로젝트·태그·논문 정보·논문 분석·활용 계획·자료 관계·웹사이트 정보·
 * 음악 정보·파일 정보·Drive 연결·프로필이 함께 사라진다.
 *
 * 표를 하나씩 지우는 방식이 더 꼼꼼해 보이지만 실제로는 반대다. 표가 늘어날
 * 때마다 이 파일에 줄을 더해야 하고, 더하지 않아도 아무 일이 일어나지 않는다.
 * **빠뜨려도 드러나지 않는 방식은 반드시 빠뜨린다.** 데이터베이스가 이미
 * 알고 있는 것을 코드가 다시 적지 않는다.
 *
 * 남는 것은 관리자 감사 기록뿐이고, 그것은 일부러 남긴다. 사용자가 사라지면
 * 연결만 끊어지고(`on delete set null`) 기록에는 상태값만 남는다. 거기에
 * 메일 주소나 이름은 담기지 않는다.
 *
 * 이 모듈은 RLS를 우회하는 클라이언트를 쓴다. 계정 삭제는 사용자 권한으로
 * 할 수 있는 일이 아니기 때문이다. 그래서 "이 사용자의 것만 건드린다"를
 * 코드가 직접 보장해야 한다. 여기서는 받은 `userId` 하나만 다룬다.
 *
 * **표를 읽는 일은 여기서 하지 않는다.** 이 역할에는 표마다 권한이 따로
 * 부여되어야 하고, 부여되지 않은 표를 읽으면 `permission denied`로 막힌다.
 * 하나뿐인 관리자인지 보는 일은 `last-admin.ts`가 사용자 권한으로 한다.
 */

import { disconnectDrive } from "@/lib/drive/connection";
import { createServiceClient } from "@/lib/supabase/service";

/** 지우지 못한 이유. 화면에 보여줄 문구는 화면이 정한다. */
export type DeletionFailure = "delete_failed";

export type DeletionResult =
  | { ok: true }
  | { ok: false; reason: DeletionFailure };

/**
 * 계정을 지운다. 성공하면 그 계정의 자료가 모두 함께 사라진다.
 *
 * **부르기 전에 두 가지를 마쳐야 한다.** 본인 확인과, 하나뿐인 관리자가
 * 아닌지 확인(`isLastAdmin`)이다. 이 함수는 둘 다 다시 묻지 않는다.
 * 받은 `userId`를 지우는 일만 한다.
 *
 * 데이터베이스에도 마지막 관리자를 지키는 가드 트리거가 있지만
 * (`guard_last_admin`), 그것은 service role에 예외를 둔다. 복구 작업을 막지
 * 않기 위해서다. 여기서 쓰는 클라이언트가 바로 그 service role이므로,
 * **가드가 있다는 사실이 가드가 걸린다는 뜻이 아니다.**
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  let supabase: ReturnType<typeof createServiceClient>;

  try {
    supabase = createServiceClient();
  } catch (error) {
    console.error(
      "[ThreadMark] 계정 삭제용 클라이언트를 만들지 못했습니다:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );

    return { ok: false, reason: "delete_failed" };
  }

  /*
    Drive 권한부터 돌려준다. **순서가 중요하다.**

    계정을 먼저 지우면 연결 행이 cascade로 함께 사라지고, 그러면 Google에
    반납할 refresh token을 우리가 더는 읽을 수 없다. 우리 쪽 기록만 사라지고
    Google 계정에는 ThreadMark의 권한이 그대로 남는다. 사용자가 나갔는데
    권한만 남는 것은 가장 나쁜 결말이다.

    `disconnectDrive`는 반납에 실패해도 예외를 던지지 않는다. Google이 잠시
    답하지 않는다고 해서 나가려는 사람을 붙잡아 둘 수는 없기 때문이다.
    그 경우 사용자가 Google 계정 설정에서 직접 끊을 수 있고, 화면이 그 길을
    함께 안내한다.
  */
  try {
    await disconnectDrive(userId);
  } catch (error) {
    console.error(
      "[ThreadMark] 계정 삭제 중 Drive 연결 해제 실패:",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    console.error("[ThreadMark] 계정 삭제 실패:", error.message);

    return { ok: false, reason: "delete_failed" };
  }

  return { ok: true };
}
