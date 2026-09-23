-- =============================================================================
-- 자료끼리의 관계 (14-D-2a)
-- =============================================================================
-- 설계 문서 8.4절, 20절의 `source_relations`.
--
-- 논문을 읽다 보면 논문이 다른 논문을 부른다. 참고문헌에서 눈에 띈 것,
-- 같은 것을 다르게 말하는 것, 방법만 빌려올 것. 그 관계를 적어두지 않으면
-- 몇 주 뒤에 "이 논문을 왜 받아뒀더라"만 남는다.
--
-- 논문 전용이 아니다
--   13.1절이 이 표를 음악에도 쓴다. 같은 곡의 스튜디오 버전, 라이브 버전,
--   리메이크를 서로 다른 자료로 등록하고 이 표로 잇는다. 그래서 열 이름을
--   paper_로 시작하지 않고 자료 일반으로 둔다. 관계 종류는 지금 쓰는
--   논문용 여덟 가지만 넣고, 음악용은 15단계에서 더한다.
--
-- 방향이 있다
--   A가 B를 인용하는 것과 B가 A를 인용하는 것은 다른 사실이다.
--   그래서 출발과 도착을 나눠 담고, 화면은 어느 쪽에서 보든 화살표로
--   방향을 그대로 보여준다. 8.4절에 `인용함`과 `인용됨`이 나란히 있는 것도
--   이 때문이다. 어느 쪽에서 적기 시작했는지에 따라 고르는 말이 다르다.
--
-- 고치지 않는다
--   잇거나 끊는 것뿐이라 UPDATE 권한을 주지 않는다. 관계를 잘못 골랐다면
--   끊고 다시 잇는다. source_projects와 같다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------
-- 설계 문서 8.4절의 여덟 가지를 그대로 옮겼다. 순서도 문서 순서다.
-- 우리말 이름은 화면이 붙인다. (src/lib/sources/relation-types.ts)
--
-- 값을 나중에 더할 때는 파일을 나눈다. ALTER TYPE ... ADD VALUE로 더한 값은
-- 같은 트랜잭션에서 쓸 수 없다. (AGENTS.md 6절)
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_relation_type' and n.nspname = 'public'
  ) then
    create type public.source_relation_type as enum (
      'cites',                -- 인용함
      'cited_by',             -- 인용됨
      'found_in_references',  -- 참고문헌에서 발견
      'similar_study',        -- 유사 연구
      'contradicts',          -- 상반된 결과
      'theoretical_basis',    -- 이론적 배경
      'method_reference',     -- 연구 방법 참고
      'follow_up_reading'     -- 후속 읽기
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.source_relations (
  id             uuid primary key default gen_random_uuid(),

  -- 소유자. 기본값과 트리거가 auth.uid()로 채운다. (보안 원칙 2)
  -- 기본값을 빠뜨리면 생성된 타입이 이 열을 필수로 본다. (AGENTS.md 6절)
  owner_id       uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,

  -- 양쪽이 정말 이 사람 것인지는 트리거가 확인한다.
  -- 외래키 제약은 RLS를 보지 않으므로 한쪽만 확인하면 남의 자료를 엮을 수 있다.
  from_source_id uuid not null references public.sources (id) on delete cascade,
  to_source_id   uuid not null references public.sources (id) on delete cascade,

  relation_type  public.source_relation_type not null,

  created_at     timestamptz not null default now(),

  -- 자기 자신과는 잇지 않는다. 뜻이 없고, 화면에서는 같은 줄이 나갔다
  -- 들어온 것 양쪽에 한 번씩 나와 두 개처럼 보인다.
  constraint source_relations_no_self
    check (from_source_id <> to_source_id),

  -- 같은 짝에 같은 관계는 하나다. 두 번 누르면 두 줄이 생기는데,
  -- 둘은 완전히 같은 말이라 어느 것을 끊어야 할지 알 수 없다.
  constraint source_relations_unique_triple
    unique (from_source_id, to_source_id, relation_type)
);

comment on table public.source_relations is
  '자료끼리의 방향 있는 관계. 설계 문서 8.4절. 논문과 음악이 함께 쓴다.';

-- 자료 상세에서 두 방향을 모두 읽는다. 나간 것과 들어온 것 각각에 색인이 있다.
create index if not exists source_relations_from_idx
  on public.source_relations (from_source_id, created_at desc);
create index if not exists source_relations_to_idx
  on public.source_relations (to_source_id, created_at desc);
create index if not exists source_relations_owner_idx
  on public.source_relations (owner_id);


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 참조 확인
-- -----------------------------------------------------------------------------
-- 소유자를 정하는 일과 참조 대상을 확인하는 일을 한 함수에 순서대로 둔다.
-- 트리거를 둘로 나누면 이름 순서대로 실행되어, 확인이 먼저 돌면서
-- 아직 정해지지 않은 owner_id를 검사하게 된다. captures에서 겪은 문제다.
--
-- 이 표는 같은 표의 행 둘을 잇는다. 그래도 확인은 두 번 해야 한다.
-- 한 번만 하면 내 자료를 남의 자료에 엮거나 그 반대가 된다.

create or replace function public.set_source_relation_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  perform public.assert_source_owned(new.from_source_id, new.owner_id);
  perform public.assert_source_owned(new.to_source_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists source_relations_set_link on public.source_relations;
create trigger source_relations_set_link
  before insert on public.source_relations
  for each row
  execute function public.set_source_relation_link();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.
--
-- 관계는 잇거나 끊는 것뿐이다. 고칠 것이 없으므로 UPDATE를 주지 않는다.
-- 권한이 없으면 갱신을 막는 트리거도 필요 없다.

revoke all on table public.source_relations from anon, authenticated;

grant select, insert, delete
  on table public.source_relations to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인과 승인 상태 확인을 함께 건다.
-- 소유자만 보면 정지된 계정이 자기 자료에 계속 접근한다.
--
-- 삭제 표시를 쓰지 않는다. 관계는 자료에 딸린 것이라 어느 한쪽 자료를
-- 영구 삭제하면 함께 사라진다. 삭제 표시만 된 자료의 관계는 남아 있고,
-- 화면이 그 자료를 걸러낸다. 되살리면 관계도 함께 돌아온다.

alter table public.source_relations enable row level security;

drop policy if exists source_relations_select_own on public.source_relations;
create policy source_relations_select_own
  on public.source_relations
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_relations_insert_own on public.source_relations;
create policy source_relations_insert_own
  on public.source_relations
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_relations_delete_own on public.source_relations;
create policy source_relations_delete_own
  on public.source_relations
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
