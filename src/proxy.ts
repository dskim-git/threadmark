import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16의 proxy 진입점. (이전 버전의 middleware.ts에 해당한다.)
 *
 * 모든 요청에서 Supabase 세션 쿠키를 갱신한다.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 다음을 제외한 모든 경로에서 실행한다.
     * - _next/static : 빌드된 정적 파일
     * - _next/image  : 이미지 최적화 요청
     * - favicon.ico  : 파비콘
     * - 정적 이미지 확장자
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
