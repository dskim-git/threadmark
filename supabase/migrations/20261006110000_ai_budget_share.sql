-- =============================================================================
-- 한 사람 몫이 얼마인지 알려주는 함수 (19-F 2차례)
-- =============================================================================
-- 2026-10-06. 한도를 **횟수가 아니라 쓴 돈**으로 셈하기로 했다.
-- 까닭은 `docs/decisions`의 ADR과 VERIFICATION 4-76절에 있다.
--
-- 한 사람 몫 = 한 달 예산 ÷ AI를 허용받은 사람 수
--
-- 왜 함수가 필요한가
--   셈에 드는 값 둘이 **보통 사람에게 안 보인다.**
--
--     app_settings   관리자만 읽는다 (`app_settings_select_admin`)
--     profiles       자기 줄만 보인다 (`profiles_select_own`)
--
--   그래서 쓰는 사람의 Server Action이 자기 몫을 셈할 수 없다. RLS를
--   느슨하게 하는 대신 **필요한 숫자 하나만** 돌려주는 함수를 둔다.
--   `soft_delete_source`와 같은 생각이다.
--
-- 왜 예산과 사람 수를 따로 돌려주지 않는가
--   **덜 내보내는 쪽으로 고른다.** 부르는 쪽이 필요한 것은 "내 몫이
--   얼마인가" 하나다. 예산 액수와 몇 명이 쓰는지를 함께 돌려주면 쓰이지
--   않는 값이 밖으로 나가고, 나중에 그 값을 화면에 적고 싶어지는 자리가
--   생긴다. 관리자 화면은 두 값을 **정책으로** 직접 읽는다.
--
-- 왜 DEFINER인가
--   그래야 위의 두 정책을 비껴 셈할 수 있다. 001의 허용 목록에 이 이름을
--   더했고, `search_path`를 비웠다.
--
--   **돌려주는 것이 숫자 하나뿐이라 새는 것이 없다.** 누가 무엇을 썼는지도,
--   누가 허용받았는지도 나가지 않는다.
--
-- 모르면 거부한다 (보안 원칙 7)
--   예산 줄이 없거나 모양이 아니면 `null`이다. 0이 아니다. 0을 돌려주면
--   **"예산이 0"과 "못 읽었다"가 같아지는데**, 부르는 쪽은 그 둘을 같게
--   다루면 안 된다. 못 읽었으면 막고, 0이면 그것도 막되 까닭이 다르다.
--
-- 재실행 안전성
--   `create or replace`와 권한 부여뿐이다. 데이터를 건드리지 않는다.
-- =============================================================================

create or replace function public.ai_monthly_budget_share()
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_budget  numeric;
  v_allowed integer;
begin
  -- 승인된 계정만 셈해 준다. 다른 DEFINER 함수와 같은 자리다.
  if not public.is_active_user() then
    return null;
  end if;

  select (s.value #>> '{}')::numeric
    into v_budget
  from public.app_settings s
  where s.key = 'ai_monthly_budget_usd'
    and pg_catalog.jsonb_typeof(s.value) = 'number';

  if v_budget is null or v_budget <= 0 then
    return null;
  end if;

  select pg_catalog.count(*)
    into v_allowed
  from public.profiles p
  where p.ai_enabled;

  /*
    **0으로 나누지 않는다.**

    허용받은 사람이 아무도 없으면 이 함수를 부를 사람도 없다. 부르는 쪽이
    이미 `ai_enabled`를 보고 막기 때문이다. 그래도 0이 들어오면 셈이
    터지므로 1로 본다. **터지는 것보다 막는 쪽이 낫다.**
  */
  -- `GREATEST`에는 `pg_catalog.`을 붙일 수 없다. `COALESCE`와 같은
  -- SQL 구문이다. (AGENTS.md 6절) 검사가 잡아 주었다.
  return v_budget / greatest(1, v_allowed);
end;
$$;

comment on function public.ai_monthly_budget_share() is
  '한 사람이 이번 달에 AI에 쓸 수 있는 돈(USD). 한 달 예산을 AI 허용받은 사람 수로 나눈 값이다. 예산을 읽지 못하면 null이다.';

/*
  **anon에게는 주지 않는다.** 로그인하지 않은 쪽이 이 숫자를 알 까닭이 없다.
  `public`에서 거둬들인 뒤 `authenticated`에만 준다. 기본 권한이 `public`에
  붙는 것을 그대로 두면 anon도 부를 수 있다.
*/
revoke all on function public.ai_monthly_budget_share() from public;
grant execute on function public.ai_monthly_budget_share() to authenticated;
grant execute on function public.ai_monthly_budget_share() to service_role;
