-- =============================================================================
-- 프로젝트를 링크로 공개하기 — 공개 상태와 열쇠 (16-B.8 3차례)
-- =============================================================================
-- 설계 문서 16-B절. (2026-10-04, 사용자가 정함)
--
--   > 1차적인 원문이 공개되는 것이 가장 불안정한거잖아. (...) thread의 메모
--   > 부분만 공유하는 방향으로 해서 안전하게 진행해줘.
--
-- 이 파일이 하는 일은 **켜고 끄는 것과 열쇠**다. 무엇이 나가는가는
-- `src/lib/sharing/public-fields.ts`에 있고(2차례), 공개된 것을 읽는 문은
-- 다음 차례에 만든다.
--
-- 왜 표를 따로 만드는가
--   `projects.visibility`에 `link`를 더하는 길이 있었다. 그러면 **상태가 두
--   곳에 생긴다.** 열쇠는 어딘가 담아야 하고, 열쇠가 있는지와 `visibility`가
--   무엇인지가 어긋날 수 있다. 이 저장소는 그런 자리에서 한쪽만 갱신되는
--   일을 이미 겪었다. (AGENTS.md 6절 `같은 뜻의 입력칸을 두 벌 만들지 않는다`)
--
--   **열쇠가 상태다.** 살아 있는 열쇠가 있으면 공개된 것이고 없으면 아니다.
--   한 곳이라 어긋날 자리가 없다.
--
--   그래서 `project_visibility` 열거형은 `private` 하나로 그대로 둔다.
--   쓰지 않을 값을 미리 넣지 않는다는 원칙과도 맞는다. (AGENTS.md 6절)
--   그 칸에 주석을 달아 **여기를 보라고 적어 둔다.** 적지 않으면 다음 사람이
--   `visibility = 'private'`으로 공개 여부를 거르려 한다.
--
-- 왜 지우지 않고 남기는가
--   16-B.6절. **공개했던 사실은 남긴다.** 언제 켜고 껐는지다. "그때 무엇이
--   나갔나"에 답할 수 없으면 권리자 요청이 왔을 때 할 말이 없다.
--
--   그래서 끄는 것은 `revoked_at`을 적는 일이고, 줄을 지우지 않는다.
--   `delete` 권한도 정책도 두지 않는다. 장부와 같다. (`ai_usage_grants`)
--
-- 다시 켜면 새 열쇠가 나온다
--   16-B.6절. 끈 열쇠는 되살아나지 않는다. 다시 켜는 것은 **새 줄을 넣는
--   일**이고, 그러면 새 열쇠가 나온다. **한 번 돌아간 링크를 영원히 믿어야
--   하는 상태를 만들지 않는다.**
--
-- 열쇠를 클라이언트가 정하지 못한다
--   `owner_id`와 같은 생각이다. (보안 원칙 2) 보낸 값을 쓰면 짧거나 뻔한
--   열쇠를 넣을 수 있고, 그러면 **주소를 맞혀서 열 수 있게 된다.**
--   16-B.5절이 막으려는 것이 그것이다. 트리거가 무조건 덮어쓴다.
--
-- anon에게 표 권한을 주지 않는다
--   **이 표에도, 다른 어느 표에도 주지 않는다.** 001의 검사 17이 "anon 역할에
--   테이블 권한 없음"을 0으로 지키고 있고, 그 보장을 깨지 않는다.
--   공개된 것을 읽는 문은 다음 차례에 **함수 하나**로 만든다. 함수에 실행
--   권한을 주는 것은 표 권한이 아니다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 썼다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 표
-- -----------------------------------------------------------------------------

create table if not exists public.project_public_links (
  id          uuid primary key default gen_random_uuid(),

  -- 기본값은 타입을, 트리거는 실제 보장을 맡는다. (AGENTS.md 6절)
  owner_id    uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  /*
    어느 프로젝트를 여는가. **공개하는 단위는 프로젝트 하나다.** (16-B.4절)

    자료 하나나 기록 하나는 열지 않는다. 한 곳만 열면 **새는 구멍도 한
    곳**이고, 공개 판정을 세 곳에 걸 필요가 없다.
  */
  project_id  uuid not null
                references public.projects (id) on delete cascade,

  /*
    열쇠. **주소를 맞혀서 열 수 없게 하는 유일한 장치다.** (16-B.5절)

    프로젝트 번호를 그대로 주소에 쓰면 번호를 바꿔 가며 남의 것을 열어볼 수
    있다. 그래서 따로 만든 긴 값으로 연다.

    트리거가 채운다. 보낸 값은 쓰지 않는다. 짧은 열쇠를 넣을 수 있으면
    막으려던 것이 그대로 열린다.
  */
  token       text not null,

  created_at  timestamptz not null default now(),

  /*
    끈 때. 비어 있으면 **지금 켜져 있다**는 뜻이다.

    이 칸 하나가 공개 상태다. 끄는 것은 이 값을 적는 일이고 줄은 남는다.
    (16-B.6절)
  */
  revoked_at  timestamptz,

  /*
    열쇠 모양을 제약조건으로 지킨다.

    **트리거가 채우는 값인데도 제약조건을 둔다.** 트리거는 나중에 누군가
    고칠 수 있고, 그때 짧은 열쇠가 조용히 들어온다. 이 표는 그것 하나가
    뚫리면 전부가 뚫리는 자리다. (`ai_usage_grants`의 두 겹과 같은 생각)

    16진수 64자리다. uuid 두 개를 이어 만든다. 아래 트리거에 까닭을 적었다.
  */
  constraint project_public_links_token_shape check (
    token ~ '^[0-9a-f]{64}$'
  ),

  /*
    끈 때가 만든 때보다 앞설 수 없다.

    없으면 시간을 거꾸로 적어 "켜진 적 없는데 꺼졌다"는 줄을 만들 수 있고,
    "언제 켜고 껐는지"를 읽을 수 없게 된다.
  */
  constraint project_public_links_revoked_after_created check (
    revoked_at is null or revoked_at >= created_at
  )
);

comment on table public.project_public_links is
  '프로젝트를 링크로 여는 열쇠와 그 역사. 살아 있는 열쇠가 있으면 공개된 것이다. (설계 문서 16-B절)';
comment on column public.project_public_links.token is
  '열쇠. 트리거가 채운다. 주소를 맞혀서 열 수 없게 하는 유일한 장치다. (16-B.5절)';
comment on column public.project_public_links.revoked_at is
  '끈 때. 비어 있으면 켜져 있다. 이 칸 하나가 공개 상태다. 줄은 지우지 않는다. (16-B.6절)';

/*
  **열쇠는 전부에서 하나뿐이어야 한다.**

  `unique`를 거는 까닭은 충돌 방지가 아니라(그럴 확률은 없다) 열쇠로 찾는
  질의가 **반드시 한 줄**을 보게 하려는 것이다. 두 줄이 돌아오는 상황을
  읽는 쪽에서 처리하게 두면, 그 처리가 틀렸을 때 남의 프로젝트가 열린다.
*/
create unique index if not exists project_public_links_token_key
  on public.project_public_links (token);

/*
  **한 프로젝트에 살아 있는 열쇠는 하나뿐이다.**

  둘이 되면 "껐다"가 뜻을 잃는다. 하나를 끄고도 다른 하나로 열린다.
  부분 색인이라 꺼진 줄은 몇이든 쌓인다. 그것이 역사다.
*/
create unique index if not exists project_public_links_one_live_idx
  on public.project_public_links (project_id)
  where revoked_at is null;

-- 내 공개 내역을 프로젝트별로 최근 것부터 본다.
create index if not exists project_public_links_owner_idx
  on public.project_public_links (owner_id, project_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 2. 열쇠를 만들고 소유자를 고정하고 내 프로젝트인지 확인한다
-- -----------------------------------------------------------------------------
-- 소유자 확정과 확인을 한 함수에 둔다. 트리거를 나누면 이름 순서에 따라
-- 확인이 먼저 돌아 아직 정해지지 않은 owner_id를 본다. (AGENTS.md 6절)

create or replace function public.set_project_public_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  new.created_at := pg_catalog.now();

  /*
    켜면서 동시에 끌 수는 없다.

    보낸 값에 `revoked_at`이 들어 있으면 **태어날 때부터 죽은 줄**이 된다.
    그런 줄은 부분 색인에 걸리지 않아 살아 있는 열쇠 자리를 비워 두고,
    화면은 공개된 것으로 보일 수 있다.
  */
  new.revoked_at := null;

  /*
    열쇠는 우리가 만든다. 보낸 값은 버린다. (보안 원칙 2와 같은 생각)

    **왜 uuid 두 개를 이어 쓰는가.** `gen_random_bytes`는 pgcrypto가
    있어야 하고 이 프로젝트는 그 확장을 쓰지 않는다. 확장 하나를 이 일
    하나 때문에 켜면 **권한을 확인할 자리가 또 하나 늘어난다.**

    `gen_random_uuid()`는 PostgreSQL이 기본으로 주고 암호학적으로 안전한
    난수를 쓴다. 하나에 122비트이므로 둘이면 244비트다. 주소를 맞혀 보는
    일에 대해서는 넉넉하다.

    **`pg_catalog.`을 붙여 부른다.** 이 함수는 `search_path`를 비워 두고
    돌기 때문에 이름만 쓰면 찾지 못한다. PostgreSQL 13부터 이 함수는
    `pg_catalog`에 있고, 같은 판본부터 pgcrypto는 이 함수를 더 만들지
    않는다. 그래서 자리가 하나로 정해져 있다.
  */
  new.token := pg_catalog.replace(
    pg_catalog.gen_random_uuid()::text
      || pg_catalog.gen_random_uuid()::text,
    '-', ''
  );

  /*
    남의 프로젝트에 열쇠를 달 수 없다.

    **외래키 제약은 RLS를 보지 않는다.** (AGENTS.md 6절) 프로젝트 번호만
    알면 남의 프로젝트를 공개해버릴 수 있다. 이 표에서는 그 결과가 가장
    무겁다. 남의 글이 밖으로 나간다.
  */
  perform public.assert_project_owned(new.project_id, new.owner_id);

  /*
    지운 프로젝트는 공개할 수 없다.

    `assert_project_owned`는 소유자만 본다. 삭제 표시된 프로젝트에 열쇠를
    달 수 있으면, 지운 것이 공개되는 길이 생긴다.
  */
  if exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.deleted_at is not null
  ) then
    raise exception '지운 프로젝트는 공개할 수 없습니다.' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.set_project_public_link() is
  '열쇠를 만들고 소유자를 고정하고 내 프로젝트인지 확인한다. 보낸 열쇠는 쓰지 않는다.';

drop trigger if exists project_public_links_set_fields
  on public.project_public_links;
create trigger project_public_links_set_fields
  before insert on public.project_public_links
  for each row
  execute function public.set_project_public_link();


-- -----------------------------------------------------------------------------
-- 3. 끄는 것만 할 수 있다
-- -----------------------------------------------------------------------------
/*
  **RLS의 `with check`는 `OLD` 행을 볼 수 없다.** (AGENTS.md 6절)

  그래서 "끄기만 허용"을 정책으로 쓸 수 없다. 정책은 "내 줄인가"까지만
  말하고, **무엇이 바뀌었는가**는 BEFORE 트리거가 본다. 프로필의 보호된
  칸을 지키는 방식과 같다.

  이 트리거가 막는 것 셋이다.

    - 꺼진 열쇠를 되살리기. **16-B.6절이 명시로 금지한다.** 한 번 돌아간
      링크를 영원히 믿어야 하는 상태를 만들지 않는다.
    - 열쇠 바꿔치기. 바꿀 수 있으면 짧은 열쇠를 넣을 수 있다.
    - 다른 프로젝트로 옮기기. 옮기면 A를 공개한 링크가 B를 연다. 받은
      사람은 주소가 그대로이므로 **바뀐 줄 모른다.**
*/
create or replace function public.guard_project_public_link_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'project_public_links.id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'project_public_links.owner_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'project_public_links.project_id는 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if new.token is distinct from old.token then
    raise exception 'project_public_links.token은 변경할 수 없습니다. 다시 켜면 새 열쇠가 나옵니다.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'project_public_links.created_at은 변경할 수 없습니다.'
      using errcode = '42501';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception '끈 열쇠는 되살릴 수 없습니다. 다시 켜면 새 열쇠가 나옵니다.'
      using errcode = '42501';
  end if;

  /*
    끈 때는 우리가 적는다. 보낸 값을 쓰면 "작년에 껐다"고 적을 수 있고,
    그러면 역사가 거짓이 된다.
  */
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

comment on function public.guard_project_public_link_update() is
  '끄는 것만 허용한다. 되살리기·열쇠 바꿔치기·프로젝트 옮기기를 막는다. with check는 OLD를 못 본다.';

drop trigger if exists project_public_links_guard_update
  on public.project_public_links;
create trigger project_public_links_guard_update
  before update on public.project_public_links
  for each row
  execute function public.guard_project_public_link_update();


-- -----------------------------------------------------------------------------
-- 4. 지운 프로젝트는 그 자리에서 공개가 꺼진다
-- -----------------------------------------------------------------------------
/*
  **프로젝트의 삭제는 표시만 한다.** 그래서 지워도 열쇠는 살아 있다.

  읽는 문에서 `deleted_at is null`을 보게 할 수도 있지만, **그 한 겹에만
  기대지 않는다.** 지운 것이 공개된 채로 남는 일은 사용자가 가장 예상하지
  못하는 고장이다. 지운 사람은 그것을 **확인할 방법이 없다.** 프로젝트가
  목록에서 사라졌으므로 공개 단추도 함께 사라진다.

  그래서 지우는 그 자리에서 끈다. `soft_delete_project`를 고쳐 쓴다.
  이 함수는 이미 `SECURITY DEFINER`이고 소유자를 직접 확인한다.
*/
create or replace function public.soft_delete_project(project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_updated integer;
  /*
    매개변수 이름과 `project_public_links`의 칸 이름이 같다. PL/pgSQL은
    그런 참조를 **모호하다고 보고 멈춘다.** 지역 변수로 옮기고 칸에는
    별칭을 붙여 둘을 가른다.
  */
  v_project uuid := project_id;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not public.is_active_user(v_user) then
    raise exception '승인된 계정만 프로젝트를 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  -- owner_id 조건이 이 함수의 유일한 접근 통제다.
  update public.projects
  set deleted_at = pg_catalog.now()
  where id = v_project
    and owner_id = v_user
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  /*
    지웠으면 살아 있는 열쇠를 끈다. (16-B)

    **지운 것이 공개된 채로 남지 않게 한다.** 줄은 지우지 않는다. 언제
    껐는지가 남아야 한다.

    `v_updated > 0`일 때만 끄는 까닭. 남의 프로젝트 번호로 이 함수를
    불렀다면 위의 `update`가 아무것도 바꾸지 않는다. 그때 열쇠를 끄면
    **남의 공개를 끌 수 있는 길**이 된다.
  */
  if v_updated > 0 then
    update public.project_public_links l
    set revoked_at = pg_catalog.now()
    where l.project_id = v_project
      and l.revoked_at is null;
  end if;

  return v_updated > 0;
end;
$$;

comment on function public.soft_delete_project(uuid) is
  '프로젝트에 삭제 표시를 하고 살아 있는 공개 열쇠를 끈다. 조회 정책이 삭제된 행을 제외해 PostgREST 갱신으로는 할 수 없다.';


-- -----------------------------------------------------------------------------
-- 5. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. **anon에는 아무것도 주지 않는다.**
-- 공개된 것을 읽는 문은 다음 차례에 함수로 만든다. (머리말)
--
-- **delete를 주지 않는다.** 공개했던 사실은 남긴다. (16-B.6절) 권한이
-- 없으면 정책을 잘못 쓰더라도 지워지지 않는다. 장부와 같은 생각이다.

revoke all on table public.project_public_links from anon, authenticated;

grant select, insert, update on table public.project_public_links
  to authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다. 정지되거나 승인 대기 중인 계정도 소유자
-- 조건만으로는 자기 줄에 접근한다. is_active_user()를 함께 건다. (보안 원칙 1)

alter table public.project_public_links enable row level security;

/*
  내 열쇠는 내가 본다.

  **꺼진 줄도 본다.** 그것이 "언제 켜고 껐는지"다. (16-B.6절) 조회 정책에
  `revoked_at is null`을 걸면 역사를 읽을 수 없고, 더 나쁜 것이 있다.
  PostgREST는 갱신을 `RETURNING`으로 감싸므로 **끄는 갱신 자체가 실패한다.**
  갱신 결과가 조회 정책을 벗어나기 때문이다. (AGENTS.md 6절)
*/
drop policy if exists project_public_links_select_own
  on public.project_public_links;
create policy project_public_links_select_own
  on public.project_public_links
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

/*
  공개를 켜는 일이다. 트리거가 열쇠를 만들고 내 프로젝트인지 확인한다.
*/
drop policy if exists project_public_links_insert_own
  on public.project_public_links;
create policy project_public_links_insert_own
  on public.project_public_links
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

/*
  끄는 일이다. **무엇이 바뀌었는가는 정책이 못 본다.** `with check`가
  `OLD`를 볼 수 없어서다. 트리거가 끄기만 허용한다.
*/
drop policy if exists project_public_links_update_own
  on public.project_public_links;
create policy project_public_links_update_own
  on public.project_public_links
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

-- 지우기 정책은 두지 않는다. 권한도 없다. 공개했던 사실은 남긴다.


-- -----------------------------------------------------------------------------
-- 7. visibility 칸에 여기를 보라고 적어 둔다
-- -----------------------------------------------------------------------------
-- **이 주석이 없으면 다음 사람이 `visibility = 'private'`으로 공개 여부를
-- 거르려 한다.** 그 값은 늘 `private`이므로 거르는 조건이 아무 일도 하지
-- 않고, 오류도 나지 않는다.

comment on column public.projects.visibility is
  '쓰지 않는다. 공개 여부는 project_public_links에 살아 있는 열쇠가 있는지로 정한다. 상태를 두 곳에 두지 않으려고 이 칸을 늘리지 않았다. (설계 문서 16-B절)';
