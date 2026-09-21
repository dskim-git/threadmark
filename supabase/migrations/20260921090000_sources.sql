-- =============================================================================
-- ThreadMark — Source 테이블
-- =============================================================================
-- 목적
--   사용자가 저장하는 자료의 공통 정보를 담는다. (설계 문서 5.2절)
--   논문, 책, 웹사이트, 음악 등 모든 유형이 이 테이블을 공유한다.
--
-- 이번 마이그레이션에 포함하지 않은 것
--   - 유형별 프로필 테이블 (paper_profiles 등)
--   - source_external_ids (외부 공급자 식별자)
--   - 태그, 프로젝트 연결
--   필요해지는 단계에서 각각 별도 마이그레이션으로 추가한다.
--
-- 접근 통제
--   소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도
--   자기 자료에는 접근하게 되기 때문이다.
--   모든 정책에 owner_id 확인과 is_active_user()를 함께 건다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 자료 유형. 설계 문서 5.1절의 11가지를 그대로 옮긴다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_type' and n.nspname = 'public'
  ) then
    create type public.source_type as enum (
      'paper',    -- 논문
      'book',     -- 책
      'website',  -- 웹사이트
      'music',    -- 음악, 앨범, 공연 음원
      'youtube',  -- YouTube 영상
      'media',    -- 영화, 드라마, OTT
      'pdf',      -- 일반 PDF
      'image',    -- 이미지
      'drawing',  -- 손글씨, 그림
      'audio',    -- 음성
      'note'      -- 출처 없는 독립 메모
    );
  end if;
end
$$;

-- 공개 범위. 설계 문서 2.5절에 따라 모든 자료는 기본적으로 private다.
-- 공유는 MVP 이후 기능이므로 지금은 값을 하나만 둔다.
-- 공유 범위가 정해지면 ALTER TYPE ... ADD VALUE 로 확장한다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_visibility' and n.nspname = 'public'
  ) then
    create type public.source_visibility as enum ('private');
  end if;
end
$$;

-- 자료의 수집 상태. 설계 문서 5.2절에 필드 이름만 있고 값이 정의되어 있지 않다.
-- 용도가 분명해지기 전에 값을 늘리지 않는다. 지금은 활성 상태 하나뿐이다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_status' and n.nspname = 'public'
  ) then
    create type public.source_status as enum ('active');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------

create table if not exists public.sources (
  id            uuid primary key default gen_random_uuid(),

  -- 소유자. 브라우저가 보낸 값을 쓰지 않고 트리거가 auth.uid()로 채운다. (2.3절)
  owner_id      uuid not null references auth.users (id) on delete cascade,

  type          public.source_type       not null,
  title         text                     not null,
  subtitle      text,
  description   text,

  thumbnail_url text,
  canonical_url text,
  original_url  text,

  visibility    public.source_visibility not null default 'private',
  status        public.source_status     not null default 'active',

  -- 공급자 응답을 임시로 보관하는 자리다. 검색·정렬·관계에 쓰이는 값은
  -- 여기 두지 않고 정규 컬럼이나 유형별 프로필 테이블에 둔다. (5.2절)
  metadata      jsonb                    not null default '{}'::jsonb,

  created_at    timestamptz              not null default now(),
  updated_at    timestamptz              not null default now(),

  -- 삭제는 표시만 한다. 실수로 지운 자료를 되살릴 수 있어야 한다.
  deleted_at    timestamptz,

  constraint sources_title_length check (
    char_length(title) between 1 and 300
  ),
  constraint sources_subtitle_length check (
    subtitle is null or char_length(subtitle) <= 300
  ),
  constraint sources_description_length check (
    description is null or char_length(description) <= 5000
  ),
  constraint sources_thumbnail_url_length check (
    thumbnail_url is null or char_length(thumbnail_url) <= 2000
  ),
  constraint sources_canonical_url_length check (
    canonical_url is null or char_length(canonical_url) <= 2000
  ),
  constraint sources_original_url_length check (
    original_url is null or char_length(original_url) <= 2000
  ),
  -- metadata에 배열이나 문자열이 들어오면 이후 처리가 어긋난다.
  constraint sources_metadata_is_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table public.sources is
  '사용자가 저장한 자료의 공통 정보. 유형별 상세는 별도 프로필 테이블에 둔다.';
comment on column public.sources.owner_id is
  '소유자. 클라이언트가 보낸 값을 신뢰하지 않고 트리거가 auth.uid()로 채운다.';
comment on column public.sources.deleted_at is
  '삭제 표시 시각. NULL이 아니면 삭제된 것으로 보고 조회에서 제외한다.';

-- 목록 조회는 "내 자료 중 삭제되지 않은 것을 최신순으로"가 기본이다.
-- 삭제된 행을 제외한 부분 인덱스로 조회 대상만 담는다.
create index if not exists sources_owner_created_idx
  on public.sources (owner_id, created_at desc)
  where deleted_at is null;

-- 유형별로 걸러 보는 화면(내 자료 > 논문 등)을 위한 인덱스.
create index if not exists sources_owner_type_created_idx
  on public.sources (owner_id, type, created_at desc)
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 변경 차단
-- -----------------------------------------------------------------------------
-- 설계 문서 2.3절: 브라우저에서 전달된 owner_id를 신뢰하지 않고 auth.uid()를 쓴다.
-- 애플리케이션이 owner_id를 보내지 않아도 되도록 트리거가 직접 채운다.
--
-- 서비스 컨텍스트(auth.uid()가 없는 경우)에서는 전달된 값을 그대로 둔다.
-- 데이터 이전이나 복구 작업을 막지 않기 위해서다.

create or replace function public.set_source_owner()
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

drop trigger if exists sources_set_owner on public.sources;
create trigger sources_set_owner
  before insert on public.sources
  for each row
  execute function public.set_source_owner();


-- 소유자와 생성 시각은 만들어진 뒤에 바뀌지 않는다.
-- RLS도 다른 사람 행을 건드리지 못하게 막지만, 여기서 한 겹 더 확인한다.
create or replace function public.guard_source_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'sources.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'sources.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'sources.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists sources_guard_immutable_columns on public.sources;
create trigger sources_guard_immutable_columns
  before update on public.sources
  for each row
  execute function public.guard_source_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- anon에는 어떤 권한도 주지 않는다. service_role 권한은 그대로 둔다.

revoke all on table public.sources from anon, authenticated;

grant select, insert, update, delete on table public.sources to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

alter table public.sources enable row level security;

-- 조회: 내 자료 중 삭제되지 않은 것.
-- is_active_user()를 함께 거는 이유는, 승인 대기·거절·정지 상태의 계정도
-- 소유자 조건만으로는 자기 자료를 계속 읽을 수 있기 때문이다.
drop policy if exists sources_select_own on public.sources;
create policy sources_select_own
  on public.sources
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and deleted_at is null
    and public.is_active_user()
  );

-- 생성: 소유자는 트리거가 채우지만, 정책에서도 본인 것만 만들 수 있게 한다.
drop policy if exists sources_insert_own on public.sources;
create policy sources_insert_own
  on public.sources
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

-- 수정: USING은 손댈 수 있는 행을, WITH CHECK는 바꾼 결과를 제한한다.
-- deleted_at 조건을 넣지 않는 이유는 두 가지다.
-- 삭제 표시를 하려면 갱신 후 행이 정책을 통과해야 하고,
-- 되살리기도 같은 경로로 처리해야 하기 때문이다.
drop policy if exists sources_update_own on public.sources;
create policy sources_update_own
  on public.sources
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

-- 영구 삭제. 화면은 삭제 표시만 하지만, 완전 삭제 경로를 정책으로 열어둔다.
drop policy if exists sources_delete_own on public.sources;
create policy sources_delete_own
  on public.sources
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
