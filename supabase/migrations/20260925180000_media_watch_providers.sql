-- =============================================================================
-- 볼 수 있는 곳 (15-E-2c-2)
-- =============================================================================
-- 설계 문서 15절.
--
--   "한국 지역의 watch provider 정보를 조회한다."
--   "제공처 정보에는 last_synced_at을 저장한다."
--   "사용자가 직접 입력한 시청 서비스와 API 조회 결과를 구분한다."
--   "OTT 영상 자체를 임베드하거나 다운로드하지 않는다."
--
-- 표를 따로 만든다
--   `media_profiles`에 칸을 더하지 않는다. 한 작품에 볼 수 있는 곳이 여럿
--   붙고(넷플릭스·웨이브·쿠팡플레이…), 같은 곳이 **보는 방법마다 따로**
--   온다(구독·대여·구매). 한 줄에 담기는 모양이 아니다.
--
--   `music_provider_links`와 같은 자리의 표다. 다만 그쪽은 사용자가 주소를
--   붙여넣는 것이고 이쪽은 **대부분 밖에서 받아온다.**
--
-- 받아온 것과 적은 것을 나눈다
--   15절이 못 박은 것이다. `origin`으로 가른다.
--
--     api     TMDB에서 받아왔다. 다시 받으면 통째로 바뀐다
--     manual  사용자가 직접 적었다. **다시 받아도 지우지 않는다**
--
--   나누지 않으면 다시 받아올 때 사용자가 적어둔 것까지 쓸려 나간다.
--   지킬 것은 *사용자가 적은 값*이고 *우리가 채운 값*이 아니다.
--   (`AGENTS.md` 2절, 15-E에서 음악으로 겪은 것)
--
--   TMDB가 모르는 곳이 있다. 지역 서비스나 도서관 영상 서비스가 그렇다.
--   그것을 적어둘 자리가 있어야 이 기능이 쓸모 있다.
--
-- 언제 받아왔는지는 작품 쪽에 적는다
--   `media_profiles`에 `watch_synced_at`을 더한다. 줄마다 적지 않는 이유는
--   **한 번에 함께 받아오기 때문이다.** 줄마다 두면 같은 값이 열 번 담기고,
--   그중 하나만 달라졌을 때 어느 것이 맞는지 알 수 없게 된다.
--
--   받아온 때를 적는 이유는 이 값이 **빨리 낡기 때문이다.** 넷플릭스에서
--   내려가고 웨이브에 올라오는 일이 흔하다. 화면이 "언제 기준인지"를
--   함께 보여줘야 사용자가 헛걸음하지 않는다.
--
-- 영상 자체는 다루지 않는다
--   15절: "OTT 영상 자체를 임베드하거나 다운로드하지 않는다."
--   이 표에 담기는 것은 **어디서 볼 수 있는지와 그곳으로 가는 주소**뿐이다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

/*
  보는 방법. TMDB가 나누는 그대로다.

    flatrate  구독하면 볼 수 있다 (넷플릭스처럼)
    rent      빌려 본다
    buy       사서 본다
    free      무료로 볼 수 있다
    ads       광고를 보면 무료다

  다섯을 나누는 이유는 **사용자가 할 일이 다르기 때문이다.** 이미 구독
  중인 곳이면 바로 보면 되고, 사야 하는 곳이면 돈을 내야 한다. 뭉뚱그려
  "볼 수 있는 곳"으로만 보여주면 눌러보고 나서야 안다.
*/
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'watch_offer_kind' and n.nspname = 'public'
  ) then
    create type public.watch_offer_kind as enum (
      'flatrate', 'rent', 'buy', 'free', 'ads'
    );
  end if;
end
$$;

-- 이 줄이 어디서 왔나. (머리말 참고)
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'watch_provider_origin' and n.nspname = 'public'
  ) then
    create type public.watch_provider_origin as enum ('api', 'manual');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 작품 쪽에 더하는 칸
-- -----------------------------------------------------------------------------

-- 언제 받아왔는지. 줄마다 적지 않는 이유는 머리말에 있다.
alter table public.media_profiles
  add column if not exists watch_synced_at timestamptz;

/*
  JustWatch의 그 작품 페이지.

  TMDB가 이 주소를 함께 준다. **표시 조건의 일부이기도 하다.** TMDB는
  watch provider 자료를 쓸 때 출처를 JustWatch로 밝히라고 요구한다.
  그 요구를 화면의 글과 이 주소 둘로 지킨다.
*/
alter table public.media_profiles
  add column if not exists watch_link text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'media_profiles_watch_link_scheme'
  ) then
    alter table public.media_profiles
      add constraint media_profiles_watch_link_scheme check (
        watch_link is null
        or watch_link like 'https://%'
      );
  end if;
end
$$;

comment on column public.media_profiles.watch_synced_at is
  '볼 수 있는 곳을 언제 받아왔는지. 이 값은 빨리 낡는다.';
comment on column public.media_profiles.watch_link is
  'JustWatch의 그 작품 페이지. TMDB 표시 조건을 지키는 데 함께 쓴다.';


-- -----------------------------------------------------------------------------
-- 3. 표
-- -----------------------------------------------------------------------------

create table if not exists public.media_watch_providers (
  id            uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  source_id     uuid not null
                  references public.sources (id) on delete cascade,

  -- 서비스 이름. `넷플릭스`, `웨이브`처럼.
  provider_name text not null,

  -- 보는 방법. (머리말 참고)
  offer_kind    public.watch_offer_kind not null,

  -- 받아온 것인가 적은 것인가. **다시 받아올 때 무엇을 지킬지 가른다.**
  origin        public.watch_provider_origin not null default 'manual',

  /*
    화면에 늘어놓을 순서.

    TMDB가 `display_priority`로 준다. 그 순서에는 뜻이 있어서(그 나라에서
    많이 쓰는 곳이 앞) 우리가 다시 매기지 않는다. 직접 적은 것은 받아온
    것 뒤에 온다.
  */
  display_order integer not null default 0,

  created_at    timestamptz not null default now(),

  constraint media_watch_providers_name_length check (
    char_length(pg_catalog.btrim(provider_name)) between 1 and 200
  ),
  constraint media_watch_providers_name_trimmed check (
    provider_name = pg_catalog.btrim(provider_name)
  ),
  constraint media_watch_providers_order_range check (
    display_order >= 0 and display_order <= 10000
  ),

  /*
    같은 작품에 같은 곳이 같은 방법으로 두 번 담기지 않는다.

    `보는 방법`을 열쇠에 넣는 이유는, 한 곳에서 **빌릴 수도 있고 살 수도**
    있기 때문이다. 그 둘은 다른 줄이다.
  */
  unique (source_id, provider_name, offer_kind)
);

comment on table public.media_watch_providers is
  '그 작품을 볼 수 있는 곳. 받아온 것과 직접 적은 것을 origin으로 가른다. (설계 문서 15절)';
comment on column public.media_watch_providers.origin is
  'api면 다시 받아올 때 지워지고, manual이면 남는다. 지킬 것은 사용자가 적은 값이다.';

create index if not exists media_watch_providers_owner_idx
  on public.media_watch_providers (owner_id);

-- 한 작품의 목록을 순서대로 가져온다.
create index if not exists media_watch_providers_source_idx
  on public.media_watch_providers (source_id, display_order);


-- -----------------------------------------------------------------------------
-- 4. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 붙일 수 있다.

create or replace function public.set_media_watch_provider_owner()
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

drop trigger if exists media_watch_providers_set_owner
  on public.media_watch_providers;
create trigger media_watch_providers_set_owner
  before insert on public.media_watch_providers
  for each row
  execute function public.set_media_watch_provider_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  **`origin`을 못 바꾸게 한다.** 이 표에서 가장 중요한 가드다. 바꿀 수
  있으면 받아온 줄을 `manual`로 바꿔 다시 받아올 때 살아남게 하거나,
  사용자가 적은 줄을 `api`로 바꿔 쓸려 나가게 할 수 있다. 어느 쪽도
  사용자가 뜻한 일이 아니다.

  잘못 적었으면 지우고 다시 적는다. 줄 하나가 짧아서 그 편이 낫다.
*/
create or replace function public.guard_media_watch_provider_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'media_watch_providers.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'media_watch_providers.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'media_watch_providers.source_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.origin is distinct from old.origin then
    raise exception 'media_watch_providers.origin은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'media_watch_providers.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists media_watch_providers_guard_columns
  on public.media_watch_providers;
create trigger media_watch_providers_guard_columns
  before update on public.media_watch_providers
  for each row
  execute function public.guard_media_watch_provider_columns();


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.media_watch_providers from anon, authenticated;

grant select, insert, update, delete on table public.media_watch_providers
  to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. is_active_user()를 함께 건다.

alter table public.media_watch_providers enable row level security;

drop policy if exists media_watch_providers_select_own
  on public.media_watch_providers;
create policy media_watch_providers_select_own
  on public.media_watch_providers
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists media_watch_providers_insert_own
  on public.media_watch_providers;
create policy media_watch_providers_insert_own
  on public.media_watch_providers
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists media_watch_providers_update_own
  on public.media_watch_providers;
create policy media_watch_providers_update_own
  on public.media_watch_providers
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

drop policy if exists media_watch_providers_delete_own
  on public.media_watch_providers;
create policy media_watch_providers_delete_own
  on public.media_watch_providers
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
