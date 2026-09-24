-- =============================================================================
-- 책 자료 (15-E-2a)
-- =============================================================================
-- 설계 문서 12절.
--
-- 이 표에는 두 갈래의 값이 들어온다
--   밖에서 가져오는 것   저자, 번역자, 출판사, 출판일, ISBN
--   사용자가 적는 것     소장 형태, 읽기 상태, 현재 쪽, 총 쪽수,
--                        시작일·완료일, 고른 이유, 다 읽고 난 평가
--
--   **이 구분이 이 표에서 가장 중요하다.** 15-E에서 한 번 부딪힌 자리다.
--   "적어둔 것을 덮지 않는다"를 뭉뚱그려 걸었더니 방금 우리가 채운 값까지
--   지켜버려 곡을 바꿀 수 없었다. 지킬 것은 *사용자가 적은 값*이고
--   *우리가 채운 값*이 아니다.
--
--   위 두 줄을 컬럼 주석에도 남긴다. 나중에 채우는 코드를 쓰는 사람이
--   무엇을 덮어도 되는지 표에서 바로 알 수 있어야 한다.
--
-- 대부분은 이미 sources에 있다
--   책 제목      sources.title
--   부제         sources.subtitle
--   책 소개      sources.description
--   표지 그림    sources.thumbnail_url
--   상품 페이지  sources.original_url
--   담은 날      sources.created_at
--   메모         captures
--   프로젝트·태그 source_projects, source_tags
--
--   그래서 여기에는 나머지만 둔다. 같은 값을 두 곳에 두면 어느 쪽이 맞는지
--   알 수 없게 된다. website_profiles와 같은 판단이다.
--
-- 출판일을 글로 담는다
--   `2017-03-24`도 오고 `2017년 3월`도 오고 `2017`만 오기도 한다. 날짜로
--   바꿔 담으려면 못 알아본 값을 버려야 하는데, **버리는 것보다 적힌 그대로
--   보여주는 쪽이 낫다.** paper_profiles가 권·호·쪽을, website_profiles가
--   게시일을 글로 담은 것과 같다.
--
--   반대로 시작일·완료일은 날짜로 담는다. **사용자가 달력에서 고르는
--   값이고 "며칠 걸렸나"를 세는 데 쓴다.** 밖에서 온 값이 아니라 모양이
--   제각각일 이유가 없다.
--
-- ISBN을 둘로 나눠 담는다
--   열 자리와 열세 자리가 따로 쓰인다. 서점마다 요구하는 것이 다르고,
--   한 칸에 몰아넣으면 어느 쪽인지 되묻게 된다. 숫자만 남겨 담는다.
--
-- 열거형은 지금 화면이 쓰는 값만 만든다
--   AGENTS.md 2절. 쓰지 않을 값을 미리 넣으면 "이게 무슨 뜻이었지"만 남는다.
--   나중에 ALTER TYPE ... ADD VALUE로 늘린다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 읽기 상태. 세 값 모두 화면이 쓴다.
--   unread    아직 안 읽음. 사두고 쌓아둔 것도 여기다
--   reading   읽는 중. 현재 쪽과 함께 쓰인다
--   finished  다 읽음. 완료일과 평가가 여기서 의미를 가진다
--
-- 기본값은 unread다. 담는 순간에는 아직 읽지 않은 것이 보통이고,
-- 모르는 상태를 "읽는 중"으로 두면 목록이 거짓말을 한다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'book_reading_status' and n.nspname = 'public'
  ) then
    create type public.book_reading_status as enum (
      'unread',
      'reading',
      'finished'
    );
  end if;
end
$$;

-- 소장 형태. 어떤 꼴로 가지고 있는지.
--   paper     종이책
--   ebook     전자책
--   borrowed  빌린 책. 도서관이든 남의 것이든
--
-- borrowed를 따로 두는 이유가 있다. **돌려줘야 하는 책은 읽는 순서가
-- 달라진다.** 종이책인지 전자책인지보다 그것이 먼저 눈에 띄어야 한다.
--
-- 값을 비워둘 수 있다(null). 어떤 꼴인지 적고 싶지 않은 책이 대부분이다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'book_holding' and n.nspname = 'public'
  ) then
    create type public.book_holding as enum (
      'paper',
      'ebook',
      'borrowed'
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 1-2. 이름 목록 검사
-- -----------------------------------------------------------------------------
-- **`CHECK` 안에는 서브쿼리를 쓸 수 없다.** 배열의 칸마다 길이를 보려면
-- `unnest`가 필요하고 그것이 서브쿼리다. 그래서 함수로 빼고 `CHECK`는 그
-- 함수를 부른다. `paper_authors_valid`가 같은 이유로 그렇게 되어 있다.
--
-- 개수만 보지 않고 칸마다 본다. 저자 이름은 **밖에서 온 값**이라, 하나가
-- 통째로 길어도 개수 검사는 통과한다.
--
-- 화면과 zod 스키마도 같은 규칙을 본다. 여기의 검사는 그 둘을 거치지 않은
-- 요청을 막는다.

create or replace function public.book_names_valid(value text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    pg_catalog.array_length(value, 1) is null
    or (
      pg_catalog.array_length(value, 1) <= 50
      and not exists (
        select 1
        from pg_catalog.unnest(value) as name
        where name is null
           or pg_catalog.length(pg_catalog.btrim(name)) = 0
           or pg_catalog.length(name) > 200
      )
    );
$$;

comment on function public.book_names_valid(text[]) is
  '저자·번역자 이름 목록의 모양을 확인한다. 개수와 칸마다의 길이를 본다.';


-- -----------------------------------------------------------------------------
-- 2. 표
-- -----------------------------------------------------------------------------

create table if not exists public.book_profiles (
  id             uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id       uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,

  -- 자료 하나에 책 정보는 하나다.
  source_id      uuid not null unique
                   references public.sources (id) on delete cascade,

  -- ---------------------------------------------------------------------------
  -- 밖에서 가져오는 값. 사용자가 후보를 고르면 이 칸들을 덮어도 된다.
  -- ---------------------------------------------------------------------------

  -- 저자와 번역자. 여럿이므로 배열로 담는다. 한 칸에 쉼표로 이어 담으면
  -- 이름 안의 쉼표와 구분되지 않고, 나중에 한 명만 고치기도 어렵다.
  authors        text[] not null default '{}',
  translators    text[] not null default '{}',

  publisher      text,

  -- 출판일. 적힌 그대로 담는다. (머리말 참고)
  published_on   text,

  -- 숫자만 남겨 담는다. 하이픈이 섞여 오면 같은 책이 둘로 보인다.
  isbn10         text,
  isbn13         text,

  -- 어디서 가져온 값인지. 밝히지 않으면 "왜 이렇게 나오지"를 묻게 된다.
  -- (AGENTS.md 2절, 15-E)
  metadata_source text,
  fetched_at      timestamptz,

  -- ---------------------------------------------------------------------------
  -- 사용자가 적는 값. **밖에서 가져온 것으로 덮지 않는다.**
  -- ---------------------------------------------------------------------------

  holding        public.book_holding,
  reading_status public.book_reading_status not null default 'unread',

  -- 총 쪽수는 Kakao가 주지 않는다. 사용자가 적는다.
  total_pages    integer,
  current_page   integer,

  started_on     date,
  finished_on    date,

  -- 왜 이 책을 골랐는가. 다 읽고 나면 기억나지 않는다.
  why_chosen     text,
  -- 다 읽고 난 평가. 기록(captures)과 다르다. 책 한 권에 하나다.
  verdict        text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- 길이 제약. 밖에서 온 값은 남이 쓴 글이다.
  constraint book_profiles_publisher_length check (
    publisher is null or char_length(publisher) <= 300
  ),
  constraint book_profiles_published_on_length check (
    published_on is null or char_length(published_on) <= 100
  ),
  constraint book_profiles_metadata_source_length check (
    metadata_source is null or char_length(metadata_source) <= 100
  ),
  constraint book_profiles_why_chosen_length check (
    why_chosen is null or char_length(why_chosen) <= 2000
  ),
  constraint book_profiles_verdict_length check (
    verdict is null or char_length(verdict) <= 5000
  ),

  -- ISBN은 숫자만, 정해진 길이로. 마지막 자리가 X인 ISBN-10이 있다.
  constraint book_profiles_isbn10_format check (
    isbn10 is null or isbn10 ~ '^[0-9]{9}[0-9X]$'
  ),
  constraint book_profiles_isbn13_format check (
    isbn13 is null or isbn13 ~ '^[0-9]{13}$'
  ),

  -- 이름 하나가 통째로 이상하게 긴 것을 막는다. 개수만이 아니라 칸마다 본다.
  -- CHECK 안에는 서브쿼리를 쓸 수 없어서 함수로 뺐다. (위 1-2절)
  constraint book_profiles_authors_shape check (
    public.book_names_valid(authors)
  ),
  constraint book_profiles_translators_shape check (
    public.book_names_valid(translators)
  ),

  -- 쪽수는 0 이상이다. 위쪽 한계는 두지 않는다. 전집 한 권으로 묶인
  -- 책이 실제로 있고, 우리가 정한 숫자에 걸려 못 적는 편이 더 나쁘다.
  constraint book_profiles_total_pages_range check (
    total_pages is null or total_pages >= 0
  ),
  constraint book_profiles_current_page_range check (
    current_page is null or current_page >= 0
  ),

  /*
    현재 쪽이 총 쪽수를 넘지 않는다.

    둘 다 적힌 경우에만 본다. 총 쪽수를 모르고 읽는 중일 수 있다.

    넘는 값을 막는 이유는 진행률 때문이다. 화면이 `현재/총`으로 막대를
    그리는데 넘으면 막대가 칸 밖으로 나간다. 무엇보다 사용자가 두 칸 중
    하나를 잘못 적었다는 뜻이라, 조용히 받아두면 나중에 고칠 기회가 없다.
  */
  constraint book_profiles_page_progress check (
    total_pages is null
    or current_page is null
    or current_page <= total_pages
  ),

  /*
    다 읽은 날이 시작한 날보다 앞설 수 없다.

    둘 다 적힌 경우에만 본다. 같은 날일 수는 있다. 하루에 다 읽는 책이 있다.
  */
  constraint book_profiles_reading_period check (
    started_on is null
    or finished_on is null
    or finished_on >= started_on
  )
);

comment on table public.book_profiles is
  '책 자료의 상세 정보와 읽기 기록. sources가 담지 않는 것만 둔다. (설계 문서 12절)';
comment on column public.book_profiles.authors is
  '저자. 밖에서 가져오는 값이며 후보를 고르면 덮어도 된다.';
comment on column public.book_profiles.published_on is
  '출판일. 모양이 제각각이라 글로 담는다. 정렬에 쓰지 않는다.';
comment on column public.book_profiles.metadata_source is
  '이 값들을 어디서 가져왔는지. 화면이 출처를 밝히는 데 쓴다.';
comment on column public.book_profiles.reading_status is
  '읽기 상태. 사용자가 적는 값이며 밖에서 가져온 것으로 덮지 않는다.';
comment on column public.book_profiles.why_chosen is
  '이 책을 고른 이유. 사용자가 적는 값이다.';
comment on column public.book_profiles.verdict is
  '다 읽고 난 평가. 기록(captures)과 달리 책 한 권에 하나다.';

create index if not exists book_profiles_owner_idx
  on public.book_profiles (owner_id);

-- "읽는 중인 책"을 모아 보는 화면이 쓴다.
create index if not exists book_profiles_owner_status_idx
  on public.book_profiles (owner_id, reading_status);

-- ISBN으로 이미 담은 책인지 찾는다. 같은 책을 두 번 담는 일을 줄인다.
create index if not exists book_profiles_isbn13_idx
  on public.book_profiles (owner_id, isbn13)
  where isbn13 is not null;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 이 확인이 없으면 자료 id만 알면 남의
-- 자료에 책 정보를 붙일 수 있다.
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_book_profile_owner()
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

drop trigger if exists book_profiles_set_owner on public.book_profiles;
create trigger book_profiles_set_owner
  before insert on public.book_profiles
  for each row
  execute function public.set_book_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  source_id를 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 책을 두고
  적은 읽기 기록이 B 책의 것이 된다.
*/
create or replace function public.guard_book_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'book_profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'book_profiles.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'book_profiles.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'book_profiles.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists book_profiles_guard_immutable_columns
  on public.book_profiles;
create trigger book_profiles_guard_immutable_columns
  before update on public.book_profiles
  for each row
  execute function public.guard_book_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.book_profiles from anon, authenticated;

grant select, insert, update, delete on table public.book_profiles
  to authenticated;

-- 검사 함수는 기본 PUBLIC 부여를 회수하고 필요한 역할에만 준다.
revoke all on function public.book_names_valid(text[]) from public;
grant execute on function public.book_names_valid(text[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.book_profiles enable row level security;

drop policy if exists book_profiles_select_own on public.book_profiles;
create policy book_profiles_select_own
  on public.book_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists book_profiles_insert_own on public.book_profiles;
create policy book_profiles_insert_own
  on public.book_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists book_profiles_update_own on public.book_profiles;
create policy book_profiles_update_own
  on public.book_profiles
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

drop policy if exists book_profiles_delete_own on public.book_profiles;
create policy book_profiles_delete_own
  on public.book_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
