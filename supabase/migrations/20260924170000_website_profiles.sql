-- =============================================================================
-- 웹사이트 자료 (15-C)
-- =============================================================================
-- 설계 문서 11.1절의 등록 정보, 20절의 `website_profiles`.
--
-- 대부분은 이미 sources에 있다
--   11.1절의 목록 열셋 중 여덟은 sources가 이미 담고 있다.
--
--     URL            sources.original_url
--     canonical URL  sources.canonical_url
--     페이지 제목    sources.title
--     설명           sources.description
--     OG 이미지      sources.thumbnail_url
--     저장일         sources.created_at
--     사용자 메모    captures (기록으로 남긴다)
--     프로젝트·태그  source_projects, source_tags
--
--   그래서 이 표에는 **나머지 넷**만 둔다. 사이트명, 작성자, 게시일,
--   favicon이다. 같은 값을 두 곳에 두면 어느 쪽이 맞는지 알 수 없게 된다.
--
-- 게시일을 글로 담는다
--   `2026-09-23T10:00:00Z`도 오고 `2026년 9월 23일`도 오고 `Sep 23, 2026`도
--   온다. 날짜로 바꿔 담으려면 못 알아본 값을 버려야 하는데, **버리는 것보다
--   적힌 그대로 보여주는 쪽이 낫다.** 정렬에 쓰지 않는 값이다.
--   paper_profiles가 권·호·쪽을 글로 담은 것과 같은 판단이다.
--
-- 언제 받아왔는지 남긴다
--   웹페이지는 바뀐다. 지금 보이는 제목이 언제 받아온 것인지 모르면,
--   사이트가 글을 고친 뒤에도 우리는 옛 제목을 사실처럼 보여준다.
--   `fetched_at`이 "이 값은 그때의 것"이라고 말한다.
--
-- 받아온 값을 믿지 않는다
--   전부 남이 쓴 글이다. 길이를 제약조건으로 막고, 주소 자리에는 http와
--   https만 받는다. favicon 자리에 `javascript:`가 오는 일이 실제로 있다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.website_profiles (
  id           uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,

  -- 자료 하나에 웹사이트 정보는 하나다.
  source_id    uuid not null unique
                 references public.sources (id) on delete cascade,

  -- 사이트 이름. `og:site_name`이다.
  site_name    text,
  author       text,

  -- 게시일. 적힌 그대로 담는다. (머리말 참고)
  published_at text,

  favicon_url  text,

  -- 이 값들을 언제 받아왔는지. 웹페이지는 바뀐다.
  fetched_at   timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint website_profiles_site_name_length check (
    site_name is null or char_length(site_name) <= 500
  ),
  constraint website_profiles_author_length check (
    author is null or char_length(author) <= 500
  ),
  constraint website_profiles_published_at_length check (
    published_at is null or char_length(published_at) <= 500
  ),
  constraint website_profiles_favicon_url_length check (
    favicon_url is null or char_length(favicon_url) <= 2000
  ),
  -- 주소 자리에는 http와 https만. `javascript:`가 화면의 링크에 들어가면
  -- 누르는 순간 실행된다. 화면도 막지만 여기서도 막는다.
  constraint website_profiles_favicon_url_scheme check (
    favicon_url is null
    or favicon_url like 'http://%'
    or favicon_url like 'https://%'
  )
);

comment on table public.website_profiles is
  '웹사이트 자료의 추가 정보. sources가 담지 않는 넷만 둔다. (설계 문서 11.1절)';
comment on column public.website_profiles.published_at is
  '게시일. 모양이 제각각이라 글로 담는다. 정렬에 쓰지 않는다.';
comment on column public.website_profiles.fetched_at is
  '이 값들을 받아온 시각. 웹페이지는 바뀌므로 언제의 값인지 남긴다.';

create index if not exists website_profiles_owner_idx
  on public.website_profiles (owner_id);


-- -----------------------------------------------------------------------------
-- 2. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 이 확인이 없으면 자료 id만 알면 남의
-- 자료에 웹사이트 정보를 붙일 수 있다.
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_website_profile_owner()
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

drop trigger if exists website_profiles_set_owner on public.website_profiles;
create trigger website_profiles_set_owner
  before insert on public.website_profiles
  for each row
  execute function public.set_website_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  source_id를 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 사이트를 두고
  적은 정보가 B 사이트의 것이 된다.
*/
create or replace function public.guard_website_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'website_profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'website_profiles.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'website_profiles.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'website_profiles.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists website_profiles_guard_immutable_columns
  on public.website_profiles;
create trigger website_profiles_guard_immutable_columns
  before update on public.website_profiles
  for each row
  execute function public.guard_website_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.website_profiles from anon, authenticated;

grant select, insert, update, delete on table public.website_profiles
  to authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.website_profiles enable row level security;

drop policy if exists website_profiles_select_own on public.website_profiles;
create policy website_profiles_select_own
  on public.website_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists website_profiles_insert_own on public.website_profiles;
create policy website_profiles_insert_own
  on public.website_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists website_profiles_update_own on public.website_profiles;
create policy website_profiles_update_own
  on public.website_profiles
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

drop policy if exists website_profiles_delete_own on public.website_profiles;
create policy website_profiles_delete_own
  on public.website_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
