-- =============================================================================
-- 자료 상태를 바꿀 수 있는 방향을 정한다 (14-D-2b)
-- =============================================================================
-- 앞 파일(20260923210000)이 더한 'reading_candidate'를 여기서 쓴다.
-- 파일이 둘인 이유는 그것뿐이다. (AGENTS.md 6절)
--
-- 한 방향만 허용한다
--   읽을 후보  ->  정식 자료     (전환. 설계 문서 8.4절이 말하는 것)
--   정식 자료  ->  읽을 후보     막는다
--
--   되돌릴 수 있게 두면, 인용과 메모와 파일이 붙은 논문이 "아직 안 읽은 것"이
--   된다. 목록에서 후보로 접히고, 서지 정보가 비어 있는 줄로 보인다.
--   그 상태에서 무엇이 진짜인지 알 방법이 없다.
--
--   잘못 담아두었다면 지운다. 후보는 제목 한 줄이라 지우는 값이 싸다.
--
-- 왜 트리거인가
--   RLS의 WITH CHECK는 OLD 행을 참조할 수 없다. "내 자료를 고치는 것"과
--   "상태를 어느 방향으로 바꾸는 것"을 구분하려면 BEFORE 트리거가 필요하다.
--   profiles의 승인 상태 가드가 같은 이유로 트리거다. (AGENTS.md 6절)
--
-- 이미 있는 가드 함수를 바꿔 쓴다
--   sources에는 BEFORE UPDATE 가드가 이미 하나 있다. 새 트리거를 더하지 않고
--   그 함수에 규칙을 넣는다. 같은 시점의 트리거가 둘이면 이름 순서에 따라
--   실행되어, 나중에 순서에 기대는 규칙이 생겼을 때 찾기 어려운 문제가 된다.
--   20260921090000의 정의를 이 파일이 대신한다.
-- =============================================================================

create or replace function public.guard_source_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'sources.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'sources.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'sources.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- 상태는 읽을 후보에서 정식 자료로 가는 방향만 허용한다. (설계 문서 8.4절)
  if new.status is distinct from old.status then
    if not (
      old.status = 'reading_candidate'::public.source_status
      and new.status = 'active'::public.source_status
    ) then
      raise exception
        '자료 상태는 읽을 후보에서 정식 자료로만 바꿀 수 있습니다.'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

comment on function public.guard_source_immutable_columns() is
  'sources의 불변 열을 지키고, 상태 전환을 읽을 후보에서 정식 자료로만 허용한다.';
