/**
 * 내려받기에 담을 것과 담지 않을 것. (18단계)
 *
 * **이 파일에 다른 것을 import하지 않는다.** 데이터베이스를 무는 쪽은
 * `export-queries.ts`에 있다. 나눈 이유는 검사가 이 목록만 따로 들여다볼
 * 수 있어야 하기 때문이다. `@/` 별칭과 supabase가 딸려 오면 Node 검사
 * 러너가 읽지 못한다. (AGENTS.md 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 *
 * 이 목록이 뒤처지면 **내려받은 파일에 구멍이 난다.** 표를 새로 만들고
 * 여기에 이름을 더하지 않으면 그 표에 담긴 것만 조용히 빠지고, 받는
 * 사람은 빠진 줄 모른다. 나가는 사람이 마지막으로 챙기는 파일이라
 * 되찾을 길도 없다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 내려받기에 담는 표들.
 *
 * **이 목록이 뒤처지면 내려받은 파일에 구멍이 난다.** 표를 새로 만들고
 * 여기에 이름을 더하지 않으면, 그 표에 담긴 것만 조용히 빠진 채로
 * 파일이 만들어진다. 받는 사람은 빠진 줄 모른다.
 *
 * `tests/account-export.test.mjs`가 `PROTECTED_TABLES`와 견줘서 빠진 표를
 * 잡는다. `003`의 격리 검사를 묶어둔 것과 같은 방식이다.
 */
export const EXPORTED_TABLES = [
  "profiles",
  "sources",
  "captures",
  "projects",
  "source_projects",
  "capture_projects",
  "source_files",
  "source_relations",
  "paper_profiles",
  "paper_analyses",
  "paper_project_uses",
  "book_profiles",
  "website_profiles",
  "music_profiles",
  "music_provider_links",
  "youtube_profiles",
  "media_profiles",
  "tags",
  "source_tags",
  "capture_tags",
  "project_outline_nodes",
  "project_node_items",
] as const;

/**
 * 일부러 담지 않는 표와 그 까닭.
 *
 * **담지 않는 것에도 까닭이 있어야 한다.** 까닭 없이 빠지면 그것은
 * 빠뜨린 것이지 정한 것이 아니다.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  /*
    Google 토큰이 들어 있다. 암호로 잠겨 있지만 **내려받는 파일은 메일로도
    오가고 클라우드에도 올라간다.** 그 파일에 열쇠를 담지 않는다.
    이용자가 적은 것도 아니다.
  */
  google_drive_connections: "Google 접근 권한(토큰)이라 담지 않습니다",
  /*
    아래 셋은 이용자의 것이 아니라 운영에 관한 것이다.
  */
  user_roles: "운영자 권한 기록이라 담지 않습니다",
  app_settings: "서비스 운영 설정이라 담지 않습니다",
  admin_audit_logs: "운영자 활동 기록이라 담지 않습니다",
};

/** 사람이 표로 열어볼 수 있게 고른 칸들. */
export const SOURCE_CSV_HEAD = [
  "제목",
  "유형",
  "상태",
  "주소",
  "설명",
  "담은 때",
] as const;

export const CAPTURE_CSV_HEAD = [
  "종류",
  "원문",
  "내 메모",
  "옮긴 글",
  "기계가 만듦",
  "남긴 때",
] as const;

/**
 * 자료를 표 한 장으로.
 *
 * **모든 칸을 담지 않는다.** 표로 여는 사람은 훑어보려는 것이고, 칸이
 * 마흔 개면 훑을 수가 없다. 빠짐없는 사본이 필요하면 JSON 쪽이 그것이다.
 */
export function sourceRows(
  tables: Record<string, unknown[]>,
): unknown[][] {
  return (tables.sources ?? []).map((row) => {
    const source = row as Record<string, unknown>;

    return [
      source.title,
      source.type,
      source.status,
      source.original_url,
      source.description,
      source.created_at,
    ];
  });
}

/**
 * 기록을 표 한 장으로.
 *
 * **원문과 내 메모를 다른 칸에 둔다.** 이 앱의 가장 중요한 약속이고
 * (설계 문서 2.4절), 표로 내보낼 때 한 칸에 합치면 그 구분이 사라진다.
 * 받아둔 파일에서는 되돌릴 방법도 없다.
 */
export function captureRows(
  tables: Record<string, unknown[]>,
): unknown[][] {
  return (tables.captures ?? []).map((row) => {
    const capture = row as Record<string, unknown>;

    return [
      capture.capture_type,
      capture.original_text,
      capture.content,
      capture.translated_text,
      capture.ai_generated ? "예" : "아니오",
      capture.created_at,
    ];
  });
}
