-- =============================================================================
-- 1단계 마이그레이션 적용 검증
-- =============================================================================
-- 대상: supabase/migrations/20260920090000_auth_approval_foundation.sql
--
-- 사용법
--   Supabase 대시보드 -> SQL Editor 에 이 파일 전체를 붙여넣고 실행한다.
--   결과 표의 "결과" 열이 모두 통과여야 한다. 하나라도 실패면 적용이 불완전한 것이다.
--
-- 이 스크립트는 읽기 전용이다. 어떤 데이터도 생성·수정·삭제하지 않는다.
-- supabase/migrations 폴더 밖에 있으므로 db push 대상이 아니다.
-- =============================================================================

with checks(순번, 항목, 기대, 실제) as (

  -- 1. 열거형 -----------------------------------------------------------------
  select 1, '열거형 user_status, app_role 생성', '2',
    (select count(*)::text
     from pg_type
     where typname in ('user_status', 'app_role')
       and typnamespace = 'public'::regnamespace)

  union all
  select 2, 'user_status 값 4개 (pending/active/rejected/suspended)', '4',
    (select count(*)::text
     from pg_enum
     where enumtypid = 'public.user_status'::regtype)

  -- 2. 테이블 -----------------------------------------------------------------
  union all
  select 3, '테이블 4개 생성', '4',
    (select count(*)::text
     from pg_tables
     where schemaname = 'public'
       and tablename in ('profiles', 'user_roles', 'app_settings', 'admin_audit_logs'))

  union all
  select 4, '4개 테이블 모두 RLS 활성화', '4',
    (select count(*)::text
     from pg_tables
     where schemaname = 'public'
       and tablename in ('profiles', 'user_roles', 'app_settings', 'admin_audit_logs')
       and rowsecurity)

  -- 3. RLS 정책 ---------------------------------------------------------------
  union all
  select 5, 'RLS 정책 총 11개', '11',
    (select count(*)::text
     from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'user_roles', 'app_settings', 'admin_audit_logs'))

  union all
  select 6, '감사 로그에 쓰기 정책 없음', '0',
    (select count(*)::text
     from pg_policies
     where schemaname = 'public'
       and tablename = 'admin_audit_logs'
       and cmd <> 'SELECT')

  union all
  select 7, 'PUBLIC 대상 정책 없음 (anon 노출 방지)', '0',
    (select count(*)::text
     from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'user_roles', 'app_settings', 'admin_audit_logs')
       and ('public' = any(roles) or 'anon' = any(roles)))

  -- 4. 함수 -------------------------------------------------------------------
  -- SECURITY DEFINER 함수는 소유자 권한으로 실행되어 RLS를 우회할 수 있다.
  -- 그래서 "몇 개인지"가 아니라 "어떤 것들인지"를 확인해야 한다.
  --
  -- public.rls_auto_enable 은 Supabase 플랫폼이 프로젝트 생성 시 설치한 함수다.
  -- public 스키마에 새 테이블이 생기면 RLS를 자동으로 켜주는 이벤트 트리거 함수이며,
  -- 2026-09-20에 함수 본문을 직접 확인했다. 우리가 만든 것이 아니므로 허용 목록에 둔다.
  union all
  select 8, '우리가 만든 DEFINER 함수 7개 모두 존재', '7',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname in (
         'is_admin', 'is_active_user', 'count_admins', 'handle_new_user',
         'audit_profile_status_change', 'audit_user_role_change',
         'audit_app_setting_update'
       ))

  union all
  select 9, '허용 목록 밖의 DEFINER 함수 없음', '0',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname not in (
         'is_admin', 'is_active_user', 'count_admins', 'handle_new_user',
         'audit_profile_status_change', 'audit_user_role_change',
         'audit_app_setting_update',
         'rls_auto_enable'
       ))

  union all
  select 10, 'search_path 고정 안 된 DEFINER 함수 없음', '0',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (p.proconfig is null
            or not exists (
              select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
            )))

  union all
  select 11, '가드 함수가 SECURITY DEFINER 아님 (중요)', '0',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('guard_profile_protected_columns', 'guard_last_admin')
       and p.prosecdef)

  union all
  select 12, '판정 함수 is_admin, is_active_user 존재', '2',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_admin', 'is_active_user'))

  -- 5. 트리거 -----------------------------------------------------------------
  union all
  select 13, 'auth.users 가입 트리거 생성', '1',
    (select count(*)::text
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth'
       and c.relname = 'users'
       and t.tgname = 'on_auth_user_created'
       and not t.tgisinternal)

  union all
  select 14, 'profiles 트리거 3개 (updated_at/가드/감사)', '3',
    (select count(*)::text
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.oid = 'public.profiles'::regclass and not t.tgisinternal)

  union all
  select 15, 'user_roles 트리거 3개', '3',
    (select count(*)::text
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.oid = 'public.user_roles'::regclass and not t.tgisinternal)

  union all
  select 16, 'app_settings 트리거 2개', '2',
    (select count(*)::text
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.oid = 'public.app_settings'::regclass and not t.tgisinternal)

  -- 6. 권한 -------------------------------------------------------------------
  union all
  select 17, 'anon 역할에 테이블 권한 없음', '0',
    (select count(*)::text
     from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public'
       and table_name in ('profiles', 'user_roles', 'app_settings', 'admin_audit_logs'))

  union all
  select 18, 'authenticated의 감사 로그 권한은 SELECT뿐', 'SELECT',
    (select coalesce(string_agg(distinct privilege_type, ','), '(없음)')
     from information_schema.role_table_grants
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name = 'admin_audit_logs')

  union all
  select 19, 'authenticated에 profiles INSERT/DELETE 권한 없음', '0',
    (select count(*)::text
     from information_schema.role_table_grants
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name = 'profiles'
       and privilege_type in ('INSERT', 'DELETE'))

  -- 7. 초기 데이터와 운영 상태 --------------------------------------------------
  union all
  select 20, '신규 가입 승인 필요 설정 초기값 true', 'true',
    (select coalesce((value #>> '{}'), '(행 없음)')
     from public.app_settings
     where key = 'require_user_approval')

  union all
  select 21, '관리자 0명 (자동 부여하지 않음)', '0',
    (select count(*)::text
     from public.user_roles
     where role = 'admin'::public.app_role)

  union all
  select 22, '프로필 0개 (아직 가입자 없음이면 0)', '0',
    (select count(*)::text from public.profiles)

  union all
  select 23, '감사 로그 0건', '0',
    (select count(*)::text from public.admin_audit_logs)
)
select
  순번,
  항목,
  기대,
  실제,
  case when 기대 = 실제 then '통과' else '실패 <<<' end as 결과
from checks
order by 순번;


-- =============================================================================
-- 참고: 순번 21, 22는 이미 로그인한 사용자가 있으면 0이 아닐 수 있다.
--       그 경우 실패가 아니라 정상이다. 아래로 실제 내용을 확인한다.
-- =============================================================================

-- select id, email, status, requested_at from public.profiles order by requested_at;
-- select action, target_user_id, created_at from public.admin_audit_logs order by created_at desc;
