-- =============================================================================
-- 장소에 국내·해외를 담는다 (17-3)
-- =============================================================================
-- 설계 문서 17-3.2절. (2026-09-25, 사용자 요청)
--
--   > 애초부터 국내와 해외를 선택해서 등록시키는게 낫겠어.
--
-- 왜 담는가
--   화면 상태가 아니라 **장소의 성질**이다. 경복궁은 국내이고 에펠탑은
--   해외다. 나중에 그 장소를 다시 열 때도 같은 쪽이어야 한다. 담지 않으면
--   열 때마다 다시 골라야 하고, 그러면 고른 뜻이 없다.
--
-- 왜 좌표로 짐작하지 않는가
--   위도·경도로 한반도 안인지 재는 방법이 있다. 쓰지 않는다.
--
--     좌표가 없는 장소에서는 알 수 없다
--     국경 근처에서 틀린다
--     무엇보다 **사용자가 이미 말해준 것을 우리가 다시 추측하는 일**이다
--
-- 왜 비워둘 수 없는가
--   `visit_status`와 다르다. 가봤는지는 **안 정함이 뜻을 가진다.** 여행
--   준비에는 갈리지만 수업 준비에는 쓸모없을 수 있어서 비워 둔다.
--
--   국내인지 해외인지는 그렇지 않다. **안 정한 상태가 없다.** 담는 순간
--   어느 쪽인지 정해져 있고, 모르면 지도를 어느 것으로 그릴지도 정할 수
--   없다. 그래서 `not null`이다.
--
-- 기본값이 국내인 까닭
--   이미 담긴 장소가 국내이고, 앞으로도 국내가 더 많다. 기본값이 없으면
--   이미 있는 행에 무엇을 넣을지 정할 수 없다.
--
-- 해외를 무엇으로 찾을지는 아직 정하지 않았다
--   카카오는 해외를 다루지 않는다. 구글은 결제 계정이 필요하고,
--   OpenStreetMap은 라이브러리가 하나 는다. **값과 계정이 걸린 일이라
--   사용자가 정한다.** (17-3.4절)
--
--   그 결정과 **이 칸은 따로다.** 무엇으로 찾든 국내와 해외를 가르는
--   일은 필요하고, 정해지기 전에도 해외 장소를 손으로 담을 수 있다.
--
-- 재실행 안전성
--   열거형·칸·제약조건이 이미 있으면 건너뛴다.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'place_region' and n.nspname = 'public'
  ) then
    create type public.place_region as enum (
      'domestic',  -- 국내. 카카오로 찾고 카카오맵을 그린다
      'overseas'   -- 해외
    );
  end if;
end
$$;

alter table public.place_profiles
  add column if not exists region public.place_region
    not null default 'domestic';

comment on column public.place_profiles.region is
  '국내인가 해외인가. 장소의 성질이라 담는다. 비워둘 수 없고 좌표로 짐작하지 않는다. (설계 문서 17-3.2절)';

/*
  "국내인데 구글에서 왔다"와 "해외인데 카카오에서 왔다"를 막는다.

  카카오는 해외를 다루지 않고, 구글은 국내를 찾는 데 쓰지 않기로 했다.
  (17-1.3절) 어긋난 짝이 담기면 **화면이 어느 지도를 그릴지 고를 때
  엉뚱한 쪽을 고른다.** 오류는 나지 않는다.

  직접 적은 장소(`provider`가 비어 있음)는 양쪽 다 될 수 있다. 해외를
  손으로 적는 길이 지금 유일한 해외 길이므로 막으면 안 된다.
*/
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_profiles_region_provider_match'
  ) then
    alter table public.place_profiles
      add constraint place_profiles_region_provider_match check (
        provider is null
        or (region = 'domestic' and provider = 'kakao')
        or (region = 'overseas' and provider = 'google')
      );
  end if;
end
$$;

-- "해외만 모아 보기"를 묻는 길. 담긴 장소가 늘면 쓰인다.
create index if not exists place_profiles_owner_region_idx
  on public.place_profiles (owner_id, region);
