-- =============================================================================
-- YouTube 영상 자료 (15-E-2b)
-- =============================================================================
-- 설계 문서 14절.
--
-- 대부분은 이미 sources에 있다
--   영상 제목      sources.title
--   미리보기 그림  sources.thumbnail_url
--   영상 주소      sources.original_url
--   담은 날        sources.created_at
--   메모           captures
--   프로젝트·태그  source_projects, source_tags
--
--   그래서 여기에는 나머지만 둔다. 같은 값을 두 곳에 두면 어느 쪽이 맞는지
--   알 수 없게 된다. website_profiles·book_profiles와 같은 판단이다.
--
-- 설명(description)을 담지 않는다
--   14절이 가져오라고 적어두었지만 담지 않기로 했다. (2026-09-25, 사용자와
--   함께 정함) 영상 설명은 보통 수십 줄이고 링크와 해시태그 덩어리다.
--   화면에 놓을 자리가 마땅치 않고, **제목·채널·길이가 "이게 뭐였지"에
--   답하는 값**이다.
--
--   필요해지면 그때 칸을 더한다. (`AGENTS.md` 2절 "쓰지 않을 값을 미리
--   넣지 않는다")
--
-- 게시일은 날짜로 담는다
--   책의 출판일은 글로 담았다. `2017-03-24`도 오고 `2017년 3월`도 와서
--   날짜로 바꾸려면 못 알아본 값을 버려야 했기 때문이다.
--
--   YouTube는 다르다. **늘 같은 모양(RFC 3339)으로 온다.** 기계가 찍는
--   값이라 제각각일 이유가 없다. 날짜로 담으면 "언제 올라온 영상인가"로
--   견주고 줄 세울 수 있다.
--
-- 길이는 초로 담는다
--   API는 `PT1H2M10S`로 준다. 사람이 보는 모양은 화면이 만든다.
--   글자로 담으면 보여줄 때마다 다시 뜯어야 하고, **기록의 시점과 견줄 수
--   없다.** 다음 단계(재생과 시점 기록)가 그 비교를 쓴다.
--
--   라이브 방송은 길이가 `P0D`로 온다. 0으로 읽으면 화면에 `0:00`이 뜨고
--   사용자는 영상이 비었다고 생각한다. 못 알아본 값은 비워 둔다.
--
-- embeddable이 다음 단계를 가른다
--   올린 사람이 퍼가기를 막아둔 영상이 있다. 그런 영상을 앱 안에서 틀면
--   **검은 화면에 오류만 뜬다.** 미리 알고 바깥 링크로 보내야 한다.
--   (14절 "임베딩이 금지된 영상은 외부 링크로 연다")
--
--   지금 단계에서는 담기만 하고, 쓰는 것은 다음 단계다. 미리 넣는 값이
--   아니라 **같은 한 번의 조회에서 함께 오는 값**이라 그때 따로 받아올
--   길이 없다.
--
-- 삭제되거나 비공개가 된 영상
--   14절: "삭제·비공개 영상이 되어도 기존 메모는 유지한다."
--   그래서 이 표에는 아무 제약도 걸지 않는다. 다시 찾아왔을 때 영상이
--   없으면 **채워둔 값을 지우지 않고 그대로 둔다.** 지우는 것은 우리가
--   사용자의 기록을 지우는 일이다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.youtube_profiles (
  id               uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id         uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,

  -- 자료 하나에 영상 정보는 하나다.
  source_id        uuid not null unique
                     references public.sources (id) on delete cascade,

  /*
    영상 번호. 이 표의 열쇠다.

    주소가 아니라 번호를 담는다. 같은 영상을 가리키는 주소가 여러 모양이라
    (`youtu.be/...`, `/shorts/...`, `watch?v=...&list=...`) 주소를 담으면
    같은 영상인지 견줄 수 없다. 주소에서 번호를 뽑는 규칙은
    `src/lib/youtube/video-id.ts` 한 곳에 있고 검사가 그 규칙을 지킨다.

    **모양을 여기서도 확인한다.** 열한 글자에 영문·숫자·`-`·`_`다.
    화면이 막지만 마지막 보장은 제약조건이다.
  */
  video_id         text not null,

  -- 채널 이름. 누가 올린 영상인지가 "이게 뭐였지"에 답하는 값의 절반이다.
  channel_name     text,

  -- 올라온 날. 기계가 찍는 값이라 날짜로 담는다. (머리말 참고)
  published_at     timestamptz,

  -- 길이. 초로 담는다. 못 알아본 값은 비워 둔다. (머리말 참고)
  duration_seconds integer,

  /*
    앱 안에서 틀 수 있는가.

    비어 있으면 **아직 모른다**는 뜻이다. false와 다르다. 모르는 것을
    false로 담으면 틀 수 있는 영상까지 바깥으로 내보내게 되고, true로
    담으면 못 트는 영상에서 검은 화면이 뜬다. (보안 원칙 7과 같은 생각이다)
  */
  embeddable       boolean,

  -- 이 값들을 언제 받아왔는지. 영상 제목과 채널 이름은 바뀐다.
  fetched_at       timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint youtube_profiles_video_id_shape check (
    video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  constraint youtube_profiles_channel_name_length check (
    channel_name is null or char_length(channel_name) <= 500
  ),
  /*
    길이는 0보다 커야 한다.

    0초짜리 영상은 없다. 0이 담겼다면 `P0D`(라이브)를 0으로 읽었다는
    뜻이고, 그러면 화면에 `0:00`이 떠서 영상이 빈 것처럼 보인다.

    위쪽 한계는 24시간이다. 그보다 긴 것은 사실상 라이브이며, 그 경우
    길이는 뜻이 없다.
  */
  constraint youtube_profiles_duration_range check (
    duration_seconds is null
    or (duration_seconds > 0 and duration_seconds <= 86400)
  )
);

comment on table public.youtube_profiles is
  'YouTube 영상의 정보. 제목과 미리보기 그림은 sources가 담는다. (설계 문서 14절)';
comment on column public.youtube_profiles.video_id is
  '영상 번호. 주소가 아니라 번호를 담아야 같은 영상인지 견줄 수 있다.';
comment on column public.youtube_profiles.embeddable is
  '앱 안에서 틀 수 있는가. 비어 있으면 아직 모른다는 뜻이며 false와 다르다.';
comment on column public.youtube_profiles.duration_seconds is
  '길이(초). 사람이 보는 모양은 화면이 만든다. 라이브처럼 못 알아본 값은 비운다.';

create index if not exists youtube_profiles_owner_idx
  on public.youtube_profiles (owner_id);

-- "이 영상을 이미 담았나"를 묻는 길. 한 사람 안에서만 본다.
create index if not exists youtube_profiles_owner_video_idx
  on public.youtube_profiles (owner_id, video_id);


-- -----------------------------------------------------------------------------
-- 2. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 영상 정보를
-- 붙일 수 있으므로 트리거가 참조 대상을 확인한다.
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_youtube_profile_owner()
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

drop trigger if exists youtube_profiles_set_owner on public.youtube_profiles;
create trigger youtube_profiles_set_owner
  before insert on public.youtube_profiles
  for each row
  execute function public.set_youtube_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  `source_id`를 고칠 수 있으면 가 영상의 정보가 나 자료에 붙는다. 자기
  자료끼리라도 막는다. 붙일 자료를 잘못 골랐다면 지우고 다시 만든다.
  `website_profiles`·`book_profiles`와 같은 판단이다.

  **`video_id`는 막지 않는다.** 다른 주소를 넣어 다시 찾아오는 것은 정상적인
  일이다. 음악에서 배운 것이다. "적어둔 것을 덮지 않는다"를 뭉뚱그려 걸었더니
  한 곡을 채운 뒤 다른 곡으로 바꿀 수 없었다. (`AGENTS.md` 2절)
*/
create or replace function public.guard_youtube_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'youtube_profiles.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'youtube_profiles.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'youtube_profiles.source_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'youtube_profiles.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists youtube_profiles_guard_immutable_columns
  on public.youtube_profiles;
create trigger youtube_profiles_guard_immutable_columns
  before update on public.youtube_profiles
  for each row
  execute function public.guard_youtube_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.youtube_profiles from anon, authenticated;

grant select, insert, update, delete on table public.youtube_profiles
  to authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.youtube_profiles enable row level security;

drop policy if exists youtube_profiles_select_own on public.youtube_profiles;
create policy youtube_profiles_select_own
  on public.youtube_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists youtube_profiles_insert_own on public.youtube_profiles;
create policy youtube_profiles_insert_own
  on public.youtube_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists youtube_profiles_update_own on public.youtube_profiles;
create policy youtube_profiles_update_own
  on public.youtube_profiles
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

drop policy if exists youtube_profiles_delete_own on public.youtube_profiles;
create policy youtube_profiles_delete_own
  on public.youtube_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
