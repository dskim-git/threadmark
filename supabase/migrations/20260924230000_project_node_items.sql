-- =============================================================================
-- 자리에 놓는 재료 (19-B)
-- =============================================================================
-- 설계 문서 7.4절.
--
-- 무엇인가
--   뼈대의 자리 하나에 자료(source)나 기록(capture)을 놓는다. 7.1절의 비유로
--   재료를 요리의 어느 대목에 넣을지 정하는 일이다.
--
-- 이미 있는 연결과 무엇이 다른가
--   `source_projects`와 `capture_projects`는 **"이 프로젝트에 쓸 것으로
--   모아둔 것"**이고, 이 표는 **"그중 어디에 놓았는가"**다. 합치면 모으기와
--   배치라는 두 동작이 하나로 뭉개진다.
--
--   그 차이가 화면에서 `자리 못 찾은 것` 칸이 된다. 프로젝트에 이어두었지만
--   아직 어느 자리에도 놓이지 않은 것들이며, 실제 작업에서 가장 자주 보게 될
--   자리다.
--
-- 둘 중 하나만 놓는다
--   자료를 놓거나 기록을 놓거나 둘 중 하나다. 표를 둘로 나누지 않는 이유는,
--   나누면 한 자리에 놓인 것들을 순서대로 늘어놓을 수 없기 때문이다. 자료와
--   기록이 섞여 있는 것이 그 자리의 모습이다.
--
--   대신 **정확히 하나만 채워져야 한다**를 제약조건으로 못 박는다. 둘 다
--   비면 무엇을 놓았는지 알 수 없고, 둘 다 차면 어느 쪽을 보여줄지 화면이
--   정하게 된다.
--
-- note가 이 표의 절반이다
--   재료를 그대로 옮겨 담는 것은 요리가 아니다. **이 재료로 여기서 무슨
--   말을 할 것인가**가 붙어야 한다. 3주 뒤에 보면 이 인용을 왜 여기 뒀는지
--   기억나지 않는다. (7.1절 3번)
--
-- 같은 것을 여러 자리에 놓는다
--   인용 하나를 2장에서 근거로 쓰고 4장에서 다시 언급하는 일은 흔하다.
--   한 자리만 허용하면 그때 복사본을 만들게 되고, 원문이 두 벌이 된다.
--   이 앱이 가장 피하려는 일이다. (2.4절)
--
--   다만 **같은 자리에 같은 것을 두 번 놓을 수는 없다.** 화면에 같은 줄이
--   둘 보이는 것은 실수이지 뜻이 아니다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.project_node_items (
  id         uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,

  /*
    어느 자리에 놓는가.

    자리를 지우면 놓아둔 것도 함께 사라진다. **다만 재료 자체는 사라지지
    않는다.** 여기서 사라지는 것은 "어디에 놓았는가"이고, 자료와 기록은
    프로젝트에 그대로 남아 `자리 못 찾은 것`으로 간다. (7.3절)
  */
  node_id    uuid not null
               references public.project_outline_nodes (id) on delete cascade,

  source_id  uuid references public.sources (id)  on delete cascade,
  capture_id uuid references public.captures (id) on delete cascade,

  -- 이 재료로 여기서 할 말. (머리말 참고)
  note       text,

  -- 자리 안에서의 순서.
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
    자료이거나 기록이거나, 정확히 하나다.

    둘 다 비면 무엇을 놓았는지 알 수 없고, 둘 다 차면 어느 쪽을 보여줄지
    화면이 정하게 된다. 화면이 정하게 두면 그 판단이 코드 여기저기로 번진다.
  */
  constraint project_node_items_exactly_one check (
    (source_id is not null and capture_id is null)
    or (source_id is null and capture_id is not null)
  ),

  constraint project_node_items_note_length check (
    note is null or char_length(note) <= 2000
  ),
  constraint project_node_items_position_range check (
    "position" >= 0
  )
);

comment on table public.project_node_items is
  '뼈대의 자리에 놓은 자료와 기록. 놓은 까닭을 함께 적는다. (설계 문서 7.4절)';
comment on column public.project_node_items.note is
  '이 재료로 이 자리에서 할 말. 재료를 옮겨 담는 것과 요리를 가르는 칸이다.';

create index if not exists project_node_items_owner_idx
  on public.project_node_items (owner_id);

-- 한 자리에 놓인 것을 순서대로 가져온다.
create index if not exists project_node_items_node_idx
  on public.project_node_items (node_id, position);

/*
  거꾸로 보기. (7.5절)

  자료 화면에서 "이 자료가 어느 자리에 놓였나"를 묻는다. 부분 색인으로
  둔 것은 한 행에 둘 중 하나만 차기 때문이다. 빈 쪽까지 담을 이유가 없다.
*/
create index if not exists project_node_items_source_idx
  on public.project_node_items (source_id)
  where source_id is not null;

create index if not exists project_node_items_capture_idx
  on public.project_node_items (capture_id)
  where capture_id is not null;

/*
  같은 자리에 같은 것을 두 번 놓지 않는다.

  자료와 기록을 나눠 건다. 한 색인에 두 칸을 함께 걸면 NULL이 섞여
  "자리 + 자료 + NULL"과 "자리 + 자료 + NULL"이 서로 다른 값으로 취급된다.
  PostgreSQL에서 NULL은 자기 자신과도 같지 않기 때문이다.
*/
create unique index if not exists project_node_items_source_unique
  on public.project_node_items (node_id, source_id)
  where source_id is not null;

create unique index if not exists project_node_items_capture_unique
  on public.project_node_items (node_id, capture_id)
  where capture_id is not null;


-- -----------------------------------------------------------------------------
-- 2. 소유자 고정과 연결 확인
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. id만 알면 남의 자리에 내 자료를 놓거나
-- 내 자리에 남의 자료를 놓을 수 있다. **세 가지를 모두 확인한다.**
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.set_project_node_item_owner()
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

  perform public.assert_project_outline_owned(new.node_id, new.owner_id);
  perform public.assert_source_owned(new.source_id, new.owner_id);
  perform public.assert_capture_owned(new.capture_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists project_node_items_set_owner on public.project_node_items;
create trigger project_node_items_set_owner
  before insert on public.project_node_items
  for each row
  execute function public.set_project_node_item_owner();


/*
  만들어진 뒤에 바뀌지 않는 값들.

  무엇을 어디에 놓았는지는 바꾸지 못한다. 바꿀 수 있으면 A 재료를 두고 적은
  "여기서 할 말"이 B 재료의 것이 된다. 다른 자리로 옮기고 싶으면 빼고 다시
  놓는다. 그때 무슨 말을 적을지 다시 생각하게 되는 편이 맞다.
*/
create or replace function public.guard_project_node_item_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'project_node_items.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'project_node_items.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.node_id is distinct from old.node_id then
    raise exception 'project_node_items.node_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'project_node_items.source_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.capture_id is distinct from old.capture_id then
    raise exception 'project_node_items.capture_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'project_node_items.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists project_node_items_guard_immutable_columns
  on public.project_node_items;
create trigger project_node_items_guard_immutable_columns
  before update on public.project_node_items
  for each row
  execute function public.guard_project_node_item_immutable_columns();


-- -----------------------------------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.project_node_items from anon, authenticated;

grant select, insert, update, delete on table public.project_node_items
  to authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.project_node_items enable row level security;

drop policy if exists project_node_items_select_own on public.project_node_items;
create policy project_node_items_select_own
  on public.project_node_items
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists project_node_items_insert_own on public.project_node_items;
create policy project_node_items_insert_own
  on public.project_node_items
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists project_node_items_update_own on public.project_node_items;
create policy project_node_items_update_own
  on public.project_node_items
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

drop policy if exists project_node_items_delete_own on public.project_node_items;
create policy project_node_items_delete_own
  on public.project_node_items
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
