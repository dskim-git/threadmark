-- =============================================================================
-- AI 사용 장부 (16-A-1)
-- =============================================================================
-- 설계 문서 19절이 "AI 사용량 제한과 비용 추적을 둔다"고 적었다. 이 표가
-- 그 자리다.
--
-- 왜 AI 기능보다 이것이 먼저인가
--   AI를 부르는 순간부터 돈이 나간다. 번역(13-C)에 붙여둔 한도는
--   `src/lib/translation/rate-limit.ts`이고, 그 파일이 스스로 이렇게 적어
--   두었다. **"세는 자리가 서버 프로세스의 기억이다. 서버가 여럿이면 각자
--   따로 센다. 진짜 상한은 16단계에서 데이터베이스에 둔다."**
--
--   Vercel은 요청마다 다른 곳에서 실행될 수 있다. 그래서 그 한도는 연타를
--   막을 뿐 한 달에 얼마를 썼는지는 아무도 모른다. **모르는 채로 기능을
--   하나 더 붙이면 모르는 금액이 하나 더 늘어난다.** 장부를 먼저 만든다.
--
-- 무엇을 담는가
--   부른 기능, 어디에 물었는지, 어느 모델인지, 글자 수, 그리고 잘 됐는지.
--   **답변 내용은 담지 않는다.** 장부는 "얼마나 썼는가"를 위한 것이고,
--   물어본 글과 받은 글은 이미 기록(captures)에 들어갈 자리가 있다.
--   같은 것을 두 곳에 담으면 지울 때 한 곳이 남는다.
--
-- 왜 고칠 수도 지울 수도 없게 하는가
--   **지울 수 있는 장부는 장부가 아니다.** 이 표는 한도를 판단하는 근거다.
--   지울 수 있으면 한도에 걸린 사람이 장부를 비우고 다시 쓰면 그만이다.
--
--   그래서 `authenticated`에게 넣기와 읽기만 준다. 고치기와 지우기는
--   **권한 자체를 주지 않는다.** 정책을 두지 않는 것과 권한을 주지 않는
--   것을 함께 건다. 한쪽만 걸면 나중에 누가 grant 한 줄을 더했을 때
--   조용히 열린다. (AGENTS.md 5절, `google_drive_connections`와 같은 생각)
--
--   넣기를 사용자에게 여는 것은 괜찮다. 없는 줄을 지어내 봐야 **자기 한도만
--   줄어든다.** 줄일 수 있는 길이 없으면 장부는 제 일을 한다.
--
-- 왜 service_role을 쓰지 않는가
--   쓸 수도 있었다. 그러나 service_role은 RLS를 통째로 우회한다. 그러면
--   소유자 확인을 데이터베이스가 아니라 코드가 해야 하고, 그 한 줄을 빠뜨리면
--   남의 장부가 보인다. 여기서는 우회할 이유가 없다. 넣는 사람과 읽는 사람이
--   같은 사람이고, RLS가 그대로 맞는 답을 준다.
--
--   `tests/service-client-usage.test.mjs`의 허용 목록을 늘리지 않았다.
--   **늘리지 않아도 되는 자리에서 늘리지 않는 것이 그 목록의 뜻이다.**
--
-- 왜 열거형을 쓰면서 값을 미리 둘씩 넣어두는가
--   `ALTER TYPE ... ADD VALUE`로 더한 값은 같은 트랜잭션에서 쓸 수 없다.
--   (AGENTS.md 6절) 나중에 값을 더하려면 마이그레이션을 두 벌로 나눠야 한다.
--   그래서 지금 쓸 값과 곧 쓸 값을 함께 넣는다.
--
--   `translation`은 **아직 이 표에 기록되지 않는다.** 번역은 이미 도는
--   기능이고 장부에 붙이는 것은 다음 단계다. 값만 미리 두는 것이지
--   "이미 세고 있다"는 뜻이 아니다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 갈래
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'ai_feature' and n.nspname = 'public'
  ) then
    create type public.ai_feature as enum (
      -- 고른 문장을 옮긴다. (9.4절) 아직 이 표에 기록하지 않는다.
      'translation',
      -- 물음에 답하며 담아둔 것을 엮어 준다. (19절)
      'search'
    );
  end if;
end
$$;

comment on type public.ai_feature is
  'AI를 부른 기능. 값을 더하려면 마이그레이션을 따로 하나 만든다.';


do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'ai_call_outcome' and n.nspname = 'public'
  ) then
    create type public.ai_call_outcome as enum (
      -- 답을 받았다.
      'ok',
      -- 밖에서 오류가 났거나 답을 알아볼 수 없었다.
      'failed'
    );
  end if;
end
$$;

comment on type public.ai_call_outcome is
  '부른 결과. 실패도 남긴다. 실패한 요청에도 돈이 들 수 있다.';


-- -----------------------------------------------------------------------------
-- 2. 표
-- -----------------------------------------------------------------------------

create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  feature       public.ai_feature not null,

  /*
    어디에 물었는가. 지금은 `anthropic` 하나다.

    열거형이 아니라 글자인 이유는, 공급자가 늘어나는 것이 값의 갈래가
    늘어나는 것과 다르기 때문이다. 갈래는 코드가 보고 갈라지지만
    공급자 이름은 **적어두기만 하고 코드가 보지 않는다.**
  */
  provider      text not null,

  /*
    어느 모델인가. `claude-opus-5`처럼.

    **값이 같아도 모델이 다르면 돈이 다르다.** 나중에 장부를 보며
    "왜 이 달에 많이 나왔지"를 물을 때 이 칸이 답한다.
  */
  model         text not null,

  /*
    글자 수(토큰).

    실패했을 때는 받은 것이 없어 0이 들어갈 수 있다. 그래서 기본값이 0이고
    음수만 막는다. **0과 모름을 가르지 않는다.** 가르려면 null을 써야 하고,
    그러면 더할 때마다 coalesce를 붙여야 한다. 장부에서 모름은 0으로 센다.
  */
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,

  outcome       public.ai_call_outcome not null,

  created_at    timestamptz not null default now(),

  constraint ai_usage_events_provider_length check (
    char_length(pg_catalog.btrim(provider)) between 1 and 100
  ),
  constraint ai_usage_events_provider_trimmed check (
    provider = pg_catalog.btrim(provider)
  ),
  constraint ai_usage_events_model_length check (
    char_length(pg_catalog.btrim(model)) between 1 and 200
  ),
  constraint ai_usage_events_model_trimmed check (
    model = pg_catalog.btrim(model)
  ),
  constraint ai_usage_events_tokens_nonnegative check (
    input_tokens >= 0 and output_tokens >= 0
  )
);

comment on table public.ai_usage_events is
  'AI를 부른 기록. 한도를 판단하는 근거라서 고칠 수도 지울 수도 없다.';

comment on column public.ai_usage_events.outcome is
  '실패도 남긴다. 실패한 요청에도 돈이 들 수 있어서 빼면 장부가 적게 센다.';


/*
  한 사람의 이번 달치를 세는 질의가 이 표를 쓰는 거의 유일한 길이다.
  그 모양 그대로 색인을 건다.
*/
create index if not exists ai_usage_events_owner_created_idx
  on public.ai_usage_events (owner_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 3. 소유자 확정
-- -----------------------------------------------------------------------------
-- 컬럼 기본값만으로는 부족하다. 값을 명시해 보내면 기본값이 쓰이지 않는다.
-- (AGENTS.md 5절 2번)

create or replace function public.set_ai_usage_event_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.owner_id := auth.uid();

  if new.owner_id is null then
    raise exception 'AI 사용 기록은 로그인한 사용자만 남길 수 있습니다.';
  end if;

  -- 시각도 서버가 정한다. 보낸 값을 믿으면 지난달로 적어 한도를 비켜 갈 수 있다.
  new.created_at := now();

  return new;
end;
$$;

comment on function public.set_ai_usage_event_owner() is
  '소유자와 시각을 서버가 정한다. 시각을 클라이언트가 정하면 한도를 비켜 간다.';

drop trigger if exists ai_usage_events_set_owner on public.ai_usage_events;
create trigger ai_usage_events_set_owner
  before insert on public.ai_usage_events
  for each row
  execute function public.set_ai_usage_event_owner();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.
--
-- **고치기와 지우기를 주지 않는다.** 이것이 이 표에서 가장 중요한 줄이다.
-- 정책을 두지 않는 것과 권한을 주지 않는 것을 함께 건다.
-- service_role 권한은 건드리지 않는다. 계정을 지울 때 cascade가 지나간다.

revoke all on table public.ai_usage_events from anon, authenticated;

grant select, insert on table public.ai_usage_events to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. is_active_user()를 함께 건다.
--
-- 고치기·지우기 정책이 없는 것은 빠뜨린 것이 아니라 정한 것이다.
-- `tests/migration-invariants.test.mjs`의 TABLES_WITHOUT_SELECT_POLICY와
-- 같은 생각으로, 왜 없는지를 여기에 적어 둔다.

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select_own on public.ai_usage_events;
create policy ai_usage_events_select_own
  on public.ai_usage_events
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists ai_usage_events_insert_own on public.ai_usage_events;
create policy ai_usage_events_insert_own
  on public.ai_usage_events
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
