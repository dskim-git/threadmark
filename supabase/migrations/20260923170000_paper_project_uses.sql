-- =============================================================================
-- 프로젝트별 논문 활용 계획 (14-D-1)
-- =============================================================================
-- 설계 문서 8.3절, 20절의 `paper_project_uses`.
--
-- 같은 논문을 여러 프로젝트에 쓴다. 그런데 프로젝트마다 쓰는 방식이 다르다.
-- 한 편을 두고 A 논문에서는 이론적 배경으로, B 수업 자료에서는 사례로 쓴다.
-- 그래서 활용 계획은 논문에 하나가 아니라 **논문과 프로젝트의 짝마다 하나**다.
--
-- 8.2절의 분석 서식과 무엇이 다른가
--   분석 서식은 논문 한 편에 하나다. "이 논문이 무엇을 말하는가"이므로
--   프로젝트가 몇 개든 답이 같다. 여기는 "내 원고의 어디에 넣을 것인가"라서
--   프로젝트마다 답이 다르다. 한 표에 담으면 둘 중 하나를 잃는다.
--
-- source_projects와의 관계
--   연결이 있어야 계획이 의미가 있으므로, 화면은 이미 연결된 프로젝트에만
--   계획 칸을 보여준다. 그런데 **데이터베이스로 강제하지는 않는다.**
--   source_projects를 가리키는 외래키를 걸면 연결을 끊는 순간 계획이 함께
--   사라진다. 사용자는 연결만 정리했다고 생각하는데 적어둔 글이 없어진다.
--   연결을 끊어도 계획은 남고, 다시 연결하면 그대로 보인다.
--
-- 자료 유형을 확인하지 않는 이유
--   열 이름은 paper_source_id지만 sources.type = 'paper'를 제약으로 걸지 않는다.
--   자료 유형은 나중에 수정 화면에서 바뀔 수 있다. 제약을 걸면 그 수정이
--   막히거나, 삽입할 때만 확인해 실제로는 지켜지지 않는 보장이 된다.
--   paper_profiles와 paper_analyses도 같은 이유로 걸지 않았다.
--   논문에만 보여주는 판단은 화면이 한다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------
-- 활용 계획의 상태. 설계 문서 8.3절에 `status` 칸만 있고 값이 정의되어 있지 않다.
--
-- 두 값을 둔다. 둘 다 지금 화면에서 쓰인다.
--
--   planned  아직 쓸 예정
--   used     원고에 넣었음
--
-- 논문이 여러 편 쌓이면 "어느 것을 이미 처리했더라"가 곧 물음이 된다.
-- 그 물음에 답하는 것이 이 칸의 유일한 일이므로, 값이 하나면 칸 자체가
-- 아무 일도 하지 않는다. 그래서 AGENTS.md 2절의 "값 하나만"에서 벗어났다.
--
-- '안 쓰기로 함' 같은 값은 넣지 않았다. 그 판단을 남기려면 이유를 적는
-- 자리와 목록에서 접어두는 화면까지 함께 정해야 의미가 생긴다.
-- 필요해지면 그때 더한다. 다만 ALTER TYPE ... ADD VALUE로 더한 값은
-- 같은 트랜잭션에서 쓸 수 없으므로 파일을 나눠야 한다. (AGENTS.md 6절)
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'paper_use_status' and n.nspname = 'public'
  ) then
    create type public.paper_use_status as enum ('planned', 'used');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.paper_project_uses (
  id               uuid primary key default gen_random_uuid(),

  -- 소유자. 기본값과 트리거가 auth.uid()로 채운다. (보안 원칙 2)
  -- 기본값을 빠뜨리면 생성된 타입이 이 열을 필수로 본다. (AGENTS.md 6절)
  owner_id         uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,

  -- 논문과 프로젝트 양쪽이 정말 이 사람 것인지는 트리거가 확인한다.
  -- 외래키 제약은 RLS를 보지 않으므로 한쪽만 확인하면 남의 것에 붙일 수 있다.
  paper_source_id  uuid not null references public.sources (id)  on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,

  planned_section  text,  -- 원고의 어느 부분에서 쓸지
  usage_intent     text,  -- 무엇을 위해 쓸지
  interpretation   text,  -- 이 프로젝트 맥락에서의 해석
  citation_plan    text,  -- 어떻게 인용할지
  cautions         text,  -- 이 프로젝트에서 쓸 때의 주의점

  status           public.paper_use_status not null default 'planned',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- 한 논문과 한 프로젝트의 계획은 하나다. 둘이 되면 어느 쪽이 지금 계획인지
  -- 알 수 없고, 화면은 둘 다 보여주게 된다.
  constraint paper_project_uses_unique_pair unique (paper_source_id, project_id)
);

comment on table public.paper_project_uses is
  '논문과 프로젝트의 짝마다 하나인 활용 계획. 설계 문서 8.3절.';
comment on column public.paper_project_uses.status is
  'planned=아직 쓸 예정, used=원고에 넣었음.';

-- 프로젝트 화면에서 "이 프로젝트에 쓸 논문들"을 읽는다.
create index if not exists paper_project_uses_project_idx
  on public.paper_project_uses (project_id, created_at desc);
create index if not exists paper_project_uses_owner_idx
  on public.paper_project_uses (owner_id);


-- -----------------------------------------------------------------------------
-- 3. 길이 제약
-- -----------------------------------------------------------------------------
-- 분석 서식(8.2절)보다 짧게 둔다. 여기는 논문을 설명하는 자리가 아니라
-- "내 원고의 어디에 어떻게 넣을지"를 적는 자리다. 길어지면 분석 서식에
-- 적어야 할 내용이 이쪽으로 넘어온 것이다.
--
-- 숫자는 src/lib/papers/project-use-fields.ts와 같아야 한다.
-- 어긋나면 tests/papers-project-uses.test.mjs가 잡는다.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.paper_project_uses'::regclass
      and conname = 'paper_project_uses_planned_section_length'
  ) then
    alter table public.paper_project_uses
      add constraint paper_project_uses_planned_section_length
      check (planned_section is null or char_length(planned_section) <= 200);
  end if;
end
$$;

do $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'usage_intent', 'interpretation', 'citation_plan', 'cautions'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.paper_project_uses'::regclass
        and conname = 'paper_project_uses_' || v_column || '_length'
    ) then
      execute format(
        'alter table public.paper_project_uses add constraint %I check (%I is null or char_length(%I) <= 2000)',
        'paper_project_uses_' || v_column || '_length', v_column, v_column
      );
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. 소유자 고정과 참조 확인
-- -----------------------------------------------------------------------------
-- 소유자를 정하는 일과 참조 대상을 확인하는 일을 한 함수에 순서대로 둔다.
-- 트리거를 둘로 나누면 이름 순서대로 실행되어, 확인이 먼저 돌면서
-- 아직 정해지지 않은 owner_id를 검사하게 된다. captures에서 겪은 문제다.
--
-- 연결 테이블이므로 **양쪽 모두** 확인한다. 한쪽만 보면 다음이 가능해진다.
--   내 프로젝트 + 남의 논문  ->  남의 논문에 대한 계획을 내 프로젝트에 붙임
--   남의 프로젝트 + 내 논문  ->  남의 프로젝트에 내 계획을 밀어넣음

create or replace function public.set_paper_project_use_owner()
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

  perform public.assert_source_owned(new.paper_source_id, new.owner_id);
  perform public.assert_project_owned(new.project_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists paper_project_uses_set_owner on public.paper_project_uses;
create trigger paper_project_uses_set_owner
  before insert on public.paper_project_uses
  for each row
  execute function public.set_paper_project_use_owner();


-- 만들어진 뒤에 바뀌지 않는 값들.
--
-- 짝을 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 논문을 두고 적은
-- 계획이 B 논문의 것이 되거나, C 프로젝트의 계획이 D 프로젝트로 옮겨간다.
-- 계획을 옮기는 일은 없다. 다른 프로젝트에 쓸 것이면 그 프로젝트의 계획을
-- 새로 적는다. 프로젝트마다 쓰는 방식이 다르다는 것이 이 표의 출발점이다.
create or replace function public.guard_paper_project_use_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'paper_project_uses.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'paper_project_uses.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.paper_source_id is distinct from old.paper_source_id then
    raise exception 'paper_project_uses.paper_source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'paper_project_uses.project_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'paper_project_uses.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists paper_project_uses_guard_immutable_columns
  on public.paper_project_uses;
create trigger paper_project_uses_guard_immutable_columns
  before update on public.paper_project_uses
  for each row
  execute function public.guard_paper_project_use_immutable_columns();


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.paper_project_uses from anon, authenticated;

grant select, insert, update, delete
  on table public.paper_project_uses to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인과 승인 상태 확인을 함께 건다.
-- 소유자만 보면 정지된 계정이 자기 자료에 계속 접근한다.
--
-- 삭제 표시를 쓰지 않는다. 계획은 논문과 프로젝트에 딸린 것이라 어느 한쪽이
-- 사라지면 함께 사라진다. 지우는 것은 "이 프로젝트에는 안 쓴다"는 뜻이고,
-- 그때 남겨둘 것도 없다.

alter table public.paper_project_uses enable row level security;

drop policy if exists paper_project_uses_select_own on public.paper_project_uses;
create policy paper_project_uses_select_own
  on public.paper_project_uses
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_project_uses_insert_own on public.paper_project_uses;
create policy paper_project_uses_insert_own
  on public.paper_project_uses
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_project_uses_update_own on public.paper_project_uses;
create policy paper_project_uses_update_own
  on public.paper_project_uses
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

drop policy if exists paper_project_uses_delete_own on public.paper_project_uses;
create policy paper_project_uses_delete_own
  on public.paper_project_uses
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
