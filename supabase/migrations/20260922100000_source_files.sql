-- =============================================================================
-- ThreadMark — Source에 붙는 Drive 파일
-- =============================================================================
-- 목적
--   사용자가 Google Drive에 올린 파일이 어느 자료에 속하는지 기록한다.
--   설계 문서 20절이 핵심 표로 적어둔 source_files다.
--
-- 왜 별도의 표인가
--   sources에 컬럼을 붙이면 파일을 하나밖에 못 붙인다. 논문 한 편에 본문 PDF와
--   부록 PDF를 함께 두는 일이 흔하므로 자료 하나에 파일 여럿을 허용한다.
--   파일이 없는 유형(note, website, music)의 행이 NULL로 채워지는 것도 피한다.
--
--   sources.metadata에 넣지 않는 이유는 설계 문서 5.2절이다. checksum 비교와
--   상태 전이는 검색·관계에 쓰이는 값이라 정규 컬럼에 둔다. JSONB에는 제약조건도
--   걸 수 없어, "ready인데 파일 식별자가 없는" 상태를 막을 방법이 없다.
--
-- source_external_ids와의 경계
--   이 표는 "파일 실체가 Drive 어디에 있는가"를 담는다.
--   source_external_ids는 "이 자료가 외부 공급자에 어떤 식별자로 등록되어 있는가"다.
--   DOI나 TMDB id는 그쪽, Drive 파일의 크기·checksum·업로드 상태는 이쪽이다.
--
-- 저장하는 값
--   설계 문서 9.2절이 지정한 대로 Drive 파일 ID, MIME type, size, checksum,
--   modified time을 남긴다. Phase 4에서 파일이 교체되었는지 checksum으로 판단한다.
--
-- 삭제를 표시로 하지 않는 이유
--   sources와 captures는 deleted_at으로 삭제를 표시한다. 그 안에는 사용자가 쓴
--   글이 들어 있어 되살릴 수 있어야 하기 때문이다.
--   이 표의 행은 Drive 파일을 가리키는 표지일 뿐이고, 첨부를 해제해도 Drive의
--   파일은 그대로 남는다. (설계 문서 10.4절) 되살릴 내용이 없으므로 행을 지운다.
--
--   덤으로 함정 하나를 피한다. 조회 정책에 deleted_at 조건이 없으면 갱신 결과가
--   정책을 벗어날 일이 없어, soft_delete_*() 같은 전용 함수가 필요 없다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 파일의 상태. 설계 문서 10.3절이 두 가지를 직접 요구한다.
--
--   pending  업로드 자리를 잡아두었고 아직 Drive에 다 들어가지 않았다.
--   ready    Drive에서 파일을 확인했다. 이 상태여야 파일을 쓸 수 있다.
--
-- "업로드 성공 후에만 ready로 바꾼다"는 요구는 코드가 아니라 여기서부터 지킨다.
-- 파일이 사라진 경우를 나타내는 값은 두지 않는다. 그것을 감지하는 기능
-- (설계 문서 9.2절의 파일 변경 감지)이 아직 없어서, 값만 만들어두면
-- 아무도 쓰지 않는 상태가 하나 남는다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_file_status' and n.nspname = 'public'
  ) then
    create type public.source_file_status as enum (
      'pending',
      'ready'
    );
  end if;
end
$$;

-- 파일이 어떻게 들어왔는지. 지금은 앱을 통한 업로드 하나뿐이다.
-- Google Picker로 기존 Drive 파일을 고르는 경로(설계 문서 10.2절)는 12-C에서
-- 추가하며, 그때 'picked'를 ALTER TYPE ... ADD VALUE 로 붙인다.
--
-- 둘을 구분해두는 이유는 정리 작업 때문이다. 앱이 올린 파일과 사용자가 원래
-- 가지고 있던 파일은 첨부를 해제할 때 할 수 있는 일이 다르다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_file_origin' and n.nspname = 'public'
  ) then
    create type public.source_file_origin as enum (
      'upload'
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------

create table if not exists public.source_files (
  id                uuid primary key default gen_random_uuid(),

  -- 소유자. 브라우저가 보낸 값을 쓰지 않고 트리거가 auth.uid()로 채운다. (2.3절)
  owner_id          uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,

  -- 어느 자료에 붙는가. 이 자료가 정말 같은 사람 것인지는 트리거가 확인한다.
  -- 외래키 제약은 RLS를 보지 않으므로 제약만으로는 남의 자료에 붙일 수 있다.
  source_id         uuid not null
                      references public.sources (id) on delete cascade,

  status            public.source_file_status not null default 'pending',
  origin            public.source_file_origin not null default 'upload',

  -- 사용자가 고른 파일 이름. Drive에도 같은 이름으로 올라간다.
  file_name         text not null,
  mime_type         text not null,

  -- 업로드를 시작할 때는 브라우저가 알려준 크기가 들어간다.
  -- 완료 확인 단계에서 Drive가 알려준 값으로 덮어쓴다. 둘이 다르면 Drive 쪽이 맞다.
  byte_size         bigint not null,

  -- Drive가 정하는 값들. 업로드가 끝나기 전에는 알 수 없어 NULL이다.
  drive_file_id     text,
  -- 설계 문서 9.2절의 checksum. Drive의 md5Checksum을 그대로 담는다.
  -- Google 문서와 스프레드시트처럼 바이너리가 아닌 파일에는 값이 없다.
  checksum          text,
  drive_modified_at timestamptz,

  -- 마지막으로 Drive에 물어본 시각. 파일이 아직 있는지 다시 확인할 때 쓴다.
  last_verified_at  timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ready인데 가리킬 파일이 없으면 의미가 없다.
  -- 설계 문서 10.3절의 "업로드 성공 후에만 ready"를 데이터베이스가 강제한다.
  -- 코드가 실수해도 이 상태로는 저장되지 않는다.
  constraint source_files_ready_has_drive_file check (
    status <> 'ready' or drive_file_id is not null
  ),

  constraint source_files_file_name_length check (
    char_length(file_name) between 1 and 300
  ),
  constraint source_files_mime_type_length check (
    char_length(mime_type) between 1 and 200
  ),
  constraint source_files_drive_file_id_length check (
    drive_file_id is null or char_length(drive_file_id) between 1 and 200
  ),
  constraint source_files_checksum_length check (
    checksum is null or char_length(checksum) between 1 and 128
  ),
  -- 크기가 음수이거나 터무니없이 큰 값은 받지 않는다.
  -- 상한은 애플리케이션이 정한 한 파일 100MB보다 넉넉하게 둔다.
  -- 여기서 막으려는 것은 잘못된 값이지 정책이 아니다.
  constraint source_files_byte_size_range check (
    byte_size >= 0 and byte_size <= 21474836480
  )
);

comment on table public.source_files is
  '자료에 붙은 Google Drive 파일. 파일 실체의 위치와 상태를 담는다.';
comment on column public.source_files.owner_id is
  '소유자. 클라이언트가 보낸 값을 신뢰하지 않고 트리거가 auth.uid()로 채운다.';
comment on column public.source_files.status is
  'pending은 업로드 중, ready는 Drive에서 확인된 상태. ready만 사용할 수 있다.';
comment on column public.source_files.checksum is
  'Drive의 md5Checksum. 파일이 교체되었는지 판단하는 데 쓴다. (설계 문서 9.2절)';

-- 자료 상세 화면은 "이 자료의 파일을 오래된 순으로"를 읽는다.
create index if not exists source_files_source_created_idx
  on public.source_files (source_id, created_at);

-- 오래 남은 pending 행을 정리할 때 쓴다. (설계 문서 10.3절)
create index if not exists source_files_owner_status_created_idx
  on public.source_files (owner_id, status, created_at);

-- 같은 파일을 같은 자료에 두 번 붙이지 않는다.
-- 서로 다른 자료에 같은 파일을 붙이는 것은 막지 않는다. 논문 한 PDF가
-- 두 자료에서 참조될 수 있고, Picker를 붙이는 12-C에서 실제로 생길 수 있다.
create unique index if not exists source_files_source_drive_file_key
  on public.source_files (source_id, drive_file_id)
  where drive_file_id is not null;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 참조 확인
-- -----------------------------------------------------------------------------
-- 소유자를 정하는 일과 참조 대상을 확인하는 일을 한 함수에 순서대로 둔다.
-- 트리거를 둘로 나누면 이름 순서대로 실행되어, 확인이 먼저 돌면서
-- 아직 정해지지 않은 owner_id를 검사하게 된다. captures에서 겪은 문제다.

create or replace function public.set_source_file_owner()
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
  -- 남의 자료에 자기 파일을 붙일 수 있다.
  perform public.assert_source_owned(new.source_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists source_files_set_owner on public.source_files;
create trigger source_files_set_owner
  before insert on public.source_files
  for each row
  execute function public.set_source_file_owner();


-- 만들어진 뒤에 바뀌어서는 안 되는 값들을 막는다.
--
-- drive_file_id를 한 번 정해진 뒤 못 바꾸게 하는 이유가 중요하다.
-- 그 값을 바꿀 수 있으면, 확인을 마친 첨부가 가리키는 파일만 조용히
-- 다른 것으로 바뀔 수 있다. 크기와 checksum은 예전 파일의 것인데
-- 내용만 달라진 상태가 된다. 파일을 바꾸려면 새 첨부를 만든다.
create or replace function public.guard_source_file_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'source_files.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'source_files.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'source_files.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'source_files.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if old.drive_file_id is not null
     and new.drive_file_id is distinct from old.drive_file_id then
    raise exception 'source_files.drive_file_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- 확인을 마친 파일이 다시 업로드 중으로 돌아가지 않는다.
  -- 되돌릴 일이 있다면 그것은 새 파일이므로 새 행을 만든다.
  if old.status = 'ready' and new.status <> 'ready' then
    raise exception 'source_files.status는 ready에서 되돌릴 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists source_files_guard_immutable_columns on public.source_files;
create trigger source_files_guard_immutable_columns
  before update on public.source_files
  for each row
  execute function public.guard_source_file_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- anon에는 어떤 권한도 주지 않는다.
-- service_role은 쓰지 않는다. 이 표는 사용자 세션으로만 다루며 RLS가 지킨다.
-- Drive 토큰을 읽어야 하는 쪽(google_drive_connections)만 service_role을 쓴다.

revoke all on table public.source_files from anon, authenticated;

grant select, insert, update, delete on table public.source_files to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인과 승인 상태 확인을 함께 건다.
-- 소유자만 보면 정지된 계정이 자기 파일에 계속 접근한다.

alter table public.source_files enable row level security;

drop policy if exists source_files_select_own on public.source_files;
create policy source_files_select_own
  on public.source_files
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

-- 생성: 소유자는 트리거가 채우지만, 정책에서도 본인 것만 만들 수 있게 한다.
-- 붙이려는 자료가 본인 것인지는 트리거의 assert_source_owned가 확인한다.
drop policy if exists source_files_insert_own on public.source_files;
create policy source_files_insert_own
  on public.source_files
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

-- 수정: 업로드 완료 확인 결과를 기록하는 경로다.
-- 바뀌면 안 되는 값은 가드 트리거가 막는다.
drop policy if exists source_files_update_own on public.source_files;
create policy source_files_update_own
  on public.source_files
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

-- 삭제: 첨부 해제와 실패한 업로드 정리에 쓴다.
-- 행만 지우며 Drive의 파일은 건드리지 않는다. (설계 문서 10.4절)
drop policy if exists source_files_delete_own on public.source_files;
create policy source_files_delete_own
  on public.source_files
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
