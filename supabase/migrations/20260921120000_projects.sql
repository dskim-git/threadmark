-- =============================================================================
-- ThreadMark — Project 테이블과 연결
-- =============================================================================
-- 목적
--   Project는 자료를 모아두는 폴더가 아니라 활용 목적을 나타낸다. (설계 문서 7절)
--   논문 한 편이 여러 프로젝트에 쓰일 수 있으므로 연결은 다대다다.
--
-- 이번 마이그레이션의 핵심 위험
--   연결 테이블은 서로 다른 두 표의 행을 이어붙인다.
--   외래키 제약은 RLS를 보지 않으므로, 한쪽만 확인하면 다음이 가능해진다.
--
--     내 프로젝트 + 남의 자료  →  남의 자료를 내 프로젝트에 편입
--     남의 프로젝트 + 내 자료  →  남의 프로젝트에 내 자료를 밀어넣음
--
--   그래서 연결을 만들 때 양쪽 모두 같은 소유자인지 확인한다.
--
-- 함께 정리하는 것
--   10단계의 assert_capture_source_owned를 assert_source_owned로 바꾼다.
--   하는 일은 "이 자료가 이 사람 것인가"인데, 이름이 Capture 전용처럼 보여
--   source_projects에서 재사용하기 어렵다.
--
-- 이번 마이그레이션에 포함하지 않은 것
--   - paper_project_uses (논문 기능 단계)
--   - 태그
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 소유 확인 함수
-- -----------------------------------------------------------------------------
-- 셋 다 SECURITY INVOKER(기본값)다. 호출자 권한으로 읽으면 RLS가 이미 남의 행을
-- 숨기므로 확인이 이중으로 걸린다. DEFINER로 바꾸면 그 보호가 사라진다.

create or replace function public.assert_source_owned(
  p_source_id uuid,
  p_owner_id  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_source_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.sources s
    where s.id = p_source_id
      and s.owner_id = p_owner_id
      and s.deleted_at is null
  ) then
    raise exception '연결할 자료를 찾을 수 없습니다.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_capture_owned(
  p_capture_id uuid,
  p_owner_id   uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_capture_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.captures c
    where c.id = p_capture_id
      and c.owner_id = p_owner_id
      and c.deleted_at is null
  ) then
    raise exception '연결할 기록을 찾을 수 없습니다.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_source_owned(uuid, uuid) from public;
revoke all on function public.assert_capture_owned(uuid, uuid) from public;

grant execute on function public.assert_source_owned(uuid, uuid) to authenticated;
grant execute on function public.assert_capture_owned(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. 열거형
-- -----------------------------------------------------------------------------

-- 프로젝트 상태. 설계 문서 7절에 필드 이름만 있고 값이 정의되어 있지 않다.
-- 완료나 보관 같은 값은 그 처리 화면까지 함께 정해야 의미가 생기므로,
-- 실제로 필요해질 때 추가한다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'project_status' and n.nspname = 'public'
  ) then
    create type public.project_status as enum ('active');
  end if;
end
$$;

-- 공개 범위. 설계 문서 2.5절에 따라 기본이자 현재 유일한 값은 private다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'project_visibility' and n.nspname = 'public'
  ) then
    create type public.project_visibility as enum ('private');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. projects
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),

  owner_id          uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,

  name              text not null,
  -- 프로젝트 유형. 설계 문서의 예시가 논문, 수업, 연수, 웹앱 개발처럼 서로 달라
  -- 열거형으로 묶으면 추측이 된다. 사용자가 직접 적게 둔다.
  project_type      text,
  description       text,

  status            public.project_status     not null default 'active',
  visibility        public.project_visibility not null default 'private',

  start_date        date,
  end_date          date,

  -- 목록에서 프로젝트를 빠르게 구분하기 위한 색.
  color             text,

  -- 설계 문서 7절의 연구 질문과 목표 산출물.
  research_question text,
  target_output     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint projects_name_length check (
    char_length(name) between 1 and 200
  ),
  constraint projects_project_type_length check (
    project_type is null or char_length(project_type) <= 100
  ),
  constraint projects_description_length check (
    description is null or char_length(description) <= 5000
  ),
  constraint projects_research_question_length check (
    research_question is null or char_length(research_question) <= 2000
  ),
  constraint projects_target_output_length check (
    target_output is null or char_length(target_output) <= 2000
  ),
  constraint projects_color_format check (
    color is null or color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint projects_date_order check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

comment on table public.projects is
  '자료를 활용하는 목적 단위. 하나의 자료와 기록이 여러 프로젝트에 연결될 수 있다.';

create index if not exists projects_owner_created_idx
  on public.projects (owner_id, created_at desc)
  where deleted_at is null;


create or replace function public.set_project_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists projects_set_owner on public.projects;
create trigger projects_set_owner
  before insert on public.projects
  for each row
  execute function public.set_project_owner();


create or replace function public.guard_project_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'projects.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'projects.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'projects.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists projects_guard_immutable_columns on public.projects;
create trigger projects_guard_immutable_columns
  before update on public.projects
  for each row
  execute function public.guard_project_immutable_columns();


-- 프로젝트 소유 확인. 표가 만들어진 뒤에 정의한다.
-- 위의 두 함수와 마찬가지로 SECURITY INVOKER다.
create or replace function public.assert_project_owned(
  p_project_id uuid,
  p_owner_id   uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_project_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = p_owner_id
      and p.deleted_at is null
  ) then
    raise exception '연결할 프로젝트를 찾을 수 없습니다.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_project_owned(uuid, uuid) from public;
grant execute on function public.assert_project_owned(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. 연결 테이블
-- -----------------------------------------------------------------------------
-- owner_id를 연결 행에도 둔다. 이 값이 있어야 RLS가 다른 표를 뒤지지 않고
-- 연결 자체만 보고 판단할 수 있다. 양쪽이 같은 소유자인지는 트리거가 확인한다.

create table if not exists public.source_projects (
  source_id  uuid not null references public.sources (id)  on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (source_id, project_id)
);

comment on table public.source_projects is
  '자료와 프로젝트의 연결. 양쪽이 같은 소유자인지 트리거가 확인한다.';

create index if not exists source_projects_project_idx
  on public.source_projects (project_id, created_at desc);
create index if not exists source_projects_owner_idx
  on public.source_projects (owner_id);


create table if not exists public.capture_projects (
  capture_id uuid not null references public.captures (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (capture_id, project_id)
);

comment on table public.capture_projects is
  '기록과 프로젝트의 연결. 양쪽이 같은 소유자인지 트리거가 확인한다.';

create index if not exists capture_projects_project_idx
  on public.capture_projects (project_id, created_at desc);
create index if not exists capture_projects_owner_idx
  on public.capture_projects (owner_id);


-- 연결을 만들 때 양쪽 모두 내 것인지 확인한다.
-- 소유자 확정과 확인을 한 함수에 두는 이유는 10단계와 같다.
-- 트리거를 나누면 이름 순서에 따라 확인이 먼저 일어날 수 있다.
create or replace function public.set_source_project_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  perform public.assert_source_owned(new.source_id, new.owner_id);
  perform public.assert_project_owned(new.project_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists source_projects_set_link on public.source_projects;
create trigger source_projects_set_link
  before insert on public.source_projects
  for each row
  execute function public.set_source_project_link();


create or replace function public.set_capture_project_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  perform public.assert_capture_owned(new.capture_id, new.owner_id);
  perform public.assert_project_owned(new.project_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists capture_projects_set_link on public.capture_projects;
create trigger capture_projects_set_link
  before insert on public.capture_projects
  for each row
  execute function public.set_capture_project_link();


-- -----------------------------------------------------------------------------
-- 5. 삭제 표시 함수
-- -----------------------------------------------------------------------------
-- sources, captures와 같은 이유로 필요하다. 조회 정책이 삭제되지 않은 행만
-- 통과시키는데, PostgREST는 갱신을 항상 RETURNING으로 감싸기 때문이다.

create or replace function public.soft_delete_project(project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_updated integer;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not public.is_active_user(v_user) then
    raise exception '승인된 계정만 프로젝트를 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  -- owner_id 조건이 이 함수의 유일한 접근 통제다.
  update public.projects
  set deleted_at = pg_catalog.now()
  where id = project_id
    and owner_id = v_user
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;

comment on function public.soft_delete_project(uuid) is
  '프로젝트에 삭제 표시를 남긴다. 소유자 본인과 승인된 계정만 수행할 수 있다.';

revoke all on function public.soft_delete_project(uuid) from public;
grant execute on function public.soft_delete_project(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. 권한
-- -----------------------------------------------------------------------------

revoke all on table public.projects         from anon, authenticated;
revoke all on table public.source_projects  from anon, authenticated;
revoke all on table public.capture_projects from anon, authenticated;

grant select, insert, update, delete on table public.projects to authenticated;

-- 연결은 만들거나 끊는 것뿐이다. 고칠 것이 없으므로 UPDATE를 부여하지 않는다.
grant select, insert, delete on table public.source_projects  to authenticated;
grant select, insert, delete on table public.capture_projects to authenticated;


-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------

alter table public.projects         enable row level security;
alter table public.source_projects  enable row level security;
alter table public.capture_projects enable row level security;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own
  on public.projects
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and deleted_at is null
    and public.is_active_user()
  );

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
  on public.projects
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own
  on public.projects
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  )
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own
  on public.projects
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


drop policy if exists source_projects_select_own on public.source_projects;
create policy source_projects_select_own
  on public.source_projects
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_projects_insert_own on public.source_projects;
create policy source_projects_insert_own
  on public.source_projects
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_projects_delete_own on public.source_projects;
create policy source_projects_delete_own
  on public.source_projects
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


drop policy if exists capture_projects_select_own on public.capture_projects;
create policy capture_projects_select_own
  on public.capture_projects
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists capture_projects_insert_own on public.capture_projects;
create policy capture_projects_insert_own
  on public.capture_projects
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists capture_projects_delete_own on public.capture_projects;
create policy capture_projects_delete_own
  on public.capture_projects
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


-- -----------------------------------------------------------------------------
-- 8. 10단계 함수 정리
-- -----------------------------------------------------------------------------
-- assert_capture_source_owned가 하던 일을 assert_source_owned가 이어받는다.
-- Capture 트리거가 새 함수를 쓰도록 다시 만든 뒤 옛 함수를 지운다.

create or replace function public.set_capture_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();

  perform public.assert_source_owned(new.source_id, new.owner_id);

  return new;
end;
$$;

create or replace function public.guard_capture_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'captures.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'captures.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'captures.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  if new.source_id is distinct from old.source_id then
    perform public.assert_source_owned(new.source_id, new.owner_id);
  end if;

  return new;
end;
$$;

drop function if exists public.assert_capture_source_owned(uuid, uuid);
