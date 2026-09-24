-- =============================================================================
-- 음악 자료 (15-D)
-- =============================================================================
-- 설계 문서 13절, 20절의 `music_profiles`와 `music_provider_links`.
--
-- 이번 단계의 범위
--   22절 MVP 목록의 "음악 Source 수동 등록, 공급자 링크 및 시간 위치 Capture"다.
--   MusicBrainz·앨범 표지·음악 서비스 자동 메타데이터는 **MVP 이후**이므로
--   손대지 않는다. 여기 담기는 값은 전부 사람이 손으로 적는 것이다.
--
-- sources가 이미 담는 것
--   곡명          sources.title
--   앨범 표지     sources.thumbnail_url
--   설명·감상     sources.description, captures
--   프로젝트·태그 source_projects, source_tags
--   버전 사이 관계 source_relations (13.1절, 13.7절)
--
--   그래서 이 표에는 13.2절의 나머지만 둔다. 같은 값을 두 곳에 두면 어느
--   쪽이 맞는지 알 수 없게 된다. (website_profiles와 같은 판단)
--
-- 발매일을 글로 담는다
--   `2024-03-15`도 오고 `2024년 3월`도 오고 `2024`만 오기도 한다. 옛 음반은
--   달까지만 알려진 것이 흔하다. 날짜로 담으려면 모르는 자리를 지어내야
--   하는데, **지어내는 것보다 아는 만큼만 담는 편이 낫다.**
--   paper_profiles의 권·호·쪽, website_profiles의 게시일과 같은 판단이다.
--
-- 재생 시간도 초로 담는다
--   `3:45`를 글로 담으면 `03:45`와 다른 값이 된다. 사람이 보는 모양은
--   src/lib/music/time.ts가 만든다.
--
-- ISRC와 MusicBrainz ID를 두지 않는다
--   13.2절에 있지만 **손으로 적는 값이 아니다.** 기계가 채우는 식별자이고,
--   그것을 채우는 기능(자동 메타데이터)은 MVP 이후다. 지금 칸만 만들어두면
--   빈 칸이 화면에 남아 "여기는 왜 안 되지"를 묻게 된다. 자동 가져오기를
--   만들 때 20절의 `source_external_ids`와 함께 정한다.
--   AGENTS.md 2절의 "쓰지 않을 값을 미리 넣지 않는다"와 같은 생각이다.
--
-- 공급자 링크에 서비스 이름을 담지 않는다
--   주소에서 알아본다. 담게 하면 `spotify`와 `Spotify`가 섞이고, 무엇보다
--   **고른 것과 붙여넣은 주소가 어긋나는 일**을 아무도 막지 못한다.
--   스포티파이를 고르고 유튜브 주소를 넣어도 통과한다. 주소가 곧 답이다.
--   알아보는 규칙은 src/lib/music/providers.ts에 있다.
--
-- 저작권 (13.6절)
--   음원 파일을 담지 않는다. 이 표에 담기는 것은 링크와 사람이 적은 글뿐이다.
--   가사 전문을 받아오는 길도 만들지 않는다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 음악 정보
-- -----------------------------------------------------------------------------

create table if not exists public.music_profiles (
  id             uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id       uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,

  source_id      uuid not null unique
                   references public.sources (id) on delete cascade,

  -- 13.2절. 곡명은 sources.title이 담는다.
  artist         text,
  album_name     text,
  album_artist   text,

  -- 아는 만큼만 담는다. (머리말 참고)
  released_on    text,

  track_number   integer,

  -- 초. 사람이 보는 모양은 화면이 만든다.
  duration_seconds integer,

  genre          text,
  language       text,
  composer       text,
  lyricist       text,
  arranger       text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint music_profiles_artist_length check (
    artist is null or char_length(artist) <= 300
  ),
  constraint music_profiles_album_name_length check (
    album_name is null or char_length(album_name) <= 300
  ),
  constraint music_profiles_album_artist_length check (
    album_artist is null or char_length(album_artist) <= 300
  ),
  constraint music_profiles_released_on_length check (
    released_on is null or char_length(released_on) <= 100
  ),
  constraint music_profiles_genre_length check (
    genre is null or char_length(genre) <= 200
  ),
  constraint music_profiles_language_length check (
    language is null or char_length(language) <= 100
  ),
  constraint music_profiles_composer_length check (
    composer is null or char_length(composer) <= 300
  ),
  constraint music_profiles_lyricist_length check (
    lyricist is null or char_length(lyricist) <= 300
  ),
  constraint music_profiles_arranger_length check (
    arranger is null or char_length(arranger) <= 300
  ),

  -- 트랙 번호는 한 장에 백 곡을 넘지 않는다. 잘못 친 값을 거른다.
  constraint music_profiles_track_number_range check (
    track_number is null or (track_number >= 1 and track_number <= 999)
  ),
  -- 24시간. 실황 전체를 담을 수도 있다. time.ts의 MAX_POSITION_SECONDS와 같다.
  constraint music_profiles_duration_range check (
    duration_seconds is null
    or (duration_seconds >= 0 and duration_seconds <= 86400)
  )
);

comment on table public.music_profiles is
  '음악 자료의 추가 정보. 사람이 손으로 적는다. (설계 문서 13.2절)';
comment on column public.music_profiles.released_on is
  '발매일. 아는 만큼만 글로 담는다. 옛 음반은 달까지만 알려진 것이 흔하다.';
comment on column public.music_profiles.duration_seconds is
  '재생 시간(초). 사람이 보는 모양은 src/lib/music/time.ts가 만든다.';

create index if not exists music_profiles_owner_idx
  on public.music_profiles (owner_id);


-- -----------------------------------------------------------------------------
-- 2. 공급자 링크
-- -----------------------------------------------------------------------------
-- 13.6절: 음원 파일을 복제하지 않고 공식 서비스의 링크를 쓴다.

create table if not exists public.music_provider_links (
  id         uuid primary key default gen_random_uuid(),

  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,

  source_id  uuid not null references public.sources (id) on delete cascade,

  url        text not null,

  created_at timestamptz not null default now(),

  constraint music_provider_links_url_length check (
    char_length(url) between 1 and 2000
  ),
  /*
    http와 https만. 화면의 링크에 들어갈 값이고 `javascript:`가 거기 들어가면
    누르는 순간 실행된다. 화면도 막지만 여기서도 막는다.
  */
  constraint music_provider_links_url_scheme check (
    url like 'http://%' or url like 'https://%'
  ),

  -- 같은 자료에 같은 주소를 두 번 담지 않는다. 둘이면 어느 것을 지울지
  -- 화면에서 가릴 수 없다.
  unique (source_id, url)
);

comment on table public.music_provider_links is
  '음악을 들을 수 있는 공식 서비스 링크. 서비스 이름은 주소에서 알아본다.';

create index if not exists music_provider_links_source_idx
  on public.music_provider_links (source_id, created_at);
create index if not exists music_provider_links_owner_idx
  on public.music_provider_links (owner_id);


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 이 확인이 없으면 자료 id만 알면 남의
-- 자료에 음악 정보를 붙일 수 있다.

create or replace function public.set_music_profile_owner()
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

drop trigger if exists music_profiles_set_owner on public.music_profiles;
create trigger music_profiles_set_owner
  before insert on public.music_profiles
  for each row
  execute function public.set_music_profile_owner();


create or replace function public.guard_music_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'music_profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'music_profiles.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- source_id를 바꿀 수 있으면 A 곡을 두고 적은 정보가 B 곡의 것이 된다.
  if new.source_id is distinct from old.source_id then
    raise exception 'music_profiles.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'music_profiles.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists music_profiles_guard_immutable_columns
  on public.music_profiles;
create trigger music_profiles_guard_immutable_columns
  before update on public.music_profiles
  for each row
  execute function public.guard_music_profile_immutable_columns();


create or replace function public.set_music_provider_link_owner()
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

  return new;
end;
$$;

drop trigger if exists music_provider_links_set_owner
  on public.music_provider_links;
create trigger music_provider_links_set_owner
  before insert on public.music_provider_links
  for each row
  execute function public.set_music_provider_link_owner();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.music_profiles from anon, authenticated;
revoke all on table public.music_provider_links from anon, authenticated;

grant select, insert, update, delete on table public.music_profiles
  to authenticated;

-- 링크는 잇거나 끊는 것뿐이다. 고칠 것이 없으므로 UPDATE를 주지 않는다.
-- 주소를 잘못 넣었다면 지우고 다시 넣는다. (source_relations와 같다)
grant select, insert, delete on table public.music_provider_links
  to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

alter table public.music_profiles enable row level security;
alter table public.music_provider_links enable row level security;

drop policy if exists music_profiles_select_own on public.music_profiles;
create policy music_profiles_select_own
  on public.music_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists music_profiles_insert_own on public.music_profiles;
create policy music_profiles_insert_own
  on public.music_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists music_profiles_update_own on public.music_profiles;
create policy music_profiles_update_own
  on public.music_profiles
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

drop policy if exists music_profiles_delete_own on public.music_profiles;
create policy music_profiles_delete_own
  on public.music_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


drop policy if exists music_provider_links_select_own
  on public.music_provider_links;
create policy music_provider_links_select_own
  on public.music_provider_links
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists music_provider_links_insert_own
  on public.music_provider_links;
create policy music_provider_links_insert_own
  on public.music_provider_links
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists music_provider_links_delete_own
  on public.music_provider_links;
create policy music_provider_links_delete_own
  on public.music_provider_links
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
