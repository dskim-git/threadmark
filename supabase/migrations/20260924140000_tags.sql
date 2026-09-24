-- =============================================================================
-- 태그 (15-B)
-- =============================================================================
-- 설계 문서 22절 MVP 목록의 `Tag`, 20절의 `tags`와 `capture_tags`.
--
-- 문서가 스스로 어긋나 있었다
--   20절의 표 목록에는 `tags`와 `capture_tags`만 있다. 그런데 11.1절은
--   웹사이트 자료의 등록 정보에 `태그`를 적어두었고, 13.5절은 음악의 개인
--   분류를 두고 "이 값들은 일반 Tag로 저장한다"고 한다. 둘 다 **자료**에
--   붙는 태그다. 20절의 목록이 `source_tags`를 빠뜨린 것으로 읽었다.
--   그 판단과 이유는 블루프린트 20-1절에 적었다.
--
-- 표 셋으로 나눈다
--   tags          태그 이름 자체. 사람마다 자기 목록을 갖는다.
--   source_tags   자료에 단 것
--   capture_tags  기록에 단 것
--
--   자료와 기록이 **같은 tags 목록을 나눠 쓴다.** 따로 두면 `수업 준비`를
--   양쪽에 치게 되고, 그 태그로 모아 봐도 한쪽만 나온다. 태그를 다는 이유가
--   "흩어진 것을 한 이름으로 묶는 것"인데 그것이 되지 않는다.
--
-- 이름을 둘로 담는다
--   name  사람이 보는 그대로. 처음 친 모양을 지킨다.
--   slug  같은 태그인지 판정하는 값. 여기에 unique를 건다.
--
--   "AI 융합수업"과 "ai 융합수업"과 " AI  융합수업 "이 따로 쌓이면 고르는
--   줄에 비슷한 것이 셋 남는다. 어느 것을 눌러야 할지 알 수 없고, 하나를
--   누르면 나머지 둘에 달아둔 것이 안 보인다. 다듬는 규칙은
--   src/lib/tags/name.ts에 있고 tests/tags-name.test.mjs가 이 파일과
--   맞대어 본다.
--
--   보이는 이름을 고쳐서 담지 않는 이유는, `AI`를 쳤는데 화면에 `ai`로
--   나오면 내가 친 것이 아닌 것 같아지기 때문이다.
--
-- 지우면 따라 지워진다
--   태그를 지우면 그 태그로 달아둔 것이 함께 끊긴다(on delete cascade).
--   자료나 기록을 지워도 같다. 연결만 사라지고 반대쪽은 그대로다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),

  -- 소유자. 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,

  -- 사람이 보는 이름. 처음 친 모양 그대로다.
  name       text not null,
  -- 같은 태그인지 판정하는 값. 다듬은 이름을 소문자로 내린 것이다.
  slug       text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tags_name_length check (
    char_length(name) between 1 and 40
  ),
  -- 쉼표는 여러 개를 가르는 글자다. 이름에 들어가면 가를 수 없다.
  constraint tags_name_no_separator check (name not like '%,%'),
  -- 앞뒤 공백이 남아 있으면 눈에 같은 태그가 둘이 된다.
  constraint tags_name_trimmed check (name = btrim(name)),

  /*
    slug는 더 내려갈 데가 없는 모양이어야 한다.

    `slug = lower(name)`으로 걸고 싶지만 그러지 않는다. 소문자로 내리는
    규칙이 PostgreSQL과 브라우저에서 **몇 글자에 대해 다르다.** 터키어의
    점 있는 대문자 I 같은 것들이다. 한글과 영문에서는 둘이 똑같지만,
    어쩌다 그런 글자가 든 태그를 치면 멀쩡한 태그가 저장만 거부된다.
    그때 사용자에게는 고칠 방법이 없다.

    그래서 여기서는 "더 내려갈 데가 없는가"만 본다. 이름에서 slug를
    끌어내는 규칙은 src/lib/tags/name.ts 한 곳에 있고, 단위 검사가 그
    규칙을 지킨다. 겹치는 것을 막는 일은 아래 unique 인덱스가 한다.
  */
  constraint tags_slug_is_lower check (slug = lower(slug)),
  constraint tags_slug_length check (char_length(slug) between 1 and 40)
);

comment on table public.tags is
  '사용자가 만든 태그. 자료와 기록이 같은 목록을 나눠 쓴다.';
comment on column public.tags.name is
  '사람이 보는 이름. 처음 친 모양을 지킨다.';
comment on column public.tags.slug is
  '같은 태그인지 판정하는 값. 이름을 소문자로 내린 것이며 여기에 unique를 건다.';

-- 한 사람 안에서 같은 태그는 하나뿐이다.
create unique index if not exists tags_owner_slug_key
  on public.tags (owner_id, slug);

-- 고르는 줄은 이름순으로 늘어놓는다.
create index if not exists tags_owner_name_idx
  on public.tags (owner_id, name);


create table if not exists public.source_tags (
  source_id  uuid not null references public.sources (id) on delete cascade,
  tag_id     uuid not null references public.tags (id)    on delete cascade,
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (source_id, tag_id)
);

comment on table public.source_tags is
  '자료에 단 태그. 양쪽이 같은 소유자인지 트리거가 확인한다.';

-- "이 태그가 달린 자료"를 찾는 길. 태그로 거르는 화면이 쓴다.
create index if not exists source_tags_tag_idx
  on public.source_tags (tag_id, created_at desc);
create index if not exists source_tags_owner_idx
  on public.source_tags (owner_id);


create table if not exists public.capture_tags (
  capture_id uuid not null references public.captures (id) on delete cascade,
  tag_id     uuid not null references public.tags (id)     on delete cascade,
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (capture_id, tag_id)
);

comment on table public.capture_tags is
  '기록에 단 태그. 양쪽이 같은 소유자인지 트리거가 확인한다.';

create index if not exists capture_tags_tag_idx
  on public.capture_tags (tag_id, created_at desc);
create index if not exists capture_tags_owner_idx
  on public.capture_tags (owner_id);


-- -----------------------------------------------------------------------------
-- 2. 소유자 고정과 불변 열
-- -----------------------------------------------------------------------------

create or replace function public.set_tag_owner()
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

  return new;
end;
$$;

drop trigger if exists tags_set_owner on public.tags;
create trigger tags_set_owner
  before insert on public.tags
  for each row
  execute function public.set_tag_owner();


create or replace function public.guard_tag_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'tags.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'tags.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'tags.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists tags_guard_immutable_columns on public.tags;
create trigger tags_guard_immutable_columns
  before update on public.tags
  for each row
  execute function public.guard_tag_immutable_columns();


-- -----------------------------------------------------------------------------
-- 3. 연결할 때 양쪽이 내 것인지 확인한다
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. tag_id 값만 알면 남의 태그를 내 자료에
-- 붙일 수 있다는 뜻이다. 연결 표는 **양쪽 모두** 확인한다. (AGENTS.md 6절)
--
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다.

create or replace function public.assert_tag_owned(
  p_tag_id   uuid,
  p_owner_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tag_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tags t
    where t.id = p_tag_id
      and t.owner_id = p_owner_id
  ) then
    raise exception '연결할 태그를 찾을 수 없습니다.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_tag_owned(uuid, uuid) from public;
grant execute on function public.assert_tag_owned(uuid, uuid) to authenticated;


create or replace function public.set_source_tag_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  perform public.assert_source_owned(new.source_id, new.owner_id);
  perform public.assert_tag_owned(new.tag_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists source_tags_set_link on public.source_tags;
create trigger source_tags_set_link
  before insert on public.source_tags
  for each row
  execute function public.set_source_tag_link();


create or replace function public.set_capture_tag_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  perform public.assert_capture_owned(new.capture_id, new.owner_id);
  perform public.assert_tag_owned(new.tag_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists capture_tags_set_link on public.capture_tags;
create trigger capture_tags_set_link
  before insert on public.capture_tags
  for each row
  execute function public.set_capture_tag_link();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. 누가 무엇을 할 수 있는지 여기에 전부 적는다.
-- anon에는 아무것도 주지 않는다.

revoke all on table public.tags         from anon, authenticated;
revoke all on table public.source_tags  from anon, authenticated;
revoke all on table public.capture_tags from anon, authenticated;

-- 태그는 이름을 고칠 수 있어야 한다. 오타를 고치려고 지웠다 다시 만들면
-- 달아둔 것이 전부 끊긴다.
grant select, insert, update, delete on table public.tags to authenticated;

-- 연결은 잇거나 끊는 것뿐이다. 고칠 것이 없으므로 UPDATE를 주지 않는다.
-- 태그를 잘못 골랐다면 끊고 다시 잇는다. (source_relations와 같다)
grant select, insert, delete on table public.source_tags  to authenticated;
grant select, insert, delete on table public.capture_tags to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 자료에 접근한다. is_active_user()를 함께 건다.

alter table public.tags         enable row level security;
alter table public.source_tags  enable row level security;
alter table public.capture_tags enable row level security;

drop policy if exists tags_select_own on public.tags;
create policy tags_select_own
  on public.tags
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists tags_insert_own on public.tags;
create policy tags_insert_own
  on public.tags
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists tags_update_own on public.tags;
create policy tags_update_own
  on public.tags
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

drop policy if exists tags_delete_own on public.tags;
create policy tags_delete_own
  on public.tags
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


drop policy if exists source_tags_select_own on public.source_tags;
create policy source_tags_select_own
  on public.source_tags
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_tags_insert_own on public.source_tags;
create policy source_tags_insert_own
  on public.source_tags
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists source_tags_delete_own on public.source_tags;
create policy source_tags_delete_own
  on public.source_tags
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );


drop policy if exists capture_tags_select_own on public.capture_tags;
create policy capture_tags_select_own
  on public.capture_tags
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists capture_tags_insert_own on public.capture_tags;
create policy capture_tags_insert_own
  on public.capture_tags
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists capture_tags_delete_own on public.capture_tags;
create policy capture_tags_delete_own
  on public.capture_tags
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
