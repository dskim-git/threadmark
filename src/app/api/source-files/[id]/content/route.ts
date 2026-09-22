import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAccount } from "@/lib/auth/account";
import { canAccessProtectedArea } from "@/lib/auth/status";
import { getDriveAccessToken } from "@/lib/drive/connection";
import { fetchDriveFileContent, relayableHeaders } from "@/lib/drive/download";
import { isAllowedUploadMimeType } from "@/lib/drive/upload";
import { createClient } from "@/lib/supabase/server";

/**
 * 자료에 붙은 파일의 내용을 브라우저로 흘려보낸다.
 *
 * 설계 문서 9.2절이 정한 방식이다.
 *   서버가 사용자 세션을 확인한 후 Drive 파일을 스트리밍한다.
 *   가능하면 HTTP Range 요청을 전달한다.
 *
 * 이 경로는 사용자의 파일 내용을 그대로 내보낸다. 이 저장소에서 가장
 * 조심해야 하는 자리 중 하나다. 그래서 확인을 겹쳐 건다.
 *
 *   1. 승인된 계정인가                 (getAccount)
 *   2. 그 파일 행이 내 것인가           (RLS. 사용자 세션 클라이언트로 조회)
 *   3. 확인을 마친 파일인가             (status = ready)
 *   4. 우리가 다룰 수 있는 종류인가      (허용 목록)
 *   5. Drive가 나에게 내어주는가         (drive.file 권한 범위)
 *
 * 2번이 핵심이다. service role을 쓰지 않고 사용자 세션으로 읽으므로,
 * 남의 파일 id를 넣으면 행이 아예 보이지 않는다.
 *
 * 없는 파일과 남의 파일을 구분하지 않는다. 둘 다 404다. (보안 원칙 9)
 */

const idSchema = z.uuid();

/**
 * 브라우저가 보낸 Range를 그대로 넘기지 않고 형태를 확인한다.
 *
 * 이 값은 우리가 Google에 보내는 요청의 헤더가 된다. 줄바꿈이 섞인 값을
 * 그대로 넘기면 헤더를 하나 더 끼워 넣을 수 있다.
 * fetch가 대부분 막아주지만, 막아준다고 가정하지 않는다.
 */
const RANGE_PATTERN = /^bytes=\d*-\d*(,\s*\d*-\d*)*$/;

function safeRange(value: string | null): string | null {
  if (!value || value.length > 200) {
    return null;
  }

  return RANGE_PATTERN.test(value) ? value : null;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/source-files/[id]/content">,
) {
  // 레이아웃이 확인했으리라 가정하지 않는다. (보안 원칙 5)
  //
  // requireActiveAccount를 쓰지 않는 이유는 그 함수가 redirect를 하기 때문이다.
  // 이 경로는 화면이 아니라 PDF.js가 부르는 자리라, 로그인 화면의 HTML을
  // 돌려주면 PDF를 읽지 못해 이상한 오류만 난다. 상태 코드로 답한다.
  const account = await getAccount();

  if (!account || !canAccessProtectedArea(account.status)) {
    // 로그인하지 않았거나 승인되지 않은 계정이다.
    // 무엇이 문제인지 알려주지 않는다. 모르면 거부한다. (보안 원칙 7)
    return new Response(null, { status: 404 });
  }

  const { id } = await params;
  const fileId = idSchema.safeParse(id);

  if (!fileId.success) {
    return new Response(null, { status: 404 });
  }

  const supabase = await createClient();

  // 사용자 세션으로 읽는다. RLS가 남의 행을 숨긴다.
  // service role을 쓰면 이 확인이 통째로 사라진다.
  const { data: file, error } = await supabase
    .from("source_files")
    .select("drive_file_id, mime_type, status, file_name")
    .eq("id", fileId.data)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 파일 조회 실패:", error.message);

    return new Response(null, { status: 500 });
  }

  // 없거나, 남의 것이거나, 아직 확인되지 않았거나, 가리킬 파일이 없다.
  if (!file || file.status !== "ready" || !file.drive_file_id) {
    return new Response(null, { status: 404 });
  }

  // 표에 어떤 종류가 들어 있든, 내보내는 것은 우리가 다룰 수 있는 것만으로 좁힌다.
  if (!isAllowedUploadMimeType(file.mime_type)) {
    return new Response(null, { status: 404 });
  }

  const accessToken = await getDriveAccessToken(account.userId);

  if (!accessToken) {
    // Drive 연결이 끊겼거나 권한이 취소되었다.
    // 자료와 기록은 그대로 두고 파일만 못 읽는 상태다. (설계 문서 10.4절)
    return new Response(null, { status: 502 });
  }

  const download = await fetchDriveFileContent({
    accessToken,
    fileId: file.drive_file_id,
    range: safeRange(request.headers.get("range")),
  });

  if (download.outcome === "missing") {
    // 사용자가 Drive에서 파일을 지웠거나 옮겼다. (설계 문서 10.4절)
    return new Response(null, { status: 404 });
  }

  if (download.outcome === "failed") {
    return new Response(null, { status: 502 });
  }

  const headers = relayableHeaders(download.response.headers);

  // 종류는 Drive가 뭐라 하든 우리가 기록해 둔 값을 쓴다.
  headers.set("Content-Type", file.mime_type);

  // 브라우저가 이 응답을 실행 가능한 것으로 해석하지 않게 한다.
  headers.set("X-Content-Type-Options", "nosniff");

  // 파일 이름을 Content-Disposition에 넣지 않는다.
  // 그 헤더는 파일 이름을 그대로 담는데, 사용자가 정한 이름이 들어가면
  // 따옴표나 줄바꿈으로 헤더를 흔들 여지가 생긴다. 화면이 이미 이름을 알고 있다.
  headers.set("Content-Disposition", "inline");

  // 사용자의 파일이다. 중간 서버나 CDN에 남기지 않는다.
  headers.set("Cache-Control", "private, no-store");

  // 큰 PDF를 구간별로 읽을 수 있다고 알려준다. (설계 문서 9.2절)
  if (!headers.has("accept-ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }

  // 본문을 읽지 않고 그대로 흘려보낸다.
  // 여기서 통째로 읽으면 큰 PDF가 서버 메모리에 올라간다.
  return new Response(download.response.body, {
    status: download.response.status,
    headers,
  });
}
