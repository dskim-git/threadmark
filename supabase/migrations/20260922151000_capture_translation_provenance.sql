-- =============================================================================
-- 번역 출처 기록 (13-C)
-- =============================================================================
-- 설계 문서 9.4절: 번역 공급자, 모델, 언어, 생성 시각을 기록한다.
--
-- 6.2절의 공통 필드 목록에는 translation_provider까지만 있고 모델과 생성 시각을
-- 담을 자리가 없다. 9.4절이 요구하는 것을 6.2절이 받지 못하는 상태여서
-- 여기서 두 칸을 더한다. 설계 문서 6.2절에도 같이 적었다.
--
-- 왜 공급자와 모델을 나누는가
--   같은 공급자라도 모델이 바뀌면 결과가 달라진다. 한 칸에 몰아 적으면
--   나중에 "어느 모델이 만든 번역인가"로 찾아볼 수 없다.
--
-- 왜 생성 시각을 따로 두는가
--   created_at은 기록을 만든 시각, updated_at은 마지막으로 손댄 시각이다.
--   번역문을 나중에 고치면 updated_at이 움직여 번역이 언제 만들어졌는지
--   알 수 없게 된다.
--
-- AI 원본을 따로 보관하지는 않는다
--   9.4절이 요구하는 것은 "구분할 수 있게" 하는 것이고 그 구분은
--   verification_status가 맡는다. 원문을 두 벌 들고 있으면 어느 쪽이 지금
--   쓰는 번역인지를 화면과 검색이 매번 다시 정해야 한다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 칸 추가
-- -----------------------------------------------------------------------------
alter table public.captures
  add column if not exists translation_model text;

alter table public.captures
  add column if not exists translated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.captures'::regclass
      and conname = 'captures_translation_model_length'
  ) then
    alter table public.captures
      add constraint captures_translation_model_length
      check (translation_model is null or char_length(translation_model) <= 100);
  end if;

  -- 번역문은 없는데 무엇이 언제 만들었다는 흔적만 남아 있을 수는 없다.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.captures'::regclass
      and conname = 'captures_translation_trace_needs_text'
  ) then
    alter table public.captures
      add constraint captures_translation_trace_needs_text
      check (
        translated_text is not null
        or (translation_model is null and translated_at is null)
      );
  end if;
end
$$;

comment on column public.captures.translation_model is
  '번역을 만든 모델 이름. 공급자는 translation_provider에 둔다. (설계 문서 9.4절)';

comment on column public.captures.translated_at is
  '번역이 만들어진 시각. 나중에 번역문을 고쳐도 이 값은 움직이지 않는다.';


-- -----------------------------------------------------------------------------
-- 2. 번역 흔적 보호
-- -----------------------------------------------------------------------------
-- 이미 달려 있는 BEFORE UPDATE 트리거 함수를 바꿔 단다. 트리거를 하나 더
-- 만들지 않는 이유는, 같은 시점의 트리거가 이름 순서대로 실행되기 때문이다.
-- 순서에 기대는 판단을 두 함수로 나누면 나중에 이름 하나로 동작이 달라진다.
--
-- RLS는 "이 행이 내 것인가"만 본다. 내 행 안에서 어떤 칸을 어떻게 바꿀 수
-- 있는지는 막지 못한다. 그리고 WITH CHECK는 이전 값(OLD)을 볼 수 없다.
-- "바뀌었는가"를 판단하려면 BEFORE 트리거여야 한다.
--
-- 여기서 막는 것
--   1. 번역을 만든 공급자·모델·시각을 나중에 바꾸는 것.
--      바꿀 수 있으면 "이 번역은 무엇이 만들었는가"가 기록이 아니라 주장이 된다.
--   2. 확인 상태를 '기계가 만든 그대로'로 되돌리는 것.
--   3. 기계가 만들었다는 표시를 지우는 것.
--
-- 여기서 대신 해주는 것
--   기계 번역문을 고치면 확인 상태를 user_edited로 옮긴다.
--   화면이 같이 보내주기를 기대하지 않는다. 보내주기를 잊으면 고쳐놓고도
--   '기계가 만든 그대로'로 남아, 9.4절의 구분이 이름뿐이 된다.
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

  new.updated_at := pg_catalog.now();

  if new.source_id is distinct from old.source_id then
    perform public.assert_capture_source_owned(new.source_id, new.owner_id);
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
