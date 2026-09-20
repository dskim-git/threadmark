-- =============================================================================
-- ThreadMark — 인증·가입 승인 기반 스키마
-- =============================================================================
-- 목적
--   회원가입 후 관리자 승인을 받은 사용자만 서비스를 이용할 수 있는 구조를
--   데이터베이스 수준에서 강제한다. 화면 숨김이 아니라 RLS와 서버 함수로 막는다.
--
-- 설계 원칙
--   1. 권한 판정 기준은 user_roles 테이블이다. 이메일 문자열을 비교하지 않는다.
--   2. 일반 사용자는 자신의 승인 상태와 역할을 스스로 바꿀 수 없다.
--   3. 관리자 확인 함수는 SECURITY DEFINER로 만들어 RLS 정책 재귀를 피한다.
--   4. 승인·역할·설정 변경은 트리거가 자동으로 감사 로그에 기록한다.
--   5. 설정 조회 실패 시 승인 필요(pending)로 처리한다. (fail closed)
--
-- 이 마이그레이션은 auth.users의 데이터나 컬럼을 변경하지 않는다.
-- 가입 시 profiles 행을 만들기 위한 AFTER INSERT 트리거만 추가한다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 사용자 승인 상태. 문자열 오타로 잘못된 상태가 저장되지 않도록 열거형으로 고정한다.
--   pending   : 가입 후 승인 대기. 보호된 앱 데이터에 접근할 수 없다.
--   active    : 승인 완료. 정상 이용 가능.
--   rejected  : 관리자가 거절.
--   suspended : 관리자가 이용 정지.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_status' and n.nspname = 'public'
  ) then
    create type public.user_status as enum ('pending', 'active', 'rejected', 'suspended');
  end if;
end
$$;

-- 애플리케이션 역할.
-- 권한은 "행이 존재하면 부여됨"인 가산 방식이다. 행이 없는 사용자는 일반 사용자다.
-- 현재 특별 권한이 필요한 역할은 admin 하나뿐이므로 값도 하나만 정의한다.
-- 역할이 늘어나면 ALTER TYPE ... ADD VALUE 를 담은 별도 마이그레이션으로 확장한다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('admin');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------

-- 2.1 profiles ---------------------------------------------------------------
-- auth.users 1행당 1행. 승인 상태와 표시용 프로필 정보를 담는다.
-- 역할(role)은 여기에 두지 않는다. 사용자가 자기 행을 수정할 수 있는 테이블에
-- 권한 정보를 두면 권한 상승 위험이 생기기 때문이다. 역할은 user_roles가 담당한다.
create table if not exists public.profiles (
  id                          uuid primary key
                                references auth.users (id) on delete cascade,

  -- 관리자 승인 화면에서 신청자를 식별하기 위해 가입 시점 이메일을 복제 저장한다.
  -- 인증의 기준은 어디까지나 auth.users이며 이 값은 표시용이다.
  email                       text,
  display_name                text,
  avatar_url                  text,

  preferred_language          text        not null default 'ko',
  translation_target_language text        not null default 'ko',
  timezone                    text        not null default 'Asia/Seoul',

  -- 승인 상태와 처리 이력 (개인정보 처리방침 2절 "가입 승인" 항목에 대응)
  status                      public.user_status not null default 'pending',
  status_reason               text,
  status_changed_by           uuid        references auth.users (id) on delete set null,
  requested_at                timestamptz not null default now(),
  approved_at                 timestamptz,
  rejected_at                 timestamptz,
  suspended_at                timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) <= 100
  ),
  constraint profiles_status_reason_length check (
    status_reason is null or char_length(status_reason) <= 500
  )
);

comment on table public.profiles is
  'auth.users에 대응하는 ThreadMark 사용자 프로필과 가입 승인 상태.';
comment on column public.profiles.status is
  '가입 승인 상태. 관리자 또는 서비스 컨텍스트만 변경할 수 있다.';
comment on column public.profiles.status_changed_by is
  '마지막으로 상태를 변경한 관리자. 시스템 자동 처리인 경우 NULL이다.';

create index if not exists profiles_status_requested_at_idx
  on public.profiles (status, requested_at desc);
create index if not exists profiles_email_idx
  on public.profiles (email);


-- 2.2 user_roles -------------------------------------------------------------
-- 권한 부여 기록. (user_id, role) 행이 존재하면 그 역할을 가진 것으로 본다.
create table if not exists public.user_roles (
  user_id    uuid              not null references auth.users (id) on delete cascade,
  role       public.app_role   not null,
  granted_by uuid              references auth.users (id) on delete set null,
  granted_at timestamptz       not null default now(),

  primary key (user_id, role)
);

comment on table public.user_roles is
  '역할 부여 기록. 관리자 판정의 유일한 기준이며 이메일 비교로 대체하지 않는다.';

create index if not exists user_roles_role_idx
  on public.user_roles (role);


-- 2.3 app_settings -----------------------------------------------------------
-- 운영 설정 key-value 저장소. 관리자만 읽고 쓸 수 있다.
create table if not exists public.app_settings (
  key         text        primary key,
  value       jsonb       not null,
  description text,
  updated_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),

  -- 키 이름 형식을 제한해 임의의 값이 섞이지 않게 한다.
  constraint app_settings_key_format check (key ~ '^[a-z][a-z0-9_]*$'),

  -- 알려진 설정에 대해서는 값의 JSON 타입까지 검증한다.
  constraint app_settings_require_user_approval_is_boolean check (
    key <> 'require_user_approval' or jsonb_typeof(value) = 'boolean'
  )
);

comment on table public.app_settings is
  '운영 설정. RLS로 관리자만 조회·변경할 수 있으며 공개 사용자에게 노출하지 않는다.';

-- 신규 가입 승인 필요 설정. 초기값은 true다.
-- 이 행이 없거나 읽지 못하면 승인 필요로 간주한다. (handle_new_user 참고)
insert into public.app_settings (key, value, description)
values (
  'require_user_approval',
  'true'::jsonb,
  '신규 가입자를 pending 상태로 만들지 여부. false면 이후 신규 가입자만 자동 active가 된다.'
)
on conflict (key) do nothing;


-- 2.4 admin_audit_logs -------------------------------------------------------
-- 관리자 행위 감사 로그. 일반 사용자는 생성·수정·삭제할 수 없고 조회도 불가능하다.
-- 기록은 애플리케이션 코드가 아니라 트리거가 남긴다. 누락될 수 없게 하기 위해서다.
create table if not exists public.admin_audit_logs (
  id             uuid        primary key default gen_random_uuid(),

  -- 행위자. 사용자 삭제 후에도 로그를 보존하기 위해 on delete set null을 쓴다.
  -- 서비스 컨텍스트(서버 키·SQL 편집기)에서 발생한 변경은 NULL이 된다.
  actor_id       uuid        references auth.users (id) on delete set null,
  action         text        not null,
  target_user_id uuid        references auth.users (id) on delete set null,
  target_key     text,
  previous_value jsonb,
  new_value      jsonb,
  reason         text,
  created_at     timestamptz not null default now(),

  constraint admin_audit_logs_action_check check (
    action in (
      'user_status_changed',
      'user_role_granted',
      'user_role_revoked',
      'app_setting_updated'
    )
  )
);

comment on table public.admin_audit_logs is
  '승인·역할·설정 변경 감사 로그. 트리거로만 기록되며 append-only로 운영한다.';

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_target_user_idx
  on public.admin_audit_logs (target_user_id, created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 3. 판정 함수
-- -----------------------------------------------------------------------------
-- 아래 두 함수는 RLS 정책 안에서 호출된다.
--
-- SECURITY DEFINER를 쓰는 이유:
--   user_roles의 RLS 정책이 is_admin()을 호출하고, is_admin()이 다시 user_roles를
--   RLS와 함께 읽으면 정책 평가가 무한 재귀한다. 소유자(postgres) 권한으로 실행해
--   RLS를 우회함으로써 이 재귀를 끊는다.
--
-- search_path = '' 를 쓰는 이유:
--   SECURITY DEFINER 함수는 호출자가 search_path를 조작해 동명의 가짜 객체를
--   심을 수 있다. 빈 search_path와 스키마 완전 수식으로 이 공격을 막는다.

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.role = 'admin'::public.app_role
  );
$$;

comment on function public.is_admin(uuid) is
  '관리자 여부. user_roles를 기준으로 판정하며 이메일을 비교하지 않는다.';


create or replace function public.is_active_user(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.status = 'active'::public.user_status
  );
$$;

comment on function public.is_active_user(uuid) is
  '승인 완료(active) 사용자 여부. 보호된 앱 테이블의 RLS 정책에서 재사용한다.';


-- 현재 관리자 수. 마지막 관리자 삭제를 막는 가드 트리거에서 사용한다.
-- 가드 트리거 자체는 SECURITY INVOKER여야 하므로(아래 6절 참고) 집계만 분리했다.
create or replace function public.count_admins()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.user_roles ur
  where ur.role = 'admin'::public.app_role;
$$;


-- -----------------------------------------------------------------------------
-- 4. updated_at 처리
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 5. 가입 시 프로필 생성
-- -----------------------------------------------------------------------------
-- auth.users에 행이 생기면 profiles 행을 만든다.
-- 초기 상태는 app_settings.require_user_approval 값으로 결정한다.
--   true  또는 조회 실패 -> pending
--   false                -> active (자동 승인)
--
-- 설정을 false로 바꿔도 이 트리거는 그 이후 신규 가입자에게만 적용된다.
-- 이미 pending인 사용자는 이 트리거가 다시 실행되지 않으므로 자동 승인되지 않는다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_require_approval boolean;
  v_status           public.user_status;
  v_now              timestamptz := pg_catalog.now();
begin
  -- 설정을 읽지 못하면 v_require_approval은 NULL이 되고 coalesce가 true로 만든다.
  -- 설정 누락이 곧 무제한 가입 허용이 되지 않도록 하는 fail closed 처리다.
  select (s.value #>> '{}')::boolean
    into v_require_approval
  from public.app_settings s
  where s.key = 'require_user_approval';

  if coalesce(v_require_approval, true) then
    v_status := 'pending'::public.user_status;
  else
    v_status := 'active'::public.user_status;
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    avatar_url,
    status,
    requested_at,
    approved_at
  )
  values (
    new.id,
    new.email,
    -- Google OAuth는 full_name 또는 name으로 표시 이름을 전달한다.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    v_status,
    v_now,
    -- 자동 승인된 경우에만 승인 시각을 남긴다. 처리 관리자는 없으므로 NULL이다.
    case when v_status = 'active'::public.user_status then v_now else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  '가입 시 profiles 행을 만든다. 초기 상태는 require_user_approval 설정으로 결정한다.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 6. 권한 상승 방지 가드 트리거
-- -----------------------------------------------------------------------------
-- RLS의 WITH CHECK 식은 OLD 행을 참조할 수 없다. 그래서 "본인 프로필 수정" 정책만
-- 두면 사용자가 자기 status를 active로 바꾸는 것을 RLS만으로는 막을 수 없다.
-- 보호 컬럼의 변경 여부는 BEFORE 트리거에서 OLD와 NEW를 비교해 차단한다.
--
-- 아래 가드 함수들은 의도적으로 SECURITY INVOKER(기본값)다.
-- SECURITY DEFINER로 만들면 current_user가 항상 소유자(postgres)가 되어
-- 서비스 컨텍스트 판별이 무조건 참이 되고 가드가 무력화된다.

create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_protected_changed boolean;
  v_privileged        boolean;
  v_now               timestamptz := pg_catalog.now();
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  v_protected_changed :=
       new.status            is distinct from old.status
    or new.status_reason     is distinct from old.status_reason
    or new.status_changed_by is distinct from old.status_changed_by
    or new.requested_at      is distinct from old.requested_at
    or new.approved_at       is distinct from old.approved_at
    or new.rejected_at       is distinct from old.rejected_at
    or new.suspended_at      is distinct from old.suspended_at
    or new.email             is distinct from old.email;

  if not v_protected_changed then
    return new;
  end if;

  v_privileged :=
       public.is_admin()
    or current_user::text in ('postgres', 'service_role', 'supabase_admin');

  if not v_privileged then
    raise exception
      '승인 상태와 계정 식별 정보는 관리자만 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  -- 관리자 또는 서비스 컨텍스트의 상태 변경이면 처리 이력을 자동으로 남긴다.
  if new.status is distinct from old.status then
    new.status_changed_by := auth.uid();

    if new.status = 'active'::public.user_status then
      new.approved_at := v_now;
    elsif new.status = 'rejected'::public.user_status then
      new.rejected_at := v_now;
    elsif new.status = 'suspended'::public.user_status then
      new.suspended_at := v_now;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_protected_columns();


-- 마지막 관리자가 사라져 아무도 승인 처리를 할 수 없게 되는 상황을 막는다.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'::public.app_role and public.count_admins() <= 1 then
    -- 서비스 컨텍스트에서는 복구 목적의 정리를 허용한다.
    if current_user::text not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception '마지막 관리자 권한은 해제할 수 없습니다.' using errcode = '42501';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists user_roles_guard_last_admin on public.user_roles;
create trigger user_roles_guard_last_admin
  before delete on public.user_roles
  for each row
  execute function public.guard_last_admin();


-- 역할 부여자를 기록한다. 클라이언트가 보낸 granted_by 값을 신뢰하지 않는다.
create or replace function public.stamp_role_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_by := auth.uid();
  new.granted_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists user_roles_stamp_grant on public.user_roles;
create trigger user_roles_stamp_grant
  before insert on public.user_roles
  for each row
  execute function public.stamp_role_grant();


-- 설정 키는 마이그레이션으로만 정의한다. 값 변경 시 변경자와 시각을 기록한다.
create or replace function public.guard_app_setting_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'app_settings.key는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists app_settings_guard_update on public.app_settings;
create trigger app_settings_guard_update
  before update on public.app_settings
  for each row
  execute function public.guard_app_setting_update();


-- -----------------------------------------------------------------------------
-- 7. 감사 로그 트리거
-- -----------------------------------------------------------------------------
-- 감사 기록을 애플리케이션 코드에 맡기면 호출을 빠뜨릴 수 있다.
-- 변경이 일어난 자리에서 트리거가 직접 남긴다.
--
-- authenticated 역할에는 admin_audit_logs INSERT 권한을 주지 않으므로
-- 아래 함수들은 SECURITY DEFINER여야 한다.
-- 서비스 컨텍스트의 변경은 auth.uid()가 없어 actor_id가 NULL로 기록된다.

create or replace function public.audit_profile_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.admin_audit_logs (
      actor_id, action, target_user_id, previous_value, new_value, reason
    )
    values (
      auth.uid(),
      'user_status_changed',
      new.id,
      pg_catalog.jsonb_build_object('status', old.status),
      pg_catalog.jsonb_build_object('status', new.status),
      new.status_reason
    );
  end if;

  return null;
end;
$$;

drop trigger if exists profiles_audit_status_change on public.profiles;
create trigger profiles_audit_status_change
  after update on public.profiles
  for each row
  execute function public.audit_profile_status_change();


create or replace function public.audit_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_audit_logs (
      actor_id, action, target_user_id, new_value
    )
    values (
      auth.uid(),
      'user_role_granted',
      new.user_id,
      pg_catalog.jsonb_build_object('role', new.role)
    );
  elsif tg_op = 'DELETE' then
    insert into public.admin_audit_logs (
      actor_id, action, target_user_id, previous_value
    )
    values (
      auth.uid(),
      'user_role_revoked',
      old.user_id,
      pg_catalog.jsonb_build_object('role', old.role)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists user_roles_audit_change on public.user_roles;
create trigger user_roles_audit_change
  after insert or delete on public.user_roles
  for each row
  execute function public.audit_user_role_change();


create or replace function public.audit_app_setting_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.value is distinct from old.value then
    insert into public.admin_audit_logs (
      actor_id, action, target_key, previous_value, new_value
    )
    values (
      auth.uid(),
      'app_setting_updated',
      new.key,
      old.value,
      new.value
    );
  end if;

  return null;
end;
$$;

drop trigger if exists app_settings_audit_update on public.app_settings;
create trigger app_settings_audit_update
  after update on public.app_settings
  for each row
  execute function public.audit_app_setting_update();


-- -----------------------------------------------------------------------------
-- 8. 테이블 권한
-- -----------------------------------------------------------------------------
-- RLS 이전에 역할 수준 권한부터 최소화한다. RLS는 행을 거르고, GRANT는
-- 애초에 수행 가능한 동작 자체를 제한한다. 두 겹을 모두 사용한다.
--
-- anon(비로그인)에게는 어떤 테이블 권한도 주지 않는다.
-- service_role 권한은 그대로 둔다. 서버 전용 관리 작업에 필요하다.

revoke all on table public.profiles         from anon, authenticated;
revoke all on table public.user_roles       from anon, authenticated;
revoke all on table public.app_settings     from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;

-- profiles: 본인 조회·수정과 관리자 조회·수정에 필요한 만큼만.
-- INSERT는 가입 트리거(SECURITY DEFINER)가 담당하므로 부여하지 않는다.
-- DELETE는 auth.users 삭제 시 cascade로 처리되므로 부여하지 않는다.
grant select, update on table public.profiles to authenticated;

-- user_roles: 역할 변경은 회수 후 재부여로 처리하므로 UPDATE는 부여하지 않는다.
grant select, insert, delete on table public.user_roles to authenticated;

-- app_settings: 키는 마이그레이션으로만 만든다. INSERT/DELETE를 부여하지 않는다.
grant select, update on table public.app_settings to authenticated;

-- admin_audit_logs: 조회만 가능하다. 기록은 SECURITY DEFINER 트리거만 할 수 있다.
grant select on table public.admin_audit_logs to authenticated;


-- 함수 실행 권한도 기본 PUBLIC 부여를 회수하고 필요한 역할에만 준다.
revoke all on function public.is_admin(uuid)       from public;
revoke all on function public.is_active_user(uuid) from public;
revoke all on function public.count_admins()       from public;

grant execute on function public.is_admin(uuid)       to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
-- count_admins는 마지막 관리자 가드 트리거가 호출자 컨텍스트에서 실행한다.
grant execute on function public.count_admins()       to authenticated;

-- 가입 트리거 함수는 Auth 서비스가 호출한다. 그 외에는 실행할 수 없게 한다.
revoke all on function public.handle_new_user() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 9. RLS 활성화
-- -----------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY는 사용하지 않는다. 소유자에게까지 RLS를 적용하면
-- 가입 트리거와 감사 로그 트리거 같은 SECURITY DEFINER 함수가 동작하지 못한다.

alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.app_settings     enable row level security;
alter table public.admin_audit_logs enable row level security;


-- -----------------------------------------------------------------------------
-- 10. RLS 정책
-- -----------------------------------------------------------------------------
-- auth.uid()를 (select auth.uid()) 형태로 감싸는 것은 Supabase 권장 방식이다.
-- 행마다 재평가하지 않고 한 번만 계산한다.
--
-- 정책이 없는 동작은 거부된다. INSERT/DELETE 정책을 일부러 만들지 않은 테이블은
-- 해당 동작이 authenticated에게 전면 차단된다는 뜻이다.

-- 10.1 profiles --------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- 관리자는 승인 처리를 위해 모든 프로필을 조회한다.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- 본인 프로필 수정. 보호 컬럼 변경은 가드 트리거가 막는다. (6절 참고)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 관리자의 승인·거절·정지 처리.
-- USING으로 대상 행 접근을, WITH CHECK로 변경 결과를 모두 관리자로 제한한다.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- 10.2 user_roles ------------------------------------------------------------

-- 본인에게 부여된 역할은 본인이 확인할 수 있다.
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_roles_select_admin on public.user_roles;
create policy user_roles_select_admin
  on public.user_roles
  for select
  to authenticated
  using (public.is_admin());

-- 역할 부여는 관리자만 할 수 있다. 일반 사용자는 스스로 admin이 될 수 없다.
drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin
  on public.user_roles
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists user_roles_delete_admin on public.user_roles;
create policy user_roles_delete_admin
  on public.user_roles
  for delete
  to authenticated
  using (public.is_admin());


-- 10.3 app_settings ----------------------------------------------------------
-- 운영 설정은 관리자만 읽고 쓴다. 비로그인 사용자와 일반 사용자에게는
-- 정책과 GRANT 양쪽에서 모두 차단된다.

drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin
  on public.app_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
  on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- 10.4 admin_audit_logs ------------------------------------------------------
-- 조회는 관리자만. 생성·수정·삭제 정책은 두지 않는다.
-- 트리거(SECURITY DEFINER)만 기록할 수 있으므로 사실상 append-only다.

drop policy if exists admin_audit_logs_select_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_admin
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_admin());


-- =============================================================================
-- 이 마이그레이션은 관리자 권한을 자동으로 부여하지 않는다.
-- 최초 관리자 지정 절차는 docs/ADMIN_BOOTSTRAP.md를 참고한다.
-- =============================================================================
