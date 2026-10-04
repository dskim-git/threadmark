-- =============================================================================
-- 음성 자료의 전사문과 길이 (17-V 4차례)
-- =============================================================================
-- 설계 문서 17절과 17-V절.
--
-- > 전사문, AI 요약, 확인 여부를 별도 필드로 둔다.
--
-- **17절에서 처음으로 마이그레이션이 필요한 자리다.** 1·2·3차례와 17-4는
-- 하나도 없이 끝났다. 전사문과 길이를 담을 칸이 어디에도 없다.
--
-- 왜 captures에 칸을 더하지 않는가
--   단위가 다르다. 전사문·길이·확인 여부의 단위는 녹음 하나이고 captures는
--   생각 하나다. 한 녹음에 메모 셋을 달면 전사문이 세 벌이 되거나, 전사문을
--   든 특별한 줄 하나가 생긴다. 뒤엣것은 그 줄을 지우면 전사문이 사라지는
--   모양이고 오류는 나지 않는다.
--
--   그리고 captures.original_text는 "고치지 않는다"고 적어둔 칸이다.
--   전사문은 고쳐야 하는 값이다. 기계가 옮기면 틀린다. 성격이 반대다.
--
-- 왜 자료 하나에 한 줄인가
--   `*_profiles` 꼴을 따른다. 검사(tests/search-profile-targets.test.mjs)가
--   마이그레이션에서 `create table ... public.(\w+_profiles)`로 표 이름을
--   뽑아 검색 목록과 양쪽에서 견준다. 그 모양이 아니면 검색에 넣는 쪽이
--   실패한다.
--
--   단위로 보아도 그쪽이 맞다. 17절이 "제목, 길이, 날짜"를 한 묶음으로
--   적었고, 강의 세 번을 담는다면 그 셋이 저마다 달라 자료 셋이 된다.
--
--   **전제를 적어 둔다.** 한 자료에 음성 파일을 여럿 붙이면 전사문은
--   source_file_id가 가리키는 그 하나의 것이다. 전제가 깨지는 것이 보이면
--   unique를 파일 쪽으로 옮기고 검사의 뽑는 자리를 함께 넓힌다.
--   짐작으로 미리 넓혀 두지 않는다.
--
-- 마이그레이션이 하나인 까닭
--   `ALTER TYPE ... ADD VALUE`로 더한 값은 같은 트랜잭션에서 쓸 수 없어서
--   둘로 나눠야 한다. (AGENTS.md 6절) 여기서는 **있는 갈래를 다시 쓰고**
--   audio_voice_scope만 새로 만든다. `CREATE TYPE`은 같은 파일에서 바로 쓸
--   수 있다. AI 전사를 미룬 것이 그 함정도 함께 미뤘다.
--
-- 삭제 표시를 두지 않는다
--   source_files가 두지 않은 까닭은 "되살릴 내용이 없다"였다. 전사문은
--   되살릴 내용이 있다. 그렇다고 두면 soft_delete_*() 함수와
--   PUBLIC_ROW_RULES 자리가 따라온다.
--
--   그래서 반대쪽을 골랐다. **지우는 길을 아예 만들지 않는다.** 전사문은
--   고칠 수만 있다. 되살릴 길이 없으면 지우는 길도 두지 않는다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

/*
  누구의 목소리가 담겼는가. (17-V.3절)

  이 칸이 **나중에 공개를 가를 유일한 근거다.** 사용자가 1차례에서 짚은
  것이 이것이다.

  > 내 목소리를 옮긴 것과 남의 목소리를 옮긴 것이 같은 칸에 담기면 가를
  > 수 없다.

  지금은 전사문이 통째로 공개되지 않는다. 그래도 이 칸을 둔다. 녹음할 때
  묻지 않으면 **나중에 되돌아가서 물을 수 없다.** 그때 남는 것은 "모르는
  녹음 더미"이고, 모르면 영원히 공개할 수 없다.

  두 값만 만든다. 쓰지 않을 값을 미리 넣지 않는다. (AGENTS.md 2절)
*/
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'audio_voice_scope' and n.nspname = 'public'
  ) then
    create type public.audio_voice_scope as enum (
      -- 내 목소리만 담겼다.
      'self_only',
      -- 다른 사람의 목소리가 담겼다. 동의가 필요한 자리다.
      'others_included'
    );
  end if;
end
$$;

comment on type public.audio_voice_scope is
  '녹음에 누구의 목소리가 담겼는가. 비어 있으면 모른다는 뜻이고, 모르면 공개하지 않는다.';


-- -----------------------------------------------------------------------------
-- 2. 표
-- -----------------------------------------------------------------------------

create table if not exists public.audio_profiles (
  id                  uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id            uuid not null default auth.uid()
                        references auth.users (id) on delete cascade,

  -- 자료 하나에 음성 정보는 하나다.
  source_id           uuid not null unique
                        references public.sources (id) on delete cascade,

  /*
    전사문이 어느 파일에서 나왔는가.

    **`on delete set null`이다.** 파일 쪽에 cascade를 걸면 첨부를 해제하는
    순간 전사문이 함께 사라진다. 사람이 한참 고친 글이고 되돌릴 길이 없다.
    파일을 떼는 일과 적어둔 것을 버리는 일은 다른 일이다.

    설계 문서 10.4절이 "Drive 파일이 사라져도 Source와 Capture 메타데이터는
    유지한다"고 적은 그대로다.
  */
  source_file_id      uuid
                        references public.source_files (id) on delete set null,

  /*
    그 시점 파일의 md5Checksum.

    파일이 교체되면 값이 달라진다. **그러면 전사문이 다른 녹음의 것이
    된다.** 그림 상자에 같은 장치를 둔 것과 같고(16-2), 오류는 나지 않는다.
    바이너리가 아닌 파일에는 Drive가 값을 주지 않으므로 비어 있을 수 있다.
  */
  transcript_checksum text,

  /*
    말을 글로 옮긴 것.

    **10만 자다.** captures의 2만 자로는 15분쯤이면 찬다. 한 시간짜리
    강의 녹음이 흔하고, 그것을 다 옮기면 수만 자가 된다.
  */
  transcript          text,

  /*
    녹음 길이(초).

    브라우저가 알려준 값이 들어간다. byte_size와 같은 성격이라 믿고 쓰되
    보안 판단에 쓰지 않는다.

    위쪽 한계를 24시간으로 둔다. 막는 목적은 잘못 들어온 값을 거르는
    것이지 긴 녹음을 막는 것이 아니다. (media/time.ts의 MAX_POSITION_SECONDS와
    같은 숫자다)
  */
  duration_seconds    integer,

  /*
    이 전사문을 누가 썼는가.

    **capture_verification_status를 다시 쓴다.** 13-C가 기계 번역을 위해
    만든 갈래이고 값이 그대로 맞는다.

      user_written       사람이 처음부터 적었다
      machine_generated  기계가 옮긴 그대로
      user_edited        기계가 옮긴 것을 사람이 고쳤다

    이름이 `capture_`로 시작하는데 captures 표가 아닌 곳에 쓴다. 이름이
    조금 어긋나는 것을 받아들였다. 뜻이 같은 갈래를 두 벌 만들면 한쪽에만
    값이 더해져 어긋나고, 그때 어느 쪽이 맞는지 알 수 없다.

    기본값은 user_written이다. 지금은 사람이 적는 길뿐이다. AI 전사가
    오면 그쪽이 나머지 둘을 쓴다. (17-V.6절)
  */
  verification_status public.capture_verification_status
                        not null default 'user_written',

  -- 누구의 목소리인가. 비어 있으면 모른다. (위 1절)
  voice_scope         public.audio_voice_scope,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint audio_profiles_transcript_length check (
    transcript is null or char_length(transcript) <= 100000
  ),

  constraint audio_profiles_checksum_length check (
    transcript_checksum is null or char_length(transcript_checksum) <= 128
  ),

  /*
    길이는 0 이상 24시간 이하다.

    0을 받는 까닭은 아주 짧은 녹음이 실제로 있기 때문이다. 1초를 밑도는
    것은 내림하면 0이 된다.
  */
  constraint audio_profiles_duration_range check (
    duration_seconds is null
    or (duration_seconds >= 0 and duration_seconds <= 86400)
  ),

  /*
    전사문이 없는데 어느 파일에서 나왔다고 적지 않는다.

    checksum만 남아 있으면 "그 파일에서 뽑은 무언가가 있었다"는 말이 되는데
    그런 것이 없다. 모순된 줄을 데이터베이스가 받지 않게 한다.
  */
  constraint audio_profiles_checksum_needs_transcript check (
    transcript_checksum is null or transcript is not null
  )
);

comment on table public.audio_profiles is
  '음성 자료의 전사문과 길이. 자료 하나에 한 줄이다. (설계 문서 17절, 17-V절)';
comment on column public.audio_profiles.source_file_id is
  '전사문이 나온 녹음 파일. 파일을 떼어도 전사문은 남으므로 비어 있을 수 있다.';
comment on column public.audio_profiles.transcript_checksum is
  '전사문을 만든 시점 파일의 md5. 파일이 교체되었는지 알리는 데 쓴다.';
comment on column public.audio_profiles.transcript is
  '말을 글로 옮긴 것. 사용자가 적거나 고친다. 공개되지 않는다. (16-B, 17-V.3절)';
comment on column public.audio_profiles.duration_seconds is
  '녹음 길이(초). 브라우저가 알려준 값이며 보안 판단에 쓰지 않는다.';
comment on column public.audio_profiles.verification_status is
  '이 전사문을 누가 썼는가. captures와 같은 갈래를 쓴다.';
comment on column public.audio_profiles.voice_scope is
  '누구의 목소리가 담겼는가. 비어 있으면 모르며, 모르면 공개하지 않는다.';

create index if not exists audio_profiles_owner_idx
  on public.audio_profiles (owner_id);

-- 파일을 지웠을 때 가리키던 줄을 찾는다. set null이 그 길을 쓴다.
create index if not exists audio_profiles_source_file_idx
  on public.audio_profiles (source_file_id)
  where source_file_id is not null;


-- -----------------------------------------------------------------------------
-- 3. 파일이 그 자료의 것인지 확인한다
-- -----------------------------------------------------------------------------
/*
  **외래키 제약은 RLS를 보지 않는다.** (AGENTS.md 6절) 이 확인이 없으면
  파일 id만 알면 남의 파일을 가리키는 전사문을 만들 수 있다.

  연결 테이블은 양쪽 모두 확인한다. 여기서는 셋을 본다.

    1. 그 파일이 내 것인가
    2. 그 파일이 **이 자료에 붙은 것**인가
    3. 그 파일이 음성인가

  둘째가 특히 중요하다. 내 파일이기만 하면 **다른 자료의 PDF를 가리키는
  전사문**이 만들어진다. 오류는 나지 않고 되짚어 갈 때 엉뚱한 데로 간다.
*/
create or replace function public.assert_audio_file_owned(
  p_file_id   uuid,
  p_source_id uuid,
  p_owner_id  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_file_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.source_files f
    where f.id = p_file_id
      and f.owner_id = p_owner_id
      and f.source_id = p_source_id
      and f.mime_type like 'audio/%'
  ) then
    raise exception '이 자료에 붙은 음성 파일을 찾을 수 없습니다.'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_audio_file_owned(uuid, uuid, uuid) is
  '전사문이 가리키는 파일이 내 것이고, 이 자료에 붙은 음성인지 확인한다.';


-- -----------------------------------------------------------------------------
-- 4. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다. (AGENTS.md 6절)

create or replace function public.set_audio_profile_owner()
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
  perform public.assert_audio_file_owned(
    new.source_file_id,
    new.source_id,
    new.owner_id
  );

  return new;
end;
$$;

drop trigger if exists audio_profiles_set_owner on public.audio_profiles;
create trigger audio_profiles_set_owner
  before insert on public.audio_profiles
  for each row
  execute function public.set_audio_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  source_id를 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 녹음을 두고
  적은 전사문이 B 녹음의 것이 된다.

  **source_file_id는 바꿀 수 있다.** 파일을 떼었다가 다시 붙이는 일이
  있고, 그때 전사문을 새 파일에 다시 이어줄 수 있어야 한다. 다만 그때도
  "이 자료에 붙은 음성인가"를 다시 본다.
*/
create or replace function public.guard_audio_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'audio_profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'audio_profiles.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'audio_profiles.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'audio_profiles.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_file_id is distinct from old.source_file_id then
    perform public.assert_audio_file_owned(
      new.source_file_id,
      new.source_id,
      new.owner_id
    );
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists audio_profiles_guard_immutable_columns
  on public.audio_profiles;
create trigger audio_profiles_guard_immutable_columns
  before update on public.audio_profiles
  for each row
  execute function public.guard_audio_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다. (AGENTS.md 6절)
--
-- **delete를 주지 않는다.** 지우는 길을 만들지 않기로 했다. (머리말)
-- 줄은 자료가 사라질 때 cascade로 함께 사라진다.

revoke all on table public.audio_profiles from anon, authenticated;

grant select, insert, update on table public.audio_profiles to authenticated;

revoke all on function public.assert_audio_file_owned(uuid, uuid, uuid) from public;
grant execute on function public.assert_audio_file_owned(uuid, uuid, uuid)
  to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다. (5절 1번)

alter table public.audio_profiles enable row level security;

drop policy if exists audio_profiles_select_own on public.audio_profiles;
create policy audio_profiles_select_own
  on public.audio_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists audio_profiles_insert_own on public.audio_profiles;
create policy audio_profiles_insert_own
  on public.audio_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists audio_profiles_update_own on public.audio_profiles;
create policy audio_profiles_update_own
  on public.audio_profiles
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

/*
  삭제 정책을 두지 않는다.

  권한도 주지 않았으므로 두 겹으로 막힌다. **지우는 길이 없다는 것이
  설계다.** (머리말) 나중에 생각이 바뀌면 그때 정책과 권한을 함께 연다.
*/
