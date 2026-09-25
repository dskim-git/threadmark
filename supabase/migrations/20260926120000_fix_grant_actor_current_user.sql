-- =============================================================================
-- 허용량 트리거의 `pg_catalog.current_user`를 고친다 (19-E)
-- =============================================================================
-- 2026-09-26. **사용자가 쓰다가 찾았다.** 관리자 화면에서 허용량을 더하면
-- 늘 실패했고, 서버 기록에 이렇게 찍혔다.
--
--   [ThreadMark] AI 허용량 더하기 실패:
--   missing FROM-clause entry for table "pg_catalog"
--
-- 무슨 일이 있었나
--   `20260926100000`의 `set_ai_usage_grant_actor`가 이렇게 쓰고 있었다.
--
--     or pg_catalog.current_user::text in ('postgres', ...)
--
--   **`current_user`는 함수가 아니라 낱말이다.** 앞에 스키마를 붙이면
--   `pg_catalog`라는 이름의 표에서 `current_user` 칸을 찾는 것으로 읽힌다.
--   그런 표가 없으니 "missing FROM-clause entry"가 난다.
--
--   이 저장소의 다른 가드 함수들은 처음부터 그냥 `current_user`로 쓰고
--   있었다. (`guard_profile_protected_columns`, `20260920090000`의 405줄)
--   **같은 방식이라고 주석에 적어놓고 실제로는 다르게 썼다.**
--
-- 왜 마이그레이션은 아무 말 없이 올라갔나
--   **plpgsql 본문은 만들 때 다 보지 않는다.** 안의 SQL 식은 그 줄이
--   처음 돌 때 파싱된다. 그래서 `db push`가 통과했다는 것이 그 함수가
--   돈다는 뜻이 아니다. 003의 검사 127이 실제로 한 줄 넣어보는 검사이고,
--   그것을 돌렸다면 여기서 걸렸을 것이다. 안 돌려본 채였다.
--
--   AGENTS.md 6절에 남겼다.
--
-- 왜 `set search_path = ''`인데 스키마를 안 붙여도 되나
--   `current_user`는 이름으로 찾는 것이 아니라 문법이 아는 낱말이라
--   search_path와 상관이 없다. 스키마를 붙여야 하는 것은 `now()`나
--   `jsonb_build_object()`처럼 진짜 함수들이고, 그것들은 그대로 둔다.
--
-- 바뀌는 것은 그 한 줄뿐이다
--   함수의 나머지와 트리거, 정책, 권한은 그대로다. `create or replace`가
--   본문을 통째로 갈아끼우므로 **지금 살아 있는 정의를 그대로 옮겨 적고**
--   그 줄만 고쳤다. (AGENTS.md 6절 "가드 함수를 create or replace로 고칠 때")
--
-- 재실행 안전성
--   `create or replace`라 여러 번 돌려도 같다.
-- =============================================================================

create or replace function public.set_ai_usage_grant_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  /*
    **관리자인지 여기서 한 번 더 본다.**

    정책이 이미 막는다. 그래도 트리거에서 확인하는 까닭은, 정책은 나중에
    누군가 고칠 수 있고 **그때 이 표가 조용히 열린다**는 것이다. 한도를
    푸는 표라 두 겹으로 둔다.

    `service_role`과 `postgres`는 통과시킨다. 검증 스크립트와 서버 작업이
    그 역할로 돈다.

    **`current_user`에 스키마를 붙이지 않는다.** 함수가 아니라 낱말이다.
    붙이면 표의 칸을 찾는 것으로 읽혀 "missing FROM-clause entry"가 난다.
    `guard_profile_protected_columns`가 쓰는 모양과 같게 맞췄다.
  */
  if not (
    public.is_admin()
    or current_user::text in ('postgres', 'service_role', 'supabase_admin')
  ) then
    raise exception 'AI 허용량은 관리자만 더할 수 있습니다.'
      using errcode = '42501';
  end if;

  -- 누가 눌렀는지는 보낸 값을 믿지 않는다.
  new.granted_by := auth.uid();
  new.created_at := pg_catalog.now();

  return new;
end;
$$;

comment on function public.set_ai_usage_grant_actor() is
  'AI 허용량 줄의 준 사람과 시각을 고정하고 관리자인지 다시 본다. current_user를 보므로 SECURITY INVOKER여야 한다.';
