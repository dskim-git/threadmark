-- =============================================================================
-- 최초 관리자 부트스트랩 검증
-- =============================================================================
-- 대상 절차: docs/ADMIN_BOOTSTRAP.md
--
-- 사용법
--   부트스트랩 SQL을 실행한 뒤, Supabase 대시보드 SQL Editor에 이 파일 전체를
--   붙여넣고 실행한다. "결과" 열이 모두 통과여야 한다.
--
-- 이 스크립트는 읽기 전용이다. 어떤 데이터도 생성·수정·삭제하지 않는다.
-- supabase/migrations 폴더 밖에 있으므로 db push 대상이 아니다.
--
-- 여기서는 1단계에 만든 장치들이 실제로 동작했는지도 함께 확인한다.
--   - 가드 트리거가 서비스 컨텍스트의 상태 변경을 허용했는가
--   - 감사 트리거가 권한 부여와 상태 변경을 자동으로 기록했는가
--   - is_admin(), is_active_user()가 기대대로 판정하는가
-- =============================================================================

with admin_user as (
  select ur.user_id
  from public.user_roles ur
  where ur.role = 'admin'::public.app_role
  order by ur.granted_at
  limit 1
),
checks(순번, 항목, 기대, 실제) as (

  -- 1. 권한 부여 -----------------------------------------------------------
  select 1, '관리자 1명', '1',
    (select count(*)::text
     from public.user_roles
     where role = 'admin'::public.app_role)

  union all
  select 2, 'is_admin() 판정 통과', 'true',
    coalesce(
      (select public.is_admin(a.user_id)::text from admin_user a),
      '(관리자 없음)'
    )

  -- 2. 승인 상태 -----------------------------------------------------------
  union all
  select 3, '관리자 계정 상태가 active', 'active',
    coalesce(
      (select p.status::text
       from public.profiles p
       join admin_user a on a.user_id = p.id),
      '(관리자 없음)'
    )

  union all
  select 4, '승인 시각이 기록됨', 'true',
    coalesce(
      (select (p.approved_at is not null)::text
       from public.profiles p
       join admin_user a on a.user_id = p.id),
      '(관리자 없음)'
    )

  union all
  select 5, 'is_active_user() 판정 통과', 'true',
    coalesce(
      (select public.is_active_user(a.user_id)::text from admin_user a),
      '(관리자 없음)'
    )

  -- 3. 감사 로그 -----------------------------------------------------------
  -- 애플리케이션이 아니라 트리거가 남긴 기록이다.
  union all
  select 6, '역할 부여가 감사 로그에 기록됨', '1',
    (select count(*)::text
     from public.admin_audit_logs
     where action = 'user_role_granted')

  union all
  select 7, '상태 변경이 감사 로그에 기록됨', 'true',
    (select (count(*) >= 1)::text
     from public.admin_audit_logs
     where action = 'user_status_changed')

  -- 4. 운영 설정이 바뀌지 않았는지 ---------------------------------------------
  -- 부트스트랩은 한 계정만 승인한다. 가입 승인 정책 자체를 바꾸지 않는다.
  union all
  select 8, '신규 가입 승인 필요 설정 유지', 'true',
    coalesce(
      (select (value #>> '{}')
       from public.app_settings
       where key = 'require_user_approval'),
      '(행 없음)'
    )
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
-- 참고: 감사 로그 내용을 직접 확인하려면 아래를 실행한다.
--       서비스 컨텍스트에서 실행한 변경이므로 actor_id는 NULL이 정상이다.
-- =============================================================================

-- select action, target_user_id, previous_value, new_value, reason, actor_id, created_at
-- from public.admin_audit_logs
-- order by created_at;
