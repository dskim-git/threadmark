-- =============================================================================
-- 논문 분석 서식 (14-B)
-- =============================================================================
-- 설계 문서 8.2절, 20절의 `paper_analyses`.
--
-- 8.2절이 다섯 묶음 32개 항목을 적어두었다. 그중 **둘은 글이 아니라 관계**라서
-- 여기에 열을 만들지 않는다.
--
--   관련 프로젝트      source_projects가 이미 한다 (11단계)
--   연결되는 다른 자료  8.4절의 source_relations, 즉 14-D다
--
-- 글로 또 적게 두면 같은 물음에 답이 두 개가 된다. 어느 쪽이 맞는지 나중에
-- 알 수 없고, 한쪽을 고쳐도 다른 쪽은 그대로 남는다. 그래서 30개만 담는다.
--
-- 왜 jsonb 한 덩어리가 아니라 열 서른 개인가
--   항목이 설계 문서에 정해져 있고 열려 있지 않다. jsonb에 담으면 길이
--   제약을 걸 수 없고, 생성된 타입도 무엇이 들어 있는지 모른다. 오타 난
--   열쇠로 저장해도 아무도 막지 못하고, 그 글은 조용히 사라진다.
--
--   열로 두면 데이터베이스가 길이를 지키고, 타입 생성기가 이름을 알려주며,
--   `src/lib/papers/analysis-fields.ts`와 어긋나면 컴파일에서 드러난다.
--
-- 왜 길이 제약을 반복해 적지 않고 반복문으로 거는가
--   서른 번 같은 줄을 적으면 그중 하나를 다르게 적어도 아무도 못 본다.
--   이름 목록 하나만 두고 같은 제약을 걸면 그런 일이 생기지 않는다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.paper_analyses (
  id                       uuid primary key default gen_random_uuid(),

  -- 소유자. 기본값과 트리거가 auth.uid()로 채운다. (보안 원칙 2)
  -- 기본값을 빠뜨리면 생성된 타입이 이 열을 필수로 본다. (AGENTS.md 6절)
  owner_id                 uuid not null default auth.uid()
                             references auth.users (id) on delete cascade,

  -- 자료 하나에 분석은 하나다. 자료를 영구 삭제하면 함께 사라진다.
  source_id                uuid not null unique
                             references public.sources (id) on delete cascade,

  -- 발견 맥락
  discovery_path           text,  -- 발견 경로
  first_impression         text,  -- 발견 이유와 첫인상
  reading_purpose          text,  -- 읽는 목적
  expected_relevance       text,  -- 읽기 전 예상 관련성

  -- 기본 이해
  intended_audience        text,  -- 예상 독자
  research_topic           text,  -- 연구 주제
  research_purpose         text,  -- 연구 목적
  research_questions       text,  -- 연구 문제 또는 연구 질문
  key_concepts             text,  -- 주요 개념
  theoretical_background   text,  -- 이론적 배경

  -- 연구 설계
  study_type               text,  -- 연구 유형
  research_method          text,  -- 연구 방법
  participants             text,  -- 연구 참여자·표본
  data_collection          text,  -- 자료 수집 방법
  analysis_method          text,  -- 분석 방법
  study_context            text,  -- 연구 기간과 맥락

  -- 주요 내용
  main_argument            text,  -- 핵심 주장
  key_findings             text,  -- 주요 연구 결과
  discussion               text,  -- 논의
  significance             text,  -- 연구의 의미
  implications             text,  -- 교육적·실천적 시사점
  limitations              text,  -- 제한점
  future_research          text,  -- 후속 연구 및 제언

  -- 나의 활용 (설계 문서 2.4절: 여기가 내가 한 말이다)
  my_interpretation        text,  -- 나의 해석
  where_to_use             text,  -- 내 연구의 어느 부분에서 사용할지
  supports_claim           text,  -- 뒷받침할 주장
  agreements_objections    text,  -- 동의·반론
  quote_candidates         text,  -- 직접 인용 후보
  paraphrase_candidates    text,  -- 바꾸어 인용할 내용
  cautions                 text,  -- 사용할 때의 주의점

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.paper_analyses is
  '논문 분석 서식. 설계 문서 8.2절의 다섯 묶음 중 글로 적는 30개 항목.';
comment on column public.paper_analyses.source_id is
  '자료 하나에 분석은 하나. 관련 프로젝트는 source_projects가, 연결되는 다른 자료는 source_relations(14-D)가 맡는다.';


-- -----------------------------------------------------------------------------
-- 2. 길이 제약
-- -----------------------------------------------------------------------------
-- 분석은 길게 적는 일이라 넉넉히 둔다. 그래도 상한이 있는 이유는, 논문 본문을
-- 통째로 붙여넣는 것을 막기 위해서다. 그것은 분석이 아니라 사본이고,
-- 자료 자체는 이미 PDF로 붙어 있다.
--
-- 이름 목록은 src/lib/papers/analysis-fields.ts와 같아야 한다.
-- 어긋나면 tests/papers-analysis.test.mjs가 잡는다.
do $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'discovery_path', 'first_impression', 'reading_purpose', 'expected_relevance',
    'intended_audience', 'research_topic', 'research_purpose', 'research_questions',
    'key_concepts', 'theoretical_background',
    'study_type', 'research_method', 'participants', 'data_collection',
    'analysis_method', 'study_context',
    'main_argument', 'key_findings', 'discussion', 'significance',
    'implications', 'limitations', 'future_research',
    'my_interpretation', 'where_to_use', 'supports_claim', 'agreements_objections',
    'quote_candidates', 'paraphrase_candidates', 'cautions'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.paper_analyses'::regclass
        and conname = 'paper_analyses_' || v_column || '_length'
    ) then
      execute format(
        'alter table public.paper_analyses add constraint %I check (%I is null or char_length(%I) <= 5000)',
        'paper_analyses_' || v_column || '_length', v_column, v_column
      );
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. 소유자 고정과 참조 확인
-- -----------------------------------------------------------------------------
-- 소유자를 정하는 일과 참조 대상을 확인하는 일을 한 함수에 순서대로 둔다.
-- 트리거를 둘로 나누면 이름 순서대로 실행되어, 확인이 먼저 돌면서
-- 아직 정해지지 않은 owner_id를 검사하게 된다. captures에서 겪은 문제다.

create or replace function public.set_paper_analysis_owner()
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

  -- 붙이려는 자료가 정말 이 사람 것인지 확인한다.
  -- 외래키 제약은 RLS를 보지 않으므로, 이 확인이 없으면 자료 id만 알면
  -- 남의 자료에 분석을 붙일 수 있다.
  perform public.assert_source_owned(new.source_id, new.owner_id);

  return new;
end;
$$;

drop trigger if exists paper_analyses_set_owner on public.paper_analyses;
create trigger paper_analyses_set_owner
  before insert on public.paper_analyses
  for each row
  execute function public.set_paper_analysis_owner();


-- 만들어진 뒤에 바뀌지 않는 값들.
--
-- source_id를 못 바꾸게 하는 것이 핵심이다. 바꿀 수 있으면 A 논문을 읽고
-- 적은 분석이 B 자료에 붙는다. 서른 칸을 채운 글이 엉뚱한 논문의 것이 되고,
-- 그것을 알아챌 방법이 없다.
create or replace function public.guard_paper_analysis_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'paper_analyses.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'paper_analyses.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.source_id is distinct from old.source_id then
    raise exception 'paper_analyses.source_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'paper_analyses.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

drop trigger if exists paper_analyses_guard_immutable_columns
  on public.paper_analyses;
create trigger paper_analyses_guard_immutable_columns
  before update on public.paper_analyses
  for each row
  execute function public.guard_paper_analysis_immutable_columns();


-- -----------------------------------------------------------------------------
-- 4. 권한
-- -----------------------------------------------------------------------------
-- 기본 권한에 기대지 않는다. anon에는 아무것도 주지 않는다.

revoke all on table public.paper_analyses from anon, authenticated;

grant select, insert, update, delete
  on table public.paper_analyses to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- 소유자 확인과 승인 상태 확인을 함께 건다.
-- 소유자만 보면 정지된 계정이 자기 자료에 계속 접근한다.
--
-- 삭제 표시를 쓰지 않는다. 분석은 자료에 딸린 것이라 자료가 사라지면
-- 함께 사라진다. paper_profiles와 같다.

alter table public.paper_analyses enable row level security;

drop policy if exists paper_analyses_select_own on public.paper_analyses;
create policy paper_analyses_select_own
  on public.paper_analyses
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_analyses_insert_own on public.paper_analyses;
create policy paper_analyses_insert_own
  on public.paper_analyses
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );

drop policy if exists paper_analyses_update_own on public.paper_analyses;
create policy paper_analyses_update_own
  on public.paper_analyses
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

drop policy if exists paper_analyses_delete_own on public.paper_analyses;
create policy paper_analyses_delete_own
  on public.paper_analyses
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_user()
  );
