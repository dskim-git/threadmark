-- =============================================================================
-- 논문 정보 (14-A)
-- =============================================================================
-- 설계 문서 8.1절, 20절의 `paper_profiles`.
--
-- sources는 모든 자료가 공통으로 갖는 것만 담는다. 논문에만 있는 것 — 저자,
-- 학술지, 권·호, DOI — 은 여기에 둔다. 5.2절이 "검색·정렬·관계에 쓰이는 값은
-- metadata에 두지 않고 유형별 프로필 테이블에 둔다"고 한 그 자리다.
--
-- 제목과 원문 주소는 여기에 다시 담지 않는다. sources.title과
-- sources.original_url이 이미 있다. 두 곳에 두면 한쪽만 고쳐진다.
--
-- 참고문헌 문자열을 저장하지 않는 이유
--   8.1절: "APA 문자열만 저장하지 않는다. 구조화된 메타데이터로 APA를 생성하고
--   사용자가 수정한 override를 별도로 보관한다."
--
--   문자열만 저장하면 표기 규칙이 바뀌거나 저자 이름에 오타를 발견했을 때
--   기록을 하나하나 고쳐야 한다. 조각으로 저장해 두면 다시 만들면 된다.
--   그래서 이 표에는 만들어진 참고문헌이 없고, 사람이 고친 것만 있다.
--   13-C에서 기계 번역과 사람이 손본 번역을 나눈 것과 같은 생각이다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 저자 형태 검사
-- -----------------------------------------------------------------------------
-- 저자를 통짜 문자열로 담지 않는 이유가 APA에 있다.
-- APA 7판은 영문 저자를 `Kim, D.`처럼 성과 이름을 갈라 적는다.
-- "Daesoo Kim"만 들고 있으면 어디까지가 성인지 우리가 알 수 없다.
-- 사람 이름은 규칙으로 가를 수 없다. 넣을 때 갈라 받아야 한다.
--
-- 모양
--   [{"family": "Kim", "given": "Daesoo"}, {"family": "한국교육과정평가원"}]
--
--   given이 없으면 그 이름을 그대로 쓴다. 기관 저자와 외자 이름이 그렇다.
--   기관을 위한 자리를 따로 만들지 않는다. "이름을 가를 수 없는 저자"는
--   기관이든 사람이든 다루는 방법이 같다.
--
-- 화면과 zod 스키마도 같은 규칙을 확인한다. 여기의 검사는 그 둘을 거치지 않은
-- 요청을 막는다. 저자가 무너지면 참고문헌을 만들 수 없다.
create or replace function public.paper_authors_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    pg_catalog.jsonb_typeof(value) = 'array'
    and pg_catalog.jsonb_array_length(value) <= 100
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(value) as author
      where pg_catalog.jsonb_typeof(author) <> 'object'
         -- family는 반드시 있고 비어 있지 않은 문자열이어야 한다.
         or pg_catalog.jsonb_typeof(author -> 'family') is distinct from 'string'
         or pg_catalog.length(pg_catalog.btrim(author ->> 'family')) = 0
         or pg_catalog.length(author ->> 'family') > 200
         -- given은 없어도 되지만, 있다면 문자열이어야 한다.
         or (author ? 'given'
             and (pg_catalog.jsonb_typeof(author -> 'given') <> 'string'
                  or pg_catalog.length(author ->> 'given') > 200))
         -- 우리가 읽지 않는 열쇠가 섞여 들어오지 않게 한다.
         or exists (
           select 1
           from pg_catalog.jsonb_object_keys(author) as k
           where k not in ('family', 'given')
         )
    );
$$;

comment on function public.paper_authors_valid(jsonb) is
  '저자 목록이 [{family, given?}] 모양인지 확인한다. APA 생성이 이 모양에 기댄다.';


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.paper_profiles (
  id                uuid primary key default gen_random_uuid(),

  -- 소유자. 브라우저가 보낸 값을 쓰지 않고 트리거가 auth.uid()로 채운다. (2.3절)
  owner_id          uuid not null references auth.users (id) on delete cascade,

  -- 자료 하나에 논문 정보는 하나다. unique가 그것을 지킨다.
  -- 자료를 영구 삭제하면 논문 정보도 함께 사라진다.
  source_id         uuid not null unique
                      references public.sources (id) on delete cascade,

  -- [{family, given?}]. 순서가 곧 저자 순서다. 참고문헌이 이 순서를 따른다.
  authors           jsonb   not null default '[]'::jsonb,

  publication_year  integer,

  -- 학술지명. 단행본 장(chapter)이나 학위논문도 여기에 담는다.
  journal_name      text,

  /*
    권·호·쪽을 숫자가 아니라 글로 담는다.

    숫자로 두면 담지 못하는 것이 많다. `12(3)`의 호에 `특별호`가 오고,
    쪽에 `e012345`나 `S1-S14`가 온다. 온라인 전용 학술지는 쪽이 아예 없다.
    산술을 할 일이 없는 값이라 글로 두는 편이 잃는 것이 없다.
  */
  volume            text,
  issue             text,
  page_range        text,

  -- `10.1234/abcd` 모양으로 다듬어 담는다. 주소(https://doi.org/…)로 담지 않는다.
  -- 주소는 보여줄 때 만들면 되고, 같은 논문을 두 모양으로 들고 있으면
  -- 나중에 중복을 찾을 수 없다.
  doi               text,
  issn              text,

  abstract          text,
  keywords          text[] not null default '{}'::text[],

  -- 원문이 어느 말로 쓰였는지. 참고문헌 표기가 이 값에 따라 달라진다.
  -- 한국어 논문은 이름을 가르지 않고 그대로 적는 것이 관행이다.
  original_language text,

  /*
    사람이 고쳐 쓴 참고문헌.

    비어 있으면 구조화된 값으로 그때그때 만들어 보여준다.
    채워져 있으면 그것을 쓴다. 자동 생성이 어색할 때 손으로 고칠 수 있어야 하고,
    고친 것이 다음 생성에 덮어써지면 안 된다. (8.1절)
  */
  citation_override text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint paper_profiles_authors_shape check (
    public.paper_authors_valid(authors)
  ),
  -- 사람이 쓴 글에 붙는 연도의 범위. 위아래로 넉넉히 두되 오타는 거른다.
  constraint paper_profiles_year_range check (
    publication_year is null or publication_year between 1000 and 2200
  ),
  constraint paper_profiles_journal_name_length check (
    journal_name is null or char_length(journal_name) <= 300
  ),
  constraint paper_profiles_volume_length check (
    volume is null or char_length(volume) <= 50
  ),
  constraint paper_profiles_issue_length check (
    issue is null or char_length(issue) <= 50
  ),
  constraint paper_profiles_page_range_length check (
    page_range is null or char_length(page_range) <= 50
  ),
  constraint paper_profiles_doi_length check (
    doi is null or char_length(doi) between 3 and 300
  ),
  constraint paper_profiles_issn_length check (
    issn is null or char_length(issn) <= 20
  ),
  constraint paper_profiles_abstract_length check (
    abstract is null or char_length(abstract) <= 10000
  ),
  constraint paper_profiles_original_language_length check (
    original_language is null or char_length(original_language) <= 35
  ),
  constraint paper_profiles_citation_override_length check (
    citation_override is null or char_length(citation_override) <= 2000
  ),
  -- 키워드 하나하나의 길이. 배열 전체 개수는 화면과 스키마가 막는다.
  constraint paper_profiles_keywords_shape check (
    array_length(keywords, 1) is null or array_length(keywords, 1) <= 50
  )
);

comment on table public.paper_profiles is
  '논문 자료의 서지 정보. 참고문헌은 저장하지 않고 이 값으로 만든다. (설계 문서 8.1절)';
comment on column public.paper_profiles.authors is
  '[{family, given?}] 배열. 순서가 저자 순서다. given이 없으면 그대로 적는다.';
comment on column public.paper_profiles.doi is
  '10.으로 시작하는 알맹이만 담는다. 주소 형태는 보여줄 때 만든다.';
comment on column public.paper_profiles.citation_override is
  '사람이 고쳐 쓴 참고문헌. 비어 있으면 구조화된 값으로 그때그때 만든다.';

-- 자료 상세에서 논문 정보를 찾는 것이 가장 잦다. unique 제약이 그 색인이 된다.
-- 목록 화면은 발행 연도 내림차순으로 본다.
create index if not exists paper_profiles_owner_year_idx
  on public.paper_profiles (owner_id, publication_year desc nulls last);

-- 같은 논문을 두 번 등록했는지 찾을 때 쓴다.
-- 유일 제약은 걸지 않는다. 같은 논문을 다른 맥락에서 두 번 두고 싶을 수 있고,
-- 그 판단은 사용자가 한다. 우리가 막을 일이 아니다.
create index if not exists paper_profiles_owner_doi_idx
  on public.paper_profiles (owner_id, doi)
  where doi is not null;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 참조 확인
-- -----------------------------------------------------------------------------
-- 소유자를 정하는 일과 참조 대상을 확인하는 일을 한 함수에 순서대로 둔다.
-- 트리거를 둘로 나누면 이름 순서대로 실행되어, 확인이 먼저 돌면서
-- 아직 정해지지 않은 owner_id를 검사하게 된다. captures에서 겪은 문제다.

create or replace function public.set_paper_profile_owner()
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

  -- 붙이려는 자료가 정말 이 사람 것인지 확인한다.
  -- 외래키 제약은 RLS를 보지 않으므로, 이 확인이 없으면 자료 id만 알면
  -- 남의 자료에 논문 정보를 붙일 수 있다.
  perform public.assert_source_owned(new.source_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists paper_profiles_set_owner on public.paper_profiles;
create trigger paper_profiles_set_owner
  before insert on public.paper_profiles
  for each row
  execute function public.set_paper_profile_owner();


-- 만들어진 뒤에 바뀌지 않는 값들.
--
-- source_id를 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 논문의 서지
-- 정보가 B 자료에 붙는다. 붙일 자료를 잘못 골랐다면 지우고 다시 만든다.
create or replace function public.guard_paper_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'paper_profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'paper_profiles.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'paper_profiles.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'paper_profiles.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists paper_profiles_guard_immutable_columns
  on public.paper_profiles;
create trigger paper_profiles_guard_immutable_columns
  before update on public.paper_profiles
  for each row
  execute function public.guard_paper_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. 누가 무엇을 할 수 있는지 여기에 다 적는다.
-- anon에는 아무것도 주지 않는다.

revoke all on table public.paper_profiles from anon, authenticated;

grant select, insert, update, delete
  on table public.paper_profiles to authenticated;

grant execute on function public.paper_authors_valid(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인과 승인 상태 확인을 함께 건다.
-- 소유자만 보면 정지된 계정이 자기 자료에 계속 접근한다.
--
-- 삭제 표시를 쓰지 않는다. 논문 정보는 자료에 딸린 것이라 자료가 사라지면
-- 함께 사라진다. 그래서 조회 정책에 deleted_at 조건이 없고,
-- 갱신 결과가 정책을 벗어날 일도 없다. 삭제 표시 전용 함수가 필요 없는 이유다.

alter table public.paper_profiles enable row level security;

drop policy if exists paper_profiles_select_own on public.paper_profiles;
create policy paper_profiles_select_own
  on public.paper_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_profiles_insert_own on public.paper_profiles;
create policy paper_profiles_insert_own
  on public.paper_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_profiles_update_own on public.paper_profiles;
create policy paper_profiles_update_own
  on public.paper_profiles
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

drop policy if exists paper_profiles_delete_own on public.paper_profiles;
create policy paper_profiles_delete_own
  on public.paper_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
