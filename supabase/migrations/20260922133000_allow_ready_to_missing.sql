-- =============================================================================
-- ThreadMark — ready에서 missing으로 가는 길을 연다
-- =============================================================================
-- 배경
--   12-C에서 가드 트리거에 이런 규칙을 넣었다.
--
--     확인을 마친 파일이 다시 업로드 중으로 돌아가지 않는다.
--     if old.status = 'ready' and new.status <> 'ready' then ... 막는다
--
--   막으려던 것은 `ready -> pending`이었다. 확인을 마친 기록이 흔들리면
--   "이 파일은 확인된 것인가"를 알 수 없게 되기 때문이다.
--
--   그런데 조건을 "ready가 아닌 모든 것"으로 적어서, 이번에 더한 missing까지
--   함께 막혔다. 파일이 사라진 것을 표시할 수가 없다.
--
-- 조치
--   ready에서 갈 수 있는 곳을 missing 하나로 좁혀서 연다.
--   ready -> pending은 그대로 막는다. 되돌아가면 안 되는 것은 그쪽이다.
--
--   ready   -> missing   허용. Drive에서 파일이 사라졌다.
--   missing -> ready     허용. 다시 찾았다. (이 가드가 막지 않는다)
--   ready   -> pending   차단. 확인을 마친 것이 미확인으로 돌아갈 수 없다.
--   missing -> pending   차단. 같은 이유다.
--
-- 남기는 교훈
--   "이 상태만 허용"이 아니라 "이 상태가 아니면 금지"로 적으면, 나중에 값을
--   더할 때마다 이 규칙에 걸린다. 금지할 것을 적는 편이 값이 늘어나도 버틴다.
--
-- 함께 유지하는 것
--   기존 가드(id, owner_id, source_id, created_at, origin, drive_file_id)를
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
  -- 사라진 것으로 표시하는 것은 허용한다. 그것은 되돌아가는 것이 아니라
  -- 지금 Drive에 없다는 사실을 적는 것이다.
  if old.status = 'ready'
     and new.status = 'pending'::public.source_file_status then
    raise exception 'source_files.status는 ready에서 pending으로 돌릴 수 없습니다.'
      using errcode = '42501';
  end if;

  -- 사라진 파일도 업로드 중으로 돌아가지 않는다. 다시 올린다면 새 행을 만든다.
  if old.status = 'missing'::public.source_file_status
     and new.status = 'pending'::public.source_file_status then
    raise exception 'source_files.status는 missing에서 pending으로 돌릴 수 없습니다.'
      using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;
