-- =============================================================================
-- 프로젝트 뼈대 (19-A)
-- =============================================================================
-- 설계 문서 7.3절.
--
-- 무엇인가
--   프로젝트 아래에 **자리**를 만들고 그 자리를 다시 나눈다. 논문이면 장과
--   절, 수업이면 차시와 활동이 되겠지만 **그 이름을 우리가 정하지 않는다.**
--   사용자가 각 자리에 이름을 적고 필요한 만큼 깊이 나눈다.
--
-- body가 이 표의 핵심이다
--   이름만 달 수 있으면 목차일 뿐이다. 자리에 *내가 쓸 글*이 있어야 모아둔
--   조각과 내 문장이 같은 자리에 놓인다. 그것이 없으면 프로젝트는 태그와
--   갈라지지 않는다. 뼈대와 글을 다른 표로 나누지 않는 이유는, 나누면 어느
--   쪽이 먼저 사라져도 남은 쪽이 떠돌기 때문이다.
--
-- 깊이를 담지 않는다
--   사용자가 필요한 만큼 깊이 나눌 수 있어야 한다. 깊이를 칸으로 담으면
--   가지를 통째로 옮길 때마다 그 아래 전부를 다시 써야 하는데, 담지 않으면
--   부모만 바꾸면 끝난다. 깊이는 화면이 그릴 때 센다.
--
--   깊어질 때 무너지는 것은 데이터가 아니라 화면이다. 들여쓰기에만 한계를
--   두고 담는 것에는 두지 않는다.
--
-- 고리를 막는다
--   자기 자손 밑으로 옮기면 그 가지가 어느 맨 윗칸에도 닿지 않게 되어
--   **화면에서 통째로 사라진다.** 데이터는 남아 있는데 보이지 않으므로
--   사용자는 지워진 줄 안다. 되돌릴 방법도 화면에 없다.
--
--   옮기기를 열어두는 한 반드시 부딪히는 일이라 데이터베이스에서 막는다.
--   깊이를 담지 않으므로 부모를 따라 위로 거슬러 올라가며 확인한다.
--
-- 순서는 정수로 담는다
--   형제 사이에서만 뜻이 있다. 번호(`1.1`)는 담지 않는다. 화면이 순서를 보고
--   센다. 담아두면 순서를 바꿀 때마다 어긋난다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.project_outline_nodes (
  id         uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,

  project_id uuid not null
               references public.projects (id) on delete cascade,

  /*
    위 자리. 비어 있으면 맨 윗칸이다.

    같은 표를 가리키므로 `on delete cascade`가 아래로 이어진다. 자리를
    지우면 그 아래 자리도 함께 사라진다. **다만 재료는 사라지지 않는다.**
    놓여 있던 자료와 기록은 프로젝트에 그대로 남는다. (19-B)
  */
  parent_id  uuid
               references public.project_outline_nodes (id) on delete cascade,

  title      text not null,

  -- 그 자리에 쓸 내 글. 이 표의 핵심이다. (머리말 참고)
  body       text,

  -- 형제 사이의 순서. 화면이 정하고 서버가 그대로 담는다.
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_outline_nodes_title_length check (
    char_length(title) between 1 and 300
  ),
  /*
    글 길이에 한계를 둔다.

    한 자리에 원고 한 장이 들어갈 수 있어야 하므로 넉넉히 잡되, 한계 자체는
    둔다. 없으면 실수로 붙여 넣은 파일 하나가 그대로 담긴다.
  */
  constraint project_outline_nodes_body_length check (
    body is null or char_length(body) <= 50000
  ),
  /*
    `position`은 PostgreSQL이 함수 이름으로도 쓰는 말이다. 칸 이름으로 써도
    되지만, 제약조건 안에서는 따옴표로 감싸 뜻을 분명히 해 둔다.
  */
  constraint project_outline_nodes_position_range check (
    "position" >= 0
  ),

  -- 자기 자신을 부모로 삼을 수 없다. 한 칸짜리 고리는 여기서 막는다.
  -- 여러 칸에 걸친 고리는 아래 트리거가 막는다.
  constraint project_outline_nodes_no_self_parent check (
    parent_id is distinct from id
  )
);

comment on table public.project_outline_nodes is
  '프로젝트의 뼈대. 자리 하나와 그 자리에 쓸 글. (설계 문서 7.3절)';
comment on column public.project_outline_nodes.body is
  '그 자리에 쓸 사용자의 글. 모아둔 재료가 아니라 사용자가 만드는 것이다.';
comment on column public.project_outline_nodes.parent_id is
  '위 자리. 비어 있으면 맨 윗칸이다. 깊이는 담지 않고 화면이 센다.';
comment on column public.project_outline_nodes.position is
  '형제 사이의 순서. 번호는 담지 않는다. 순서가 바뀌면 화면이 다시 센다.';

create index if not exists project_outline_nodes_owner_idx
  on public.project_outline_nodes (owner_id);

-- 한 프로젝트의 뼈대를 통째로 가져와 화면이 트리로 세운다.
-- 한 번의 질의로 끝내려고 만든 색인이다.
create index if not exists project_outline_nodes_project_idx
  on public.project_outline_nodes (project_id, parent_id, position);


-- -----------------------------------------------------------------------------
-- 2. 연결 확인 도우미
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 프로젝트 id만 알면 남의 프로젝트에
-- 자리를 만들 수 있다. `assert_source_owned`와 같은 자리의 함수다.

create or replace function public.assert_project_outline_owned(
  p_node_id  uuid,
  p_owner_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_node_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.project_outline_nodes n
    where n.id = p_node_id
      and n.owner_id = p_owner_id
  ) then
    raise exception '연결할 자리를 찾을 수 없습니다.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_project_outline_owned(uuid, uuid) is
  '자리가 그 사용자의 것인지 확인한다. 외래키는 소유자를 보지 않는다.';


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_project_outline_node_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_project uuid;
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();

  perform public.assert_project_owned(new.project_id, new.owner_id);
  perform public.assert_project_outline_owned(new.parent_id, new.owner_id);

  /*
    위 자리가 같은 프로젝트의 것이어야 한다.

    소유자만 보면 **내 다른 프로젝트의 자리 밑에 붙일 수 있다.** 그러면 그
    자리는 두 프로젝트에 걸치게 되고, 어느 쪽 화면에서 보이는지가 질의에
    따라 달라진다. 자기 자료끼리라도 허용하지 않는 것은 source_relations와
    같은 판단이다.
  */
  if new.parent_id is not null then
    select n.project_id into v_parent_project
    from public.project_outline_nodes n
    where n.id = new.parent_id;

    if v_parent_project is distinct from new.project_id then
      raise exception '다른 프로젝트의 자리 아래에 둘 수 없습니다.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_outline_nodes_set_owner
  on public.project_outline_nodes;
create trigger project_outline_nodes_set_owner
  before insert on public.project_outline_nodes
  for each row
  execute function public.set_project_outline_node_owner();


-- -----------------------------------------------------------------------------
-- 4. 옮길 때 지킬 것
-- -----------------------------------------------------------------------------

/*
  고리를 막는다.

  자기 자손 밑으로 옮기면 그 가지가 어느 맨 윗칸에도 닿지 않게 되어 화면에서
  통째로 사라진다. 데이터는 남아 있는데 보이지 않으므로 사용자는 지워진 줄
  알고, 되돌릴 방법도 화면에 없다.

  깊이를 담지 않으므로 새 부모에서 위로 거슬러 올라가며 자기 자신을 만나는지
  본다. 이미 망가진 데이터에서 영영 도는 것을 막으려고 걸음 수에도 한계를
  둔다. 그 한계는 **뼈대의 깊이 한계가 아니다.** 정상적인 뼈대는 몇 단이든
  자기 자신을 만나지 않고 맨 윗칸에 닿는다.
*/
create or replace function public.guard_project_outline_node_move()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cursor uuid;
  v_steps  integer := 0;
  v_parent uuid;
begin
  if new.id is distinct from old.id then
    raise exception 'project_outline_nodes.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'project_outline_nodes.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  /*
    자리를 다른 프로젝트로 옮길 수 없다.

    옮길 수 있으면 A 프로젝트를 두고 쓴 글이 B 프로젝트의 것이 된다.
    그 아래 자리들과 놓아둔 재료까지 함께 딸려간다.
  */
  if new.project_id is distinct from old.project_id then
    raise exception 'project_outline_nodes.project_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'project_outline_nodes.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.parent_id is distinct from old.parent_id and new.parent_id is not null then
    -- 새 부모가 내 것이고 같은 프로젝트인지 먼저 본다.
    perform public.assert_project_outline_owned(new.parent_id, new.owner_id);

    select n.project_id into v_parent
    from public.project_outline_nodes n
    where n.id = new.parent_id;

    if v_parent is distinct from new.project_id then
      raise exception '다른 프로젝트의 자리 아래로 옮길 수 없습니다.'
        using errcode = '42501';
    end if;

    -- 새 부모에서 위로 거슬러 올라가며 자기 자신을 만나는지 본다.
    v_cursor := new.parent_id;

    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception '자기 아래에 있는 자리로 옮길 수 없습니다.'
          using errcode = '42501';
      end if;

      v_steps := v_steps + 1;

      if v_steps > 1000 then
        -- 여기 닿았다면 이미 고리가 있는 것이다. 더 만들지 않고 멈춘다.
        raise exception '뼈대 구조를 확인할 수 없습니다.' using errcode = '42501';
      end if;

      select n.parent_id into v_cursor
      from public.project_outline_nodes n
      where n.id = v_cursor;
    end loop;
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists project_outline_nodes_guard_move
  on public.project_outline_nodes;
create trigger project_outline_nodes_guard_move
  before update on public.project_outline_nodes
  for each row
  execute function public.guard_project_outline_node_move();


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.project_outline_nodes from anon, authenticated;

grant select, insert, update, delete on table public.project_outline_nodes
  to authenticated;

revoke all on function public.assert_project_outline_owned(uuid, uuid) from public;
grant execute on function public.assert_project_outline_owned(uuid, uuid)
  to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.project_outline_nodes enable row level security;

drop policy if exists project_outline_nodes_select_own
  on public.project_outline_nodes;
create policy project_outline_nodes_select_own
  on public.project_outline_nodes
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists project_outline_nodes_insert_own
  on public.project_outline_nodes;
create policy project_outline_nodes_insert_own
  on public.project_outline_nodes
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists project_outline_nodes_update_own
  on public.project_outline_nodes;
create policy project_outline_nodes_update_own
  on public.project_outline_nodes
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

drop policy if exists project_outline_nodes_delete_own
  on public.project_outline_nodes;
create policy project_outline_nodes_delete_own
  on public.project_outline_nodes
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
