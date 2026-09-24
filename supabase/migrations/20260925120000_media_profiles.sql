-- =============================================================================
-- 영화·드라마 자료 (15-E-2c)
-- =============================================================================
-- 설계 문서 15절.
--
-- 대부분은 이미 sources에 있다
--   제목        sources.title
--   줄거리      sources.description
--   포스터      sources.thumbnail_url
--   TMDB 주소   sources.original_url
--   담은 날     sources.created_at
--   메모        captures
--
--   그래서 여기에는 나머지만 둔다. website_profiles·book_profiles·
--   youtube_profiles와 같은 판단이다.
--
-- 영화와 드라마를 한 표에 담는다
--   TMDB는 `movie`와 `tv`를 다른 것으로 다룬다. 주소도 다르고 돌려주는
--   칸도 다르다. 그래도 우리 쪽에서는 한 표다.
--
--   나누면 **"이 자료가 어느 표에 있나"를 묻는 일이 화면마다 생긴다.**
--   담기는 값의 팔 할이 같고, 다른 것은 시즌·회차뿐이다. 그 둘을 비워둘 수
--   있게 두는 편이 표를 나누는 것보다 단순하다.
--
--   대신 `media_kind`로 갈라 담는다. 어느 쪽인지는 TMDB에 다시 물을 때
--   반드시 필요하다. 같은 번호가 영화에도 드라마에도 있기 때문이다.
--
-- tmdb_id와 media_kind가 함께 열쇠다
--   TMDB의 번호는 **영화와 드라마가 따로 센다.** `id=1396`이 영화에도
--   있고 드라마에도 있다. 번호만 담으면 다시 물을 때 엉뚱한 것이 온다.
--
-- 개봉일은 날짜로 담는다
--   책의 출판일은 글로 담았다. `2017년 3월`처럼 제각각으로 오기 때문이다.
--   TMDB는 늘 `YYYY-MM-DD`이거나 빈 글자다. 기계가 주는 값이라 제각각일
--   이유가 없다. 빈 글자는 날짜가 아니므로 비워 둔다.
--
-- 출연진을 이름만 담는다
--   15절이 출연진을 가져오라고 한다. 사람마다 배역·사진·TMDB 번호가 함께
--   오지만 **이름만 담는다.**
--
--   배역까지 담으려면 이름과 배역을 짝지어 담을 모양을 정해야 하고(jsonb),
--   그러면 그 모양을 읽는 코드와 검사가 따라온다. **지금 화면이 하는 일은
--   "누가 나오나"를 한 줄로 보여주는 것뿐이다.**
--   필요해지면 그때 늘린다. (`AGENTS.md` 2절)
--
-- 시청 서비스는 여기 없다
--   15절의 watch provider와 `last_synced_at`은 다음 단계(15-E-2c-2)다.
--   **같은 표에 나중에 칸을 더하지 않고 표를 따로 만들 것이다.** 한 자료에
--   여러 곳이 붙고, 나라마다 다르고, 받아온 때를 따로 적어야 한다.
--   한 줄에 담기는 모양이 아니다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 영화인가 드라마인가. TMDB가 나누는 그대로다.
--   movie  영화
--   tv     드라마·시리즈
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'media_kind' and n.nspname = 'public'
  ) then
    create type public.media_kind as enum ('movie', 'tv');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 표
-- -----------------------------------------------------------------------------

create table if not exists public.media_profiles (
  id              uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id        uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,

  -- 자료 하나에 작품 정보는 하나다.
  source_id       uuid not null unique
                    references public.sources (id) on delete cascade,

  /*
    TMDB의 번호와 갈래. **둘이 함께 열쇠다.** (머리말 참고)

    번호를 담는 이유는 다시 물을 수 있어야 하기 때문이다. 제목으로 다시
    찾으면 같은 이름의 다른 작품이 올 수 있다.
  */
  tmdb_id         integer not null,
  media_kind      public.media_kind not null,

  -- 원제. 번역 제목과 다를 때가 많고, 찾을 때 이쪽이 더 정확하다.
  original_title  text,

  -- 개봉일·첫 방영일. 기계가 주는 값이라 날짜로 담는다. (머리말 참고)
  released_on     date,

  -- 장르 이름들. TMDB가 번호로 주는 것을 이름으로 바꿔 담는다.
  genres          text[] not null default array[]::text[],

  -- 주요 출연진 이름. 배역은 담지 않는다. (머리말 참고)
  cast_names      text[] not null default array[]::text[],

  /*
    길이(분).

    영화는 상영 시간이고 드라마는 한 회차의 평균 길이다. 드라마는 회차마다
    달라서 TMDB도 목록으로 주는데, 우리는 첫 값만 담는다. **"대충 몇 분짜리
    인가"에 답하는 값**이고 그 이상으로 쓰지 않는다.
  */
  runtime_minutes integer,

  -- 드라마만. 영화에서는 비어 있다.
  season_count    integer,
  episode_count   integer,

  -- 이 값들을 언제 받아왔는지. 방영 중인 드라마는 회차가 늘어난다.
  fetched_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint media_profiles_tmdb_id_positive check (tmdb_id > 0),
  constraint media_profiles_original_title_length check (
    original_title is null or char_length(original_title) <= 500
  ),
  /*
    목록에 든 값들의 모양.

    빈 글자와 터무니없이 긴 값을 막는다. 밖에서 온 값이 그대로 들어오는
    자리이고, 빈 글자가 섞이면 화면에 `액션, , 드라마`로 보인다.

    **`CHECK` 안에는 서브쿼리를 쓸 수 없다.** 칸마다 보려면 `unnest`가
    필요하고 그것이 서브쿼리다. 그래서 이미 있는 `book_names_valid`를
    부른다. 개수 50, 칸마다 200자를 보는 같은 규칙이라 두 벌 만들지 않는다.
    (`paper_authors_valid`와 `book_names_valid`가 같은 자리의 함수다)
  */
  constraint media_profiles_genres_valid check (
    public.book_names_valid(genres)
  ),
  constraint media_profiles_cast_valid check (
    public.book_names_valid(cast_names)
  ),
  /*
    길이는 0보다 커야 한다.

    0분짜리 작품은 없다. 0이 담겼다면 TMDB가 모르는 값을 0으로 준 것이고,
    그러면 화면에 `0분`이 떠서 사용자는 잘못 담겼다고 생각한다.
    위쪽 한계는 24시간이다.
  */
  constraint media_profiles_runtime_range check (
    runtime_minutes is null
    or (runtime_minutes > 0 and runtime_minutes <= 1440)
  ),
  constraint media_profiles_season_range check (
    season_count is null or (season_count > 0 and season_count <= 1000)
  ),
  constraint media_profiles_episode_range check (
    episode_count is null or (episode_count > 0 and episode_count <= 100000)
  ),
  /*
    시즌과 회차는 드라마에만 있다.

    영화에 담기면 화면이 `시즌 1`을 보여주게 되고, 그것은 틀린 말이다.
    **모양으로 막을 수 있는 것은 모양으로 막는다.**
  */
  constraint media_profiles_seasons_only_for_tv check (
    media_kind = 'tv'::public.media_kind
    or (season_count is null and episode_count is null)
  )
);

comment on table public.media_profiles is
  '영화·드라마 작품 정보. 제목·줄거리·포스터는 sources가 담는다. (설계 문서 15절)';
comment on column public.media_profiles.tmdb_id is
  'TMDB 번호. media_kind와 함께 열쇠다. 영화와 드라마가 번호를 따로 센다.';
comment on column public.media_profiles.cast_names is
  '주요 출연진 이름. 배역은 담지 않는다. 화면이 하는 일은 누가 나오는지 한 줄로 보여주는 것이다.';
comment on column public.media_profiles.runtime_minutes is
  '길이(분). 영화는 상영 시간, 드라마는 한 회차의 평균이다.';

create index if not exists media_profiles_owner_idx
  on public.media_profiles (owner_id);

-- "이 작품을 이미 담았나"를 묻는 길. 한 사람 안에서만 본다.
create index if not exists media_profiles_owner_work_idx
  on public.media_profiles (owner_id, media_kind, tmdb_id);


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 작품 정보를
-- 붙일 수 있으므로 트리거가 참조 대상을 확인한다.

create or replace function public.set_media_profile_owner()
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

drop trigger if exists media_profiles_set_owner on public.media_profiles;
create trigger media_profiles_set_owner
  before insert on public.media_profiles
  for each row
  execute function public.set_media_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  `source_id`를 고칠 수 있으면 가 작품의 정보가 나 자료에 붙는다. 자기
  자료끼리라도 막는다.

  **`tmdb_id`와 `media_kind`는 막지 않는다.** 다른 작품을 골라 다시 담는
  것은 정상적인 일이다. 같은 이름의 다른 작품을 잘못 고르는 일이 흔하고,
  그때 자료를 지우고 다시 만들게 하면 적어둔 메모가 함께 사라진다.
  (15-E에서 음악으로 겪은 것과 같은 자리다)
*/
create or replace function public.guard_media_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'media_profiles.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'media_profiles.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'media_profiles.source_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'media_profiles.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists media_profiles_guard_immutable_columns
  on public.media_profiles;
create trigger media_profiles_guard_immutable_columns
  before update on public.media_profiles
  for each row
  execute function public.guard_media_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.media_profiles from anon, authenticated;

grant select, insert, update, delete on table public.media_profiles
  to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.media_profiles enable row level security;

drop policy if exists media_profiles_select_own on public.media_profiles;
create policy media_profiles_select_own
  on public.media_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists media_profiles_insert_own on public.media_profiles;
create policy media_profiles_insert_own
  on public.media_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists media_profiles_update_own on public.media_profiles;
create policy media_profiles_update_own
  on public.media_profiles
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

drop policy if exists media_profiles_delete_own on public.media_profiles;
create policy media_profiles_delete_own
  on public.media_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
