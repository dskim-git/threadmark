-- =============================================================================
-- AI 허용량 더하기 (19-E)
-- =============================================================================
-- 설계 문서 19-E절. (2026-09-25, 사용자 요청)
--
--   > 유저별로 요청이 들어오거나 내가 판단해서 사용량 리셋을 할 수 있게
--
-- 왜 리셋이 아닌가
--   `ai_usage_events`는 **고칠 수도 지울 수도 없는 장부**다. 003의 검사
--   120·121이 그것을 지킨다.
--
--     고칠 수 있는 장부는 장부가 아니다.
--     지울 수 있으면 한도에 걸린 사람이 장부를 비우고 다시 쓰면 그만이다.
--
--   리셋을 만들면 **그 보장을 우리 손으로 뚫는 일**이 된다. 관리자만 할 수
--   있게 해도 마찬가지다. 뚫린 길은 언젠가 쓰인다.
--
--   그래서 장부는 그대로 두고 **허용량을 더한다.** 관리자가 보는 결과는
--   같다. 단추를 누르면 그 사람이 다시 쓴다. 다만 **누가 얼마 썼고 누가
--   언제 왜 풀어줬는지가 둘 다 남는다.**
--
--     쓸 수 있는 횟수 = 기본 한도 + 이번 달에 더해준 허용량
--
-- owner_id에 기본값을 걸지 않는다
--   **이 저장소의 다른 표와 정반대다.** 다른 표들은 "내 것을 내가 만든다"라서
--   `default auth.uid()`와 트리거로 소유자를 고정한다. (보안 원칙 2)
--
--   여기는 **관리자가 남의 줄을 만든다.** 기본값을 걸면 관리자 자신에게
--   허용량이 붙는다. 그래서 기본값이 없고, 생성된 타입도 `owner_id`를
--   필수로 본다. **그것이 맞다.** 누구에게 주는지는 반드시 적어야 한다.
--
--   대신 `granted_by`를 트리거가 채운다. 그쪽이 "지금 누르는 사람"이다.
--
-- 고칠 수도 지울 수도 없다
--   장부와 같다. 잘못 줬으면 **음수로 한 줄 더 남긴다.** 지우는 것이 아니라
--   되돌린 기록을 남기는 것이다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.ai_usage_grants (
  id           uuid primary key default gen_random_uuid(),

  /*
    허용량을 받는 사람. **`auth.uid()`가 아니다.**

    기본값을 걸지 않는 까닭은 머리말에 적었다. 관리자가 남의 줄을 만드는
    표라, 기본값이 있으면 관리자 자신에게 붙는다.
  */
  owner_id     uuid not null
                 references auth.users (id) on delete cascade,

  /*
    누가 더해줬는지. 트리거가 채운다.

    **보낸 값을 믿지 않는다.** 남의 이름으로 풀어준 기록을 남길 수 있으면
    "누가 풀어줬나"에 답할 수 없다. (보안 원칙 2와 같은 생각이다)
  */
  granted_by   uuid
                 references auth.users (id) on delete set null,

  /*
    몇 번 더 쓸 수 있게 하는가.

    **음수를 받는다.** 잘못 줬을 때 되돌리는 길이다. 줄을 지우는 대신
    음수로 한 줄 더 남긴다. 그러면 준 것과 되돌린 것이 둘 다 남는다.

    0은 받지 않는다. 아무것도 바꾸지 않는 줄이라 뜻이 없고, 화면에서
    실수로 누른 것이 기록으로 남는다.
  */
  extra_calls  integer not null,

  /*
    왜 풀어줬는지. **비울 수 없다.**

    까닭 없는 기록은 나중에 읽을 수 없다. "왜 이 사람만 200번을 썼나"에
    답하지 못한다. **그 답을 만들려고 이 표가 있다.**
  */
  reason       text not null,

  /*
    어느 달의 허용량인지를 이 값으로 가른다.

    따로 `달` 칸을 두지 않는다. 두면 만든 때와 적용되는 달이 어긋날 수
    있고, 그러면 어느 쪽이 맞는지 알 수 없다. 한도를 세는 쪽이
    `monthStart`로 자르는 방식과 같은 기준을 쓴다.
  */
  created_at   timestamptz not null default now(),

  constraint ai_usage_grants_extra_calls_range check (
    extra_calls <> 0 and extra_calls between -10000 and 10000
  ),
  constraint ai_usage_grants_reason_not_blank check (
    pg_catalog.btrim(reason) <> '' and char_length(reason) <= 500
  )
);

comment on table public.ai_usage_grants is
  'AI 한도에 더해주는 허용량. 장부를 지우지 않고 더한다. (설계 문서 19-E절)';
comment on column public.ai_usage_grants.owner_id is
  '허용량을 받는 사람. auth.uid()가 아니다. 관리자가 남의 줄을 만드는 표라 기본값을 걸지 않는다.';
comment on column public.ai_usage_grants.extra_calls is
  '몇 번 더. 음수로 되돌릴 수 있다. 줄을 지우는 대신 음수 한 줄을 더한다.';
comment on column public.ai_usage_grants.reason is
  '왜 풀어줬는지. 비울 수 없다. 까닭 없는 기록은 나중에 읽을 수 없다.';

create index if not exists ai_usage_grants_owner_created_idx
  on public.ai_usage_grants (owner_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 2. 누가 줬는지 고정하고, 관리자만 줄 수 있게 한다
-- -----------------------------------------------------------------------------

create or replace function public.set_ai_usage_grant_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  /*
    **관리자인지 여기서 한 번 더 본다.**

    정책이 이미 막는다. 그래도 트리거에서 확인하는 까닭은, 정책은 나중에
    누군가 고칠 수 있고 **그때 이 표가 조용히 열린다**는 것이다. 한도를
    푸는 표라 두 겹으로 둔다.

    `service_role`과 `postgres`는 통과시킨다. 검증 스크립트와 서버 작업이
    그 역할로 돈다. (`guard_profile_protected_columns`와 같은 방식이다)
  */
  if not (
    public.is_admin()
    or pg_catalog.current_user::text
         in ('postgres', 'service_role', 'supabase_admin')
  ) then
    raise exception 'AI 허용량은 관리자만 더할 수 있습니다.'
      using errcode = '42501';
  end if;

  -- 누가 눌렀는지는 보낸 값을 믿지 않는다.
  new.granted_by := auth.uid();
  new.created_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists ai_usage_grants_set_actor on public.ai_usage_grants;
create trigger ai_usage_grants_set_actor
  before insert on public.ai_usage_grants
  for each row
  execute function public.set_ai_usage_grant_actor();


/*
  관리자가 한 일은 감사 기록에 남는다.

  이 저장소의 규칙이다. 승인 상태 변경과 역할 부여가 이미 그렇게 되어 있고
  (`20260920090000`), 한도를 푸는 일도 같은 무게다.

  **장부와 따로 남기는 까닭.** 이 표 자체가 기록이지만, 관리자가 무엇을
  했는지 한자리에서 보는 곳은 `admin_audit_logs`다. 거기를 보는 사람이
  이 표의 존재를 몰라도 알 수 있어야 한다.
*/
create or replace function public.log_ai_usage_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_logs (
    actor_id, action, target_user_id, new_value, reason
  )
  values (
    new.granted_by,
    'ai_usage_granted',
    new.owner_id,
    pg_catalog.jsonb_build_object('extra_calls', new.extra_calls),
    new.reason
  );

  return new;
end;
$$;

comment on function public.log_ai_usage_grant() is
  'AI 허용량을 더한 일을 감사 기록에 남긴다. authenticated에는 감사 기록 INSERT 권한이 없어 SECURITY DEFINER다.';

drop trigger if exists ai_usage_grants_log on public.ai_usage_grants;
create trigger ai_usage_grants_log
  after insert on public.ai_usage_grants
  for each row
  execute function public.log_ai_usage_grant();


-- -----------------------------------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다. (AGENTS.md 6절)
--
-- **update와 delete를 주지 않는다.** 장부와 같다. 잘못 줬으면 음수로 한
-- 줄 더 남긴다. 권한이 없으면 정책을 잘못 쓰더라도 열리지 않는다.

revoke all on table public.ai_usage_grants from anon, authenticated;

grant select, insert on table public.ai_usage_grants to authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------

alter table public.ai_usage_grants enable row level security;

/*
  본인은 자기 허용량을 본다.

  **왜 본인이 봐야 하는가.** 화면이 `60번 중 3번 남음`을 보여주는데,
  허용량을 못 읽으면 관리자가 풀어준 뒤에도 그 숫자가 안 바뀐다. 사용자는
  왜 되는지 모르고 쓴다.

  소유자 확인만으로는 부족하다. 정지된 계정도 소유자 조건만으로는 자기
  줄에 접근한다. `is_active_user()`를 함께 건다. (보안 원칙 1)
*/
drop policy if exists ai_usage_grants_select_own on public.ai_usage_grants;
create policy ai_usage_grants_select_own
  on public.ai_usage_grants
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

/*
  관리자는 전부 본다.

  **`service_role`로 읽지 않으려고 이 정책을 둔다.** 관리자가 남의 장부를
  읽는 일은 정책으로 열면 되고, 우회하면 소유자 확인을 코드가 해야 한다.
  그 한 줄을 빠뜨리면 남의 것이 보인다. 17-A에서 같은 자리에 빠진 적이 있다.
*/
drop policy if exists ai_usage_grants_select_admin on public.ai_usage_grants;
create policy ai_usage_grants_select_admin
  on public.ai_usage_grants
  for select
  to authenticated
  using (public.is_admin());

/*
  관리자만 더할 수 있다.

  트리거가 한 번 더 확인한다. 두 겹으로 두는 까닭은 위 트리거의 주석에
  적었다.
*/
drop policy if exists ai_usage_grants_insert_admin on public.ai_usage_grants;
create policy ai_usage_grants_insert_admin
  on public.ai_usage_grants
  for insert
  to authenticated
  with check (public.is_admin());

-- 고치기·지우기 정책은 두지 않는다. 권한도 없다. 장부와 같다.


-- -----------------------------------------------------------------------------
-- 5. 관리자가 남의 AI 사용 기록을 볼 수 있게 한다
-- -----------------------------------------------------------------------------
-- 19-E.4절. 유저별 사용량을 보여주려면 관리자가 남의 장부를 읽어야 한다.
--
-- **`service_role`을 쓰지 않는다.** (17-A에서 배운 것) 정책을 하나 더하면
-- 되는 일에 우회를 쓰면, 소유자 확인을 코드가 해야 하고 그 한 줄을 빠뜨리면
-- 남의 것이 보인다.
--
-- **넣기·고치기·지우기는 그대로 둔다.** 관리자도 남의 장부에 줄을 넣거나
-- 고칠 수 없다. 읽는 것만 열린다. 장부의 뜻은 그대로다.

drop policy if exists ai_usage_events_select_admin on public.ai_usage_events;
create policy ai_usage_events_select_admin
  on public.ai_usage_events
  for select
  to authenticated
  using (public.is_admin());
