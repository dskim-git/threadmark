-- =============================================================================
-- Source 삭제 표시 함수
-- =============================================================================
-- 배경
--   sources_select_own 정책은 deleted_at이 비어 있는 행만 통과시킨다.
--   덕분에 삭제된 자료가 조회에 섞이지 않는 것이 데이터베이스에서 보장된다.
--
--   그런데 PostgREST는 영향받은 행 수를 세기 위해 갱신을 항상 RETURNING으로
--   감싼다. PostgreSQL은 RETURNING이 있는 UPDATE에 조회 정책을 갱신된 새 행에도
--   적용하므로, deleted_at을 채우는 순간 그 행은 조회 정책을 벗어나고
--   갱신 전체가 다음 오류로 실패한다.
--
--     new row violates row-level security policy for table "sources"
--
--   즉 PostgREST를 통해서는 "갱신 결과가 조회 정책을 벗어나는 갱신"을 할 수 없다.
--
-- 선택
--   정책에서 deleted_at 조건을 빼면 간단해지지만, 삭제된 자료를 걸러내는 책임이
--   애플리케이션 질의로 옮겨간다. 질의를 하나라도 빠뜨리면 조용히 새어나간다.
--   정책은 그대로 두고, 삭제만 전용 함수로 처리한다.
--
-- 보안
--   SECURITY DEFINER라서 RLS를 우회한다. 그래서 정책이 보장하던 것을
--   함수가 직접 확인한다. 소유자 본인인지, 승인된 계정인지 둘 다 본다.
--   auth.uid()로만 대상을 좁히므로 남의 자료는 건드릴 수 없다.
-- =============================================================================

create or replace function public.soft_delete_source(source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_updated integer;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not public.is_active_user(v_user) then
    raise exception '승인된 계정만 자료를 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  -- owner_id 조건이 이 함수의 유일한 접근 통제다. 빠뜨리면 남의 자료도 지워진다.
  update public.sources
  set deleted_at = pg_catalog.now()
  where id = source_id
    and owner_id = v_user
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  -- 대상이 없었는지, 실제로 지웠는지 호출자가 구분할 수 있게 한다.
  return v_updated > 0;
end;
$$;

comment on function public.soft_delete_source(uuid) is
  '자료에 삭제 표시를 남긴다. 소유자 본인과 승인된 계정만 수행할 수 있다.';

revoke all on function public.soft_delete_source(uuid) from public;
grant execute on function public.soft_delete_source(uuid) to authenticated;
