-- =============================================================================
-- 중요 표시 (별) — 자료와 기록
-- =============================================================================
-- 설계 문서 5.2절(Source 공통 필드)과 6.2절(Capture 공통 필드)에 이 칸이
-- 없었다. 사용자가 요청해서 더한 것이며, 왜 더했는지는 같은 두 절에
-- 5.2-1과 6.2-1로 적었다.
--
-- 왜 필요한가
--   15-A에서 글자로 찾는 길을 만들었다. 그러나 검색은 **무엇을 찾는지 알 때**
--   쓰는 길이다. "그때 그거 중요했는데"는 낱말이 기억나지 않는다.
--   읽는 순간에 붙여둔 표시만이 그 물음에 답한다.
--
--   자료와 기록 **둘 다** 단다. 중요한 논문과 중요한 문장은 다른 것이고,
--   한쪽만 있으면 나머지 한쪽은 표시할 자리가 없다.
--
-- 왜 열거형이나 별도 표가 아니라 boolean 한 칸인가
--   별은 달려 있거나 없거나 둘 뿐이다. 등급(별 다섯 개)은 달 때마다
--   "이건 넷인가 셋인가"를 생각하게 만들고, 그 생각의 값이 나중에
--   쓰이지 않는다. 태그(15-B)가 "무엇에 대한 것인가"를 맡고,
--   별은 "다시 볼 것인가" 하나만 맡는다.
--
--   별도 표에 담으면 목록을 읽을 때마다 조인이 하나 늘고, 자료를 지울 때
--   따라 지워야 할 것이 하나 늘어난다. 값 하나에 표 하나는 비싸다.
--
-- 왜 별 표시가 updated_at을 건드리지 않는가
--   별은 **자료의 내용이 아니라 내 주의에 대한 표시**다. 논문의 제목이나
--   기록의 문장은 하나도 바뀌지 않는다. 그런데 두 표의 BEFORE UPDATE 가드가
--   모든 갱신에서 updated_at을 지금으로 밀어버린다.
--
--   그대로 두면 `최근에 손댄 순`(sorting.ts)이 망가진다. 중요한 논문 스무
--   편에 별을 달고 나면 그 스무 편이 목록 맨 위로 올라오고, 실제로 무엇을
--   마지막에 고쳤는지는 영영 알 수 없게 된다. 되돌릴 수 없는 손실이다.
--
--   그래서 별만 달라졌을 때는 updated_at을 그대로 둔다. 다른 값이 함께
--   바뀌었다면 보통의 갱신이므로 지금으로 민다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 칸
-- -----------------------------------------------------------------------------

alter table public.sources
  add column if not exists starred boolean not null default false;

alter table public.captures
  add column if not exists starred boolean not null default false;

comment on column public.sources.starred is
  '중요 표시(별). 다시 볼 자료인지 하나만 담는다. 달아도 updated_at은 움직이지 않는다.';
comment on column public.captures.starred is
  '중요 표시(별). 다시 볼 기록인지 하나만 담는다. 달아도 updated_at은 움직이지 않는다.';


-- -----------------------------------------------------------------------------
-- 2. 인덱스
-- -----------------------------------------------------------------------------
-- 별을 단 것은 전체의 일부다. 부분 인덱스로 그 일부만 담는다.
-- 조건을 `starred`로 두면 별을 떼는 순간 인덱스에서도 빠진다.

create index if not exists sources_owner_starred_created_idx
  on public.sources (owner_id, created_at desc)
  where starred and deleted_at is null;

create index if not exists captures_owner_starred_created_idx
  on public.captures (owner_id, created_at desc)
  where starred and deleted_at is null;


-- -----------------------------------------------------------------------------
-- 3. 별만 달라진 갱신은 updated_at을 건드리지 않는다
-- -----------------------------------------------------------------------------
-- 두 표의 BEFORE UPDATE 가드 함수를 고쳐 쓴다. 새 트리거를 더하지 않는다.
-- 같은 시점의 트리거가 둘이면 이름 순서대로 실행되어, 순서에 기대는 규칙이
-- 생겼을 때 찾기 어려운 문제가 된다. (AGENTS.md 6절)
--
-- "별만 달라졌는가"를 판정하는 방법
--   행 전체를 jsonb로 바꿔놓고 starred와 updated_at을 뺀 나머지를 견준다.
--   나머지가 같으면 이번 갱신이 손댄 것은 별뿐이다.
--
--   열 이름을 하나하나 적어 견주는 방법도 있지만, 그러면 나중에 칸을 더할
--   때마다 이 목록에도 더해야 한다. 빠뜨리면 그 칸을 고쳐도 updated_at이
--   움직이지 않는, 찾기 어려운 문제가 된다. 이 방법은 빠뜨릴 목록이 없다.

create or replace function public.starred_only_change(
  old_row jsonb,
  new_row jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (new_row -> 'starred') is distinct from (old_row -> 'starred')
    and (new_row - 'starred' - 'updated_at')
        = (old_row - 'starred' - 'updated_at');
$$;

comment on function public.starred_only_change(jsonb, jsonb) is
  '이번 갱신이 별 표시만 바꾸었는지. 맞으면 updated_at을 움직이지 않는다.';

-- 이 함수의 실행 권한은 기본값(public)으로 둔다.
--   보통은 권한을 전부 적어 두지만(AGENTS.md 6절), 그 규칙은 자료에 닿는
--   것들을 위한 것이다. 이 함수는 넘겨받은 jsonb 둘을 견주기만 하고 표를
--   읽지도 쓰지도 않는다. 막아서 지켜지는 것이 없고, 막으면 가드 트리거가
--   도는 역할이 하나라도 빠졌을 때 갱신 전체가 막힌다.


-- sources: 20260923211000의 정의에 별 규칙만 더한다.
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

  -- 별만 달라졌으면 손댄 시각을 그대로 둔다. (이 파일 머리말)
  if public.starred_only_change(
    pg_catalog.to_jsonb(old),
    pg_catalog.to_jsonb(new)
  ) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

comment on function public.guard_source_immutable_columns() is
  'sources의 불변 열을 지키고, 상태 전환을 읽을 후보에서 정식 자료로만 허용한다. 별만 바뀐 갱신은 updated_at을 움직이지 않는다.';


-- captures: 20260922151000의 정의에 별 규칙만 더한다.
--
-- 그 파일의 본문을 그대로 옮겨 온다. `create or replace`는 함수를 통째로
-- 갈아끼우므로, 번역 출처를 지키는 규칙들을 여기 함께 적지 않으면 말없이
-- 사라진다. 9.4절이 기대하는 보장이 그때부터 없어진다.
--
-- 옮겨 오면서 하나 고쳤다
--   그 파일은 `assert_capture_source_owned`를 부르는데, 그 함수는
--   20260921120000에서 `assert_source_owned`로 이름이 바뀌며 지워졌다.
--   plpgsql은 함수 이름을 부를 때에야 찾으므로, 만들 때도 고칠 때도
--   아무 문제가 없다가 **기록을 다른 자료로 옮기는 순간에만** 터진다.
--   지금 화면은 기록의 연결 자료를 바꾸지 않아서 드러나지 않았을 뿐이다.
--   지금 있는 이름으로 고친다.
create or replace function public.guard_capture_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'captures.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'captures.owner_id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'captures.created_at은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  -- 별만 달라졌으면 손댄 시각을 그대로 둔다. (이 파일 머리말)
  if public.starred_only_change(
    pg_catalog.to_jsonb(old),
    pg_catalog.to_jsonb(new)
  ) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := pg_catalog.now();
  end if;

  if new.source_id is distinct from old.source_id then
    perform public.assert_source_owned(new.source_id, new.owner_id);
  end if;

  if new.translated_text is null then
    -- 번역문을 지우면 흔적도 함께 지운다.
    -- 남겨두면 "번역문 없는 번역 기록"이 되어 제약조건에도 걸린다.
    new.translation_provider := null;
    new.translation_model    := null;
    new.translated_at        := null;
  else
    if old.translated_at is not null
       and new.translated_at is distinct from old.translated_at then
      raise exception 'captures.translated_at은 변경할 수 없습니다.'
        using errcode = '42501';
    end if;

    if old.translation_provider is not null
       and new.translation_provider is distinct from old.translation_provider then
      raise exception 'captures.translation_provider는 변경할 수 없습니다.'
        using errcode = '42501';
    end if;

    if old.translation_model is not null
       and new.translation_model is distinct from old.translation_model then
      raise exception 'captures.translation_model은 변경할 수 없습니다.'
        using errcode = '42501';
    end if;
  end if;

  -- 기계가 만든 번역을 손보면 '사람이 손봤다'로 옮긴다.
  if old.verification_status = 'machine_generated'::public.capture_verification_status
     and new.translated_text is not null
     and new.translated_text is distinct from old.translated_text then
    new.verification_status := 'user_edited'::public.capture_verification_status;
  end if;

  -- 확인 상태를 되돌리는 길은 막는다. 사람이 확인한 글을 '기계가 만든 그대로'로
  -- 되돌릴 이유가 없고, 되돌릴 수 있으면 이 값으로 아무것도 판단할 수 없다.
  if new.verification_status = 'machine_generated'::public.capture_verification_status
     and old.verification_status
         is distinct from 'machine_generated'::public.capture_verification_status then
    raise exception
      'captures.verification_status를 machine_generated로 되돌릴 수 없습니다.'
      using errcode = '42501';
  end if;

  -- 기계에서 나온 글이라는 사실은 지워지지 않는다.
  -- 사람이 전부 고쳐 썼더라도 출발점이 기계였다는 것은 그대로다.
  if old.ai_generated and not new.ai_generated then
    raise exception 'captures.ai_generated는 해제할 수 없습니다.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_capture_immutable_columns() is
  'captures의 불변 열과 번역 출처를 지키고 연결 대상이 내 자료인지 확인한다. 별만 바뀐 갱신은 updated_at을 움직이지 않는다.';
