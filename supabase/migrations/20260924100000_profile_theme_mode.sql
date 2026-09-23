-- =============================================================================
-- 밝게 / 어둡게 고르기
-- =============================================================================
-- 설계 문서 4.2절의 "사용자별 기능 설정". 앞 파일(20260924090000)이 더한
-- 색·글꼴 취향에 밝기 하나를 보탠다.
--
-- 왜 필요한가
--   색 갈래 셋은 모두 밝은 화면으로 만든 것이다. 컴퓨터가 어두운 모드면
--   `쪽빛과 한지`를 골라도 그 미색 종이를 볼 일이 없다. 고르는 의미가
--   절반 사라진다.
--
--   반대쪽도 있다. 어두운 화면이 편한데 낮에는 컴퓨터를 밝은 모드로 쓰는
--   사람에게, 이 앱만 어둡게 둘 방법이 없었다.
--
-- 값 셋
--   system  컴퓨터 설정을 따른다. 기본값이다.
--   light   언제나 밝게
--   dark    언제나 어둡게
--
--   `system`이 기본인 이유는, 아무것도 고르지 않은 사람에게는 지금까지의
--   동작이 그대로 남아야 하기 때문이다. 이미 쓰던 사람의 화면이 어느 날
--   갑자기 바뀌면 고장으로 읽는다.
--
-- text + check인 이유는 앞 파일과 같다. 디자인은 바뀌고, 열거형은 한 번 만든
-- 값을 지울 수 없다.
-- =============================================================================

alter table public.profiles
  add column if not exists theme_mode text not null default 'system';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_theme_mode_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_theme_mode_allowed
      check (theme_mode in ('system', 'light', 'dark'));
  end if;
end
$$;

comment on column public.profiles.theme_mode is
  '화면 밝기. system=컴퓨터 설정을 따름, light=밝게, dark=어둡게.';
