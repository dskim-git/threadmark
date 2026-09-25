-- =============================================================================
-- 장소 자료 (17-1)
-- =============================================================================
-- 설계 문서 17-1절. (2026-09-25, 사용자 요청)
--
-- 대부분은 이미 sources에 있다
--   장소 이름      sources.title
--   왜 담았는지    sources.description
--   지도 주소      sources.original_url
--   담은 날        sources.created_at
--   그곳의 생각    captures
--   프로젝트·태그  source_projects, source_tags
--
--   그래서 여기에는 나머지만 둔다. **같은 뜻의 칸이 두 벌이 되면 한쪽이
--   저장되지 않는다.** 15-E에서 곡 이름을 두 곳에 두었다가 겪었다.
--   youtube_profiles·book_profiles와 같은 판단이다.
--
-- 받아온 것과 적은 것을 가른다
--   다시 받아올 때 무엇을 지킬지가 여기서 갈린다. (AGENTS.md 2절, 15-E)
--   visit_status만 사람이 적는 값이고 나머지는 밖에서 온 값이다.
--
-- 지도를 그리지 않는다
--   1단계에서는 좌표까지 담아두고, 화면에는 지도 대신 **그 지도로 가는
--   링크**를 둔다. 지도를 그리려면 열쇠와 도메인 등록이 따로 필요하고,
--   이 저장소는 도메인 등록을 빠뜨려 두 번 막혔다. (AGENTS.md 6절 12-A·12-C)
--
--   **좌표를 담아두면 2단계가 얹기만 하는 일이 된다.** 담는 것과 보여주는
--   것이 갈려 있어 1단계가 헛일이 되지 않는다. (17-1.2절)
--
-- 영업시간·평점·사진은 담지 않는다
--   밖에서 받아와도 **금방 낡고, 낡은 값이 맞는 값처럼 보인다.** 필요하면
--   place_url로 보낸다. (17-1.5절)
--
-- 위치 정보를 두지 않는다
--   PDF의 쪽, 영상의 시점 같은 것이 장소에는 없다. Capture에 장소용 위치
--   칸을 만들지 않는다. 필요해지면 그때 만든다.
--   (AGENTS.md 2절 "쓰지 않을 값을 미리 넣지 않는다")
--
-- 없어진 가게
--   장소는 문을 닫는다. 그래도 아무 제약도 걸지 않는다. 다시 찾아왔을 때
--   없으면 **채워둔 값을 지우지 않고 그대로 둔다.** 지우는 것은 우리가
--   사용자의 기록을 지우는 일이다. fetched_at이 언제 본 값인지 말한다.
--   youtube_profiles의 판단과 같다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

/*
  어디서 받아온 값인가.

  **국내는 카카오, 해외는 구글이다.** 찾는 곳과 보여주는 곳을 가른 표가
  17-1.3절에 있다. 1단계는 카카오만 쓴다.

  google을 지금 함께 넣는 까닭. 이것은 늘어나는 목록이 아니라 **닫힌
  둘이다.** 국내와 해외뿐이고, 값이 뜻하는 것이 이미 17-1.3절에서 정해졌다.
  ai_feature처럼 기능이 늘어날 때마다 값이 붙는 자리라면 미리 넣지 않는
  것이 옳지만(20260925230000이 그 예다), 여기는 그렇지 않다.

  **manual을 두지 않는다.** 직접 적은 장소는 이 칸이 비어 있는 것으로
  드러난다. 비움과 manual을 둘 다 두면 같은 뜻의 값이 두 벌이 되고,
  그러면 화면이 어느 쪽을 보고 판단해야 하는지 알 수 없어진다.
*/
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'place_provider' and n.nspname = 'public'
  ) then
    create type public.place_provider as enum (
      'kakao',   -- 국내. 카카오 Local
      'google'   -- 해외. (17-1.3절) 찾아오는 쪽은 아직 만들지 않았다
    );
  end if;
end
$$;

/*
  가봤는가.

  **이 칸은 비워둘 수 있다.** (2026-09-25, 사용자가 정함) 여행 준비에는
  가보고 싶다와 가봤다가 갈리지만 수업 준비에는 그 구분이 쓸모없을 수
  있다. 안 정하면 화면에 아무것도 보이지 않는다.

  그래서 상태가 셋이다. 비움(안 정함) · want_to_visit · visited.
  **비어 있는 것과 가보고 싶다는 다르다.** 참/거짓 하나로 두면 안 정한
  것이 가보고 싶다로 보인다. (15-E-2c-2b에서 "비어 있는 것과 1은 다르다"를
  겪었다)

  book_profiles.reading_status와 달리 기본값을 두지 않는 것이 이 때문이다.
  책은 담는 순간 unread가 참이지만, 장소는 담는 순간 아직 정해진 것이 없다.
*/
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'place_visit_status' and n.nspname = 'public'
  ) then
    create type public.place_visit_status as enum (
      'want_to_visit',  -- 가보고 싶다
      'visited'         -- 가봤다
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 표
-- -----------------------------------------------------------------------------

create table if not exists public.place_profiles (
  id            uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  -- 자료 하나에 장소 정보는 하나다.
  source_id     uuid not null unique
                  references public.sources (id) on delete cascade,

  -- --- 받아온 것 ---------------------------------------------------------

  -- 어디서 온 값인지 밝힌다. 비어 있으면 직접 적은 장소다.
  provider      public.place_provider,

  -- 그쪽의 장소 번호. 다시 받아올 열쇠다.
  external_id   text,

  /*
    주소가 둘이다.

    국내는 도로명 주소와 지번 주소가 **둘 다 쓰인다.** 카카오도 둘을 함께
    준다. 한쪽만 담으면 사용자가 기억하는 쪽이 없을 수 있다. 오래된 가게는
    지번으로 기억되고 새 건물은 도로명으로만 있다.
  */
  road_address  text,
  address       text,

  /*
    좌표. **이것이 핵심이다.**

    지도를 나중에 얹을 수 있게 하는 값이고, 지금도 지도로 가는 링크를 만드는
    데 쓴다. 이름만 넘기면 엉뚱한 곳이 열리지만 좌표는 한 곳을 가리킨다.

    numeric으로 담는다. 링크에 그대로 실어 보내는 값이라 double precision의
    반올림이 주소창에 드러나면 안 된다.
  */
  latitude      numeric(9, 6),
  longitude     numeric(9, 6),

  /*
    분류. 음식점, 카페, 관광명소 같은 말이다.

    **이것이 있어야 "그 맛집 어디였지"로 찾힌다.** 사람은 가게 이름보다
    무엇하는 곳이었는지를 먼저 떠올린다.
  */
  category      text,

  -- 받아온 김에. 가볼 곳이면 문 열었는지 물어볼 데가 있어야 한다.
  phone         text,

  -- 그 서비스의 상세 화면. 영업시간·평점·사진은 여기로 보낸다.
  place_url     text,

  -- 언제 받았는지. **장소는 없어지기도 한다.**
  fetched_at    timestamptz,

  -- --- 적은 것 -----------------------------------------------------------

  -- 가봤는가. 비워둘 수 있다. (위 열거형 설명 참고)
  visit_status  public.place_visit_status,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  /*
    밖에서 온 값이 그대로 들어오는 자리다. 범위를 건다.

    위도 -90~90, 경도 -180~180. 뒤바뀐 좌표가 이 그물에 걸린다. 경도
    127을 위도 칸에 넣으면 여기서 막힌다. 안 막으면 지도 링크가 바다
    한가운데를 열고, 사용자는 우리가 장소를 잃었다고 생각한다.
  */
  constraint place_profiles_latitude_range check (
    latitude is null or (latitude >= -90 and latitude <= 90)
  ),
  constraint place_profiles_longitude_range check (
    longitude is null or (longitude >= -180 and longitude <= 180)
  ),
  /*
    **좌표는 짝이다.** 하나만 있으면 지도를 열 수 없다.

    한쪽만 담기면 화면은 좌표가 있다고 보고 링크를 만들지만 그 링크는
    깨진다. 오류 없이 엉뚱한 곳이 열리는 쪽이 더 나쁘다.
  */
  constraint place_profiles_coordinate_pair check (
    (latitude is null) = (longitude is null)
  ),
  /*
    **받아온 값에는 어디서 받았는지가 함께 있어야 한다.**

    external_id나 fetched_at만 있고 provider가 비어 있으면 다시 받아올 길이
    없다. 그 번호가 카카오 것인지 구글 것인지 모르는 채 남는다.
  */
  constraint place_profiles_provider_required check (
    provider is not null or (external_id is null and fetched_at is null)
  ),
  /*
    누르는 순간 실행되는 링크를 담지 않는다. (검사 106과 같은 이유)

    카카오는 http://place.map.kakao.com/... 을 주므로 http도 받는다.
  */
  constraint place_profiles_place_url_scheme check (
    place_url is null
    or place_url like 'http://%'
    or place_url like 'https://%'
  ),
  constraint place_profiles_external_id_length check (
    external_id is null or char_length(external_id) <= 200
  ),
  constraint place_profiles_road_address_length check (
    road_address is null or char_length(road_address) <= 500
  ),
  constraint place_profiles_address_length check (
    address is null or char_length(address) <= 500
  ),
  constraint place_profiles_category_length check (
    category is null or char_length(category) <= 200
  ),
  constraint place_profiles_phone_length check (
    phone is null or char_length(phone) <= 50
  ),
  constraint place_profiles_place_url_length check (
    place_url is null or char_length(place_url) <= 2000
  )
);

comment on table public.place_profiles is
  '장소의 정보. 이름은 sources.title, 왜 담았는지는 sources.description이 담는다. (설계 문서 17-1절)';
comment on column public.place_profiles.provider is
  '어디서 받아온 값인가. 비어 있으면 직접 적은 장소다. manual 값을 따로 두지 않는다.';
comment on column public.place_profiles.latitude is
  '위도. 지도 링크를 만드는 값이고, 2단계에서 지도를 얹을 때 쓴다. 경도와 짝이어야 한다.';
comment on column public.place_profiles.category is
  '분류(음식점, 카페, 관광명소). 사람은 가게 이름보다 무엇하는 곳이었는지를 먼저 떠올린다.';
comment on column public.place_profiles.visit_status is
  '가봤는가. 비워둘 수 있고 비움은 안 정함이다. 가보고 싶다와 다르다.';
comment on column public.place_profiles.fetched_at is
  '언제 받아온 값인지. 장소는 문을 닫는다. 없어졌다고 담아둔 값을 지우지 않는다.';

create index if not exists place_profiles_owner_idx
  on public.place_profiles (owner_id);

-- "이 장소를 이미 담았나"를 묻는 길. 한 사람 안에서만 본다.
create index if not exists place_profiles_owner_external_idx
  on public.place_profiles (owner_id, provider, external_id);

-- "가볼 곳만 모아 보기"를 묻는 길. book_profiles의 읽기 상태와 같다.
create index if not exists place_profiles_owner_visit_idx
  on public.place_profiles (owner_id, visit_status);


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 장소 정보를
-- 붙일 수 있으므로 트리거가 참조 대상을 확인한다.
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_place_profile_owner()
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

drop trigger if exists place_profiles_set_owner on public.place_profiles;
create trigger place_profiles_set_owner
  before insert on public.place_profiles
  for each row
  execute function public.set_place_profile_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  source_id를 고칠 수 있으면 가 장소의 정보가 나 자료에 붙는다. 자기
  자료끼리라도 막는다. 붙일 자료를 잘못 골랐다면 지우고 다시 만든다.
  youtube_profiles·book_profiles와 같은 판단이다.

  **provider와 external_id는 막지 않는다.** 다른 장소를 골라 다시 찾아오는
  것은 정상적인 일이다. 음악에서 배운 것이다. "적어둔 것을 덮지 않는다"를
  뭉뚱그려 걸었더니 한 곡을 채운 뒤 다른 곡으로 바꿀 수 없었고, 잠긴 자리는
  오류가 나지 않고 그냥 값이 안 바뀔 뿐이라 쓰다가 부딪히기 전에는 몰랐다.
  (AGENTS.md 2절)

  **visit_status도 당연히 막지 않는다.** 가보고 싶던 곳에 가는 것이 이 칸이
  있는 이유다.
*/
create or replace function public.guard_place_profile_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'place_profiles.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'place_profiles.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'place_profiles.source_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'place_profiles.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists place_profiles_guard_immutable_columns
  on public.place_profiles;
create trigger place_profiles_guard_immutable_columns
  before update on public.place_profiles
  for each row
  execute function public.guard_place_profile_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다. (AGENTS.md 6절)

revoke all on table public.place_profiles from anon, authenticated;

grant select, insert, update, delete on table public.place_profiles
  to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.
-- (보안 원칙 1)

alter table public.place_profiles enable row level security;

drop policy if exists place_profiles_select_own on public.place_profiles;
create policy place_profiles_select_own
  on public.place_profiles
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists place_profiles_insert_own on public.place_profiles;
create policy place_profiles_insert_own
  on public.place_profiles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists place_profiles_update_own on public.place_profiles;
create policy place_profiles_update_own
  on public.place_profiles
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

drop policy if exists place_profiles_delete_own on public.place_profiles;
create policy place_profiles_delete_own
  on public.place_profiles
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
