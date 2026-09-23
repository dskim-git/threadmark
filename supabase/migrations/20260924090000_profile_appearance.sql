-- =============================================================================
-- 화면 취향 (색과 글꼴)
-- =============================================================================
-- 설계 문서 4.2절의 "사용자별 기능 설정".
--
-- 색과 글꼴을 사람마다 고르게 한다. 하루에 몇 시간을 들여다보는 화면이라
-- 편한 정도가 사람마다 다르다. 밝은 바탕이 편한 사람과 색이 적어야 집중되는
-- 사람이 같은 화면을 써야 할 이유가 없다.
--
-- 왜 열거형이 아니라 text + check 인가
--   다른 곳에서는 열거형을 썼다. 여기는 다르게 둔다. 열거형은 값을 더할 때
--   파일을 나눠야 하고(AGENTS.md 6절) **한 번 만든 값을 지울 수 없다.**
--   디자인은 바뀐다. 갈래를 하나 빼거나 이름을 바꾸는 일이 실제로 생기는데,
--   그때마다 쓰지 않는 값이 데이터베이스에 영원히 남는다.
--
--   자료의 상태(`source_status`)나 관계 종류(`source_relation_type`)와 성격이
--   다르다. 그것들은 뜻이 정해진 것이라 함부로 바뀌지 않고, 잘못된 값이
--   들어가면 기능이 어긋난다. 화면 취향은 잘못된 값이 들어와도 기본 모양으로
--   보이면 그만이다.
--
-- 왜 profiles에 두는가
--   사람에 딸린 값이고 표 하나면 충분하다. profiles_update_own 정책이 이미
--   본인 행 수정을 허용하고, 가드 트리거는 승인 상태와 이메일만 막는다.
--   그래서 정책도 가드도 건드릴 것이 없다.
-- =============================================================================

alter table public.profiles
  add column if not exists theme_palette text not null default 'hanji';

alter table public.profiles
  add column if not exists theme_fonts text not null default 'myeongjo';

-- 값 목록은 src/lib/appearance/theme.ts와 같아야 한다.
-- 어긋나면 화면에서는 고를 수 있는데 저장만 거부된다.
-- tests/appearance-theme.test.mjs가 둘을 맞대어 본다.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_theme_palette_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_theme_palette_allowed
      check (theme_palette in ('hanji', 'graphite', 'moss'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_theme_fonts_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_theme_fonts_allowed
      check (theme_fonts in ('myeongjo', 'single', 'gowun'));
  end if;
end
$$;

comment on column public.profiles.theme_palette is
  '화면 색 갈래. hanji=쪽빛과 한지, graphite=흑연, moss=이끼 서가.';
comment on column public.profiles.theme_fonts is
  '글꼴 갈래. myeongjo=명조와 고딕, single=한 글꼴, gowun=고운바탕과 고딕.';
