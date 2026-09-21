-- =============================================================================
-- ThreadMark — Capture 테이블
-- =============================================================================
-- 목적
--   자료를 읽으며 남기는 기록을 담는다. (설계 문서 6장)
--
-- 가장 중요한 성질
--   설계 문서 2.4절은 원문과 사용자의 생각을 데이터와 화면에서 구분하라고 한다.
--   그래서 세 가지를 각각 다른 컬럼에 담는다.
--
--     original_text     원문 그대로. 사용자가 고치지 않는 것.
--     translated_text   기계가 옮긴 것.
--     content           사용자가 쓴 것.
--
--   한 컬럼에 섞어 담으면 나중에 무엇이 인용이고 무엇이 내 해석인지 구분할 수 없다.
--   논문을 근거로 글을 쓸 때 이 구분이 사라지면 인용과 표절의 경계가 흐려진다.
--   그래서 관례가 아니라 제약조건으로 강제한다.
--
-- 이번 마이그레이션에 포함하지 않은 것
--   - 태그, 프로젝트 연결 (11단계)
--   - 손글씨·음성 파일 저장 (12단계 Google Drive)
--   - AI 생성 관련 상태값 (14단계)
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 기록의 종류. 설계 문서 6.1절의 12가지를 그대로 옮긴다.
-- handwriting과 voice는 파일 저장이 필요해 화면에서는 아직 제공하지 않는다.
-- 유형 체계는 설계 문서를 따르고, 화면은 실제로 동작하는 것만 보여준다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'capture_type' and n.nspname = 'public'
  ) then
    create type public.capture_type as enum (
      'quote',          -- 직접 인용
      'translation',    -- 번역
      'summary',        -- 요약
      'paraphrase',     -- 바꾸어 쓰기
      'interpretation', -- 나의 해석
      'question',       -- 질문
      'counterpoint',   -- 반론
      'idea',           -- 활용 아이디어
      'todo',           -- 후속 할 일
      'note',           -- 일반 메모
      'handwriting',    -- 손글씨
      'voice'           -- 음성 메모
    );
  end if;
end
$$;

-- AI가 만든 내용을 사용자가 확인했는지를 나타낸다.
-- 설계 문서 6.2절에 필드 이름만 있고 값이 정의되어 있지 않다.
-- AI 기능을 붙이기 전까지 모든 기록은 사용자가 직접 쓴 것이므로 값이 하나뿐이다.
-- AI 생성본과 사용자 수정본을 구분하는 값은 그 기능을 만들 때 추가한다. (9.4절)
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'capture_verification_status' and n.nspname = 'public'
  ) then
    create type public.capture_verification_status as enum ('user_written');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------

create table if not exists public.captures (
  id                   uuid primary key default gen_random_uuid(),

  -- 소유자. 클라이언트가 보낸 값을 쓰지 않고 기본값과 트리거가 채운다. (2.3절)
  owner_id             uuid not null default auth.uid()
                         references auth.users (id) on delete cascade,

  -- 자료 없이도 기록할 수 있다. 빠른 메모가 여기에 해당한다. (6.2절)
  -- 자료를 영구 삭제하면 그 자료에 달린 기록도 함께 사라진다.
  source_id            uuid references public.sources (id) on delete cascade,

  capture_type         public.capture_type not null,

  -- 2.4절: 원문과 사용자의 생각을 분리해 담는다.
  content              text,  -- 사용자가 쓴 내용
  original_text        text,  -- 원문 그대로. 고치지 않는다.
  translated_text      text,  -- 기계가 옮긴 것
  translation_language text,
  translation_provider text,

  ai_generated         boolean not null default false,
  verification_status  public.capture_verification_status
                         not null default 'user_written',

  -- 자료 안에서의 위치. 형태는 유형마다 다르다. (6.3절)
  -- PDF 페이지, 영상 시간, 책 쪽수, 이미지 영역 등이 들어간다.
  locator              jsonb not null default '{}'::jsonb,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 삭제는 표시만 한다. 실수로 지운 기록을 되살릴 수 있어야 한다.
  deleted_at           timestamptz,

  constraint captures_content_length check (
    content is null or char_length(content) <= 20000
  ),
  constraint captures_original_text_length check (
    original_text is null or char_length(original_text) <= 20000
  ),
  constraint captures_translated_text_length check (
    translated_text is null or char_length(translated_text) <= 20000
  ),
  constraint captures_translation_language_length check (
    translation_language is null or char_length(translation_language) <= 35
  ),
  constraint captures_translation_provider_length check (
    translation_provider is null or char_length(translation_provider) <= 100
  ),
  constraint captures_locator_is_object check (
    jsonb_typeof(locator) = 'object'
  ),

  -- 아래 세 제약이 2.4절을 데이터 구조로 강제하는 부분이다.

  -- 인용인데 원문이 없으면 인용이 아니다.
  constraint captures_quote_needs_original check (
    capture_type <> 'quote'::public.capture_type
    or original_text is not null
  ),

  -- 번역은 원문, 번역문, 대상 언어가 함께 있어야 의미가 성립한다.
  -- 원문 없는 번역문은 나중에 무엇을 옮긴 것인지 확인할 수 없다.
  constraint captures_translation_needs_pair check (
    capture_type <> 'translation'::public.capture_type
    or (
      original_text is not null
      and translated_text is not null
      and translation_language is not null
    )
  ),

  -- 셋 다 비어 있는 기록은 남길 이유가 없다.
  constraint captures_needs_some_text check (
    content is not null
    or original_text is not null
    or translated_text is not null
  )
);

comment on table public.captures is
  '자료를 읽으며 남긴 기록. 원문과 사용자 작성 내용을 다른 컬럼에 담는다.';
comment on column public.captures.original_text is
  '원문 그대로. 사용자가 고치지 않는 값이며 인용의 근거가 된다.';
comment on column public.captures.content is
  '사용자가 직접 쓴 내용. 원문과 섞지 않는다.';
comment on column public.captures.locator is
  '자료 안에서의 위치. 유형마다 형태가 다르다. 좌표는 0~1 비율로 저장한다.';

-- 목록은 "내 기록 중 삭제되지 않은 것을 최신순으로" 읽는다.
create index if not exists captures_owner_created_idx
  on public.captures (owner_id, created_at desc)
  where deleted_at is null;

-- 자료 상세 화면에서 그 자료에 달린 기록을 읽는다.
create index if not exists captures_source_created_idx
  on public.captures (source_id, created_at desc)
  where deleted_at is null;

-- Inbox는 자료에 붙지 않은 기록만 모아 본다.
create index if not exists captures_inbox_idx
  on public.captures (owner_id, created_at desc)
  where deleted_at is null and source_id is null;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------

-- 연결하려는 자료가 정말 내 자료인지 확인한다.
--
-- 외래키 제약은 RLS를 보지 않는다. source_id 값만 알면 다른 사람의 자료에도
-- 기록을 붙일 수 있다는 뜻이다.
--
-- SECURITY INVOKER(기본값)로 두는 것이 중요하다. 호출자 권한으로 sources를 읽으면
-- RLS가 이미 남의 자료를 숨기므로 확인이 이중으로 걸린다.
create or replace function public.assert_capture_source_owned(
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

revoke all on function public.assert_capture_source_owned(uuid, uuid) from public;
grant execute on function public.assert_capture_source_owned(uuid, uuid) to authenticated;


-- 소유자 확정과 연결 확인을 한 트리거에서 처리한다.
--
-- 트리거를 나누면 같은 시점의 트리거가 이름 순서대로 실행되므로,
-- 연결 확인이 소유자 확정보다 먼저 일어나 아직 정해지지 않은 값을 검사하게 된다.
-- 순서에 의존하지 않도록 한 함수 안에 순서대로 둔다.
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

  perform public.assert_capture_source_owned(new.source_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists captures_set_owner on public.captures;
create trigger captures_set_owner
  before insert on public.captures
  for each row
  execute function public.set_capture_owner();


-- 소유자와 생성 시각은 만들어진 뒤에 바뀌지 않는다.
-- 연결 대상을 바꿀 때도 내 자료인지 다시 확인한다.
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
    perform public.assert_capture_source_owned(new.source_id, new.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists captures_guard_immutable_columns on public.captures;
create trigger captures_guard_immutable_columns
  before update on public.captures
  for each row
  execute function public.guard_capture_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 삭제 표시 함수
-- -----------------------------------------------------------------------------
-- sources와 같은 이유로 필요하다.
-- 조회 정책이 deleted_at이 비어 있기를 요구하는데, PostgREST는 갱신을 항상
-- RETURNING으로 감싸고 PostgreSQL은 그때 조회 정책을 새 행에 다시 적용한다.
-- 그래서 삭제 표시를 남기는 갱신은 PostgREST로는 언제나 실패한다.
--
-- SECURITY DEFINER라서 RLS를 우회하므로, 정책이 보장하던 것을 함수가 직접 확인한다.

create or replace function public.soft_delete_capture(capture_id uuid)
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
    raise exception '승인된 계정만 기록을 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  -- owner_id 조건이 이 함수의 유일한 접근 통제다. 빠뜨리면 남의 기록도 지워진다.
  update public.captures
  set deleted_at = pg_catalog.now()
  where id = capture_id
    and owner_id = v_user
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$$;

comment on function public.soft_delete_capture(uuid) is
  '기록에 삭제 표시를 남긴다. 소유자 본인과 승인된 계정만 수행할 수 있다.';

revoke all on function public.soft_delete_capture(uuid) from public;
grant execute on function public.soft_delete_capture(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------

revoke all on table public.captures from anon, authenticated;

grant select, insert, update, delete on table public.captures to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------

alter table public.captures enable row level security;

drop policy if exists captures_select_own on public.captures;
create policy captures_select_own
  on public.captures
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and deleted_at is null
    and public.is_active_user()
  );

drop policy if exists captures_insert_own on public.captures;
create policy captures_insert_own
  on public.captures
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists captures_update_own on public.captures;
create policy captures_update_own
  on public.captures
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

drop policy if exists captures_delete_own on public.captures;
create policy captures_delete_own
  on public.captures
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
