-- =============================================================================
-- ThreadMark — source_files.origin을 고정한다
-- =============================================================================
-- 배경
--   바로 앞 마이그레이션에서 origin에 'picked'를 더했다.
--
--     upload  ThreadMark가 Drive에 만들었다.
--     picked  사용자가 원래 가지고 있던 것을 고른 것이다.
--
--   이 구분은 "우리가 지워도 되는 파일"과 "손대면 안 되는 파일"을 가르려고 둔 것이다.
--   (설계 문서 10.3절의 orphan 파일 정리)
--
-- 왜 막아야 하는가
--   값을 나중에 바꿀 수 있으면 구분 자체가 의미를 잃는다.
--   picked를 upload로 바꿔두면, 앞으로 만들 정리 기능이 사용자가 원래 가지고
--   있던 파일을 "우리가 만든 것"으로 보고 지워도 된다고 판단하게 된다.
--
--   자기 행이라도 허용하지 않는다. 사용자가 직접 할 일이 아니고,
--   코드의 실수 한 번으로 남의 자료가 아니라 **자기 자료**가 지워지는 쪽이
--   되돌리기 더 어렵다.
--
--   파일이 들어온 경로가 바뀌는 일은 없다. 다른 파일이면 새 행을 만든다.
--
-- 함께 유지하는 것
--   기존 가드(id, owner_id, source_id, created_at, drive_file_id, ready 되돌리기)를
--   그대로 둔다. 함수를 통째로 다시 만들므로 빠뜨리면 그 보호가 사라진다.
--
-- 재실행 안전성
--   create or replace라 몇 번을 실행해도 같다. 트리거는 이미 이 함수를 가리킨다.
-- =============================================================================

create or replace function public.guard_source_file_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'source_files.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'source_files.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'source_files.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'source_files.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- 파일이 어디에서 왔는지는 바뀌지 않는다.
  -- 이 값으로 "손대도 되는 파일"을 가르기 때문이다.
  if new.origin is distinct from old.origin then
    raise exception 'source_files.origin은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if old.drive_file_id is not null
     and new.drive_file_id is distinct from old.drive_file_id then
    raise exception 'source_files.drive_file_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- 확인을 마친 파일이 다시 업로드 중으로 돌아가지 않는다.
  if old.status = 'ready' and new.status <> 'ready' then
    raise exception 'source_files.status는 ready에서 되돌릴 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;
