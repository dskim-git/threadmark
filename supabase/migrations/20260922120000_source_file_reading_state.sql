-- =============================================================================
-- ThreadMark — 마지막으로 읽던 자리
-- =============================================================================
-- 목적
--   설계 문서 9.1절: 마지막 열람 페이지와 확대율을 사용자별로 기억한다.
--   다음에 그 PDF를 열면 보던 자리에서 시작한다.
--
-- 왜 별도의 표를 만들지 않는가
--   설계 문서 20절의 표 목록에 읽기 상태를 담는 표가 없다.
--   문서에 없는 표를 추측해서 만들지 않는다.
--
--   그리고 source_files의 한 행은 이미 한 사람의 것이다. (owner_id)
--   그래서 여기에 두면 "사용자별로 기억한다"가 저절로 지켜진다.
--   표를 따로 만들면 소유자 확인과 RLS를 한 벌 더 써야 하는데,
--   얻는 것 없이 틀릴 자리만 늘어난다.
--
-- updated_at에 대하여
--   페이지를 넘길 때마다 updated_at이 바뀐다. 그 값이 "파일 정보가 언제
--   바뀌었나"를 뜻하던 것에서 "언제 마지막으로 읽었나"에 가까워진다.
--   지금은 updated_at을 그런 용도로 쓰는 곳이 없어 문제되지 않는다.
--   화면은 페이지를 넘길 때마다 저장하지 않고 잠시 기다렸다가 한 번만 저장한다.
--
-- 읽는 자리를 못 적어도 읽기 자체는 되어야 한다
--   이 값들은 편의를 위한 것이다. 저장에 실패해도 PDF는 그대로 열린다.
--   그래서 not null로 두지 않고, 값이 없으면 1쪽에서 시작한다.
--
-- 재실행 안전성
--   add column if not exists를 쓴다. 제약조건도 이름으로 확인 후 추가한다.
-- =============================================================================

alter table public.source_files
  add column if not exists last_page integer,
  add column if not exists last_zoom numeric(4, 2);

comment on column public.source_files.last_page is
  '마지막으로 보던 페이지. 값이 없으면 1쪽에서 시작한다. (설계 문서 9.1절)';
comment on column public.source_files.last_zoom is
  '마지막 확대율. 1.00이 100%다. 값이 없으면 화면 너비에 맞춘다.';


-- -----------------------------------------------------------------------------
-- 제약조건
-- -----------------------------------------------------------------------------
-- 브라우저가 보내는 값이다. 말이 되는 범위인지 데이터베이스에서도 확인한다.
-- 0쪽이나 음수 배율이 들어가면 다음에 열 때 화면이 깨진다.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_files_last_page_range'
      and conrelid = 'public.source_files'::regclass
  ) then
    alter table public.source_files
      add constraint source_files_last_page_range
      check (last_page is null or last_page >= 1);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_files_last_zoom_range'
      and conrelid = 'public.source_files'::regclass
  ) then
    -- 0.25배에서 8배. 화면에서 고를 수 있는 범위와 같게 둔다.
    alter table public.source_files
      add constraint source_files_last_zoom_range
      check (last_zoom is null or (last_zoom >= 0.25 and last_zoom <= 8));
  end if;
end
$$;
