-- =============================================================================
-- AI 기능을 쓸 사람을 관리자가 고른다, 그리고 한 달 예산을 설정에 둔다
-- =============================================================================
-- 2026-10-06. 다른 사람에게 앱을 열기 전에 하는 일이다. (18단계 뒤)
--
-- 사용자가 정한 것
--   > 처음에 웹앱에 가입하면 AI 기능이 막혀있는채로 사용하도록 해주고
--   > (…) 관리자가 판단해서 이 사용자가 AI 기능을 사용해도 된다고 생각이
--   > 되면 관리자의 사용자 관리 메뉴에서 그 사용자가 AI 기능을 사용할 수
--   > 있도록 버튼으로 허용해주는 식이지.
--
-- 왜 이것이 돈을 막는 자리인가
--   `src/lib/ai/limits.ts`가 한 달 한도를 Anthropic 예산 USD 5에서 거꾸로
--   셈해 두었다. 그런데 그 한도는 **한 사람당**이다. 사람이 둘이면 앱이
--   허락하는 양이 예산의 두 배가 되고, **막는 자리가 안쪽이 아니라
--   바깥쪽이 된다.** 그 파일이 적어둔 말 그대로다.
--
--     앱의 한도가 그보다 크면 한도는 아무것도 막지 못하고, 어느 날 갑자기
--     기능이 통째로 안 되는 것으로 나타난다.
--
--   처음에는 관리자가 **예상 인원**을 적는 설정을 두려고 했다. 사용자가 더
--   나은 쪽을 짚었다. 허용을 단추로 주면 **앱이 허용받은 사람 수를 직접
--   셀 수 있다.** 손으로 적는 값이 없으니 실제와 어긋날 자리도 없다.
--
-- 왜 기본값이 거짓인가
--   **모르면 거부한다.** (AGENTS.md 5절 7번) 새로 가입한 사람은 관리자가
--   아직 판단하지 않은 사람이다. 켜 둔 채로 시작하면 가입한 날부터 예산을
--   쓰고, 관리자는 청구서가 올 때까지 모른다.
--
-- 왜 기존 관리자에게는 켜 주는가
--   기본값만 두면 **지금 있는 관리자도 함께 잠긴다.** 그러면 AI 기능을
--   확인할 사람이 아무도 없고, 켜 줄 사람도 없다. `guard_last_admin`이
--   "혼자뿐인 관리자가 스스로 잠기는 것"을 막는 것과 같은 생각이다.
--
--   **관리자가 아닌 기존 이용자는 켜지 않는다.** 사용자가 정한 것이
--   "관리자가 판단해서 허용"이고, 이미 있는 사람이라고 판단을 건너뛸
--   까닭이 없다.
--
-- 왜 예산을 설정에 두는가
--   코드에 박아 두면 바꿀 때마다 배포해야 한다. 그리고 Anthropic Console의
--   예산과 **두 곳을 함께 고쳐야 하는데 한쪽만 고치면 조용히 어긋난다.**
--   설정에 두면 관리자 화면에서 함께 보고 함께 고친다.
--
-- 재실행 안전성
--   칸은 `if not exists`, 설정 줄은 `on conflict do nothing`, 함수는
--   `create or replace`, 제약은 이름으로 떼었다 다시 붙인다. 감사 갈래
--   목록에 이미 있는 줄은 모두 옛 값이라 새 목록으로 다시 볼 때 걸리지
--   않는다. (`20260926110000`과 같은 자리다)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. profiles.ai_enabled
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists ai_enabled boolean not null default false;

comment on column public.profiles.ai_enabled is
  'AI 기능을 쓸 수 있는지. 관리자만 바꾼다. 기본값은 false이며, 새로 가입한 사람은 관리자가 허용할 때까지 AI 기능을 쓸 수 없다.';


-- -----------------------------------------------------------------------------
-- 2. 지금 있는 관리자에게는 켜 준다
-- -----------------------------------------------------------------------------
-- 이 구문은 이 마이그레이션에서 한 번만 돈다. 다음에 관리자가 되는 사람은
-- 여기가 아니라 관리자 화면에서 허용받는다. **관리자가 되는 것과 AI를 쓰는
-- 것은 다른 일이다.** 둘을 묶으면 "운영만 하고 AI는 안 쓰는 관리자"를 만들
-- 수 없다.

update public.profiles p
   set ai_enabled = true
 where p.ai_enabled = false
   and exists (
     select 1
       from public.user_roles r
      where r.user_id = p.id
        and r.role = 'admin'
   );


-- -----------------------------------------------------------------------------
-- 3. 자기 손으로 켤 수 없게 한다
-- -----------------------------------------------------------------------------
-- `guard_profile_protected_columns`의 보호 목록에 `ai_enabled`를 더한다.
--
-- **정책만으로는 모자라다.** profiles의 UPDATE 정책은 자기 줄을 고치는 것을
-- 허용한다(이름·언어·시간대를 스스로 바꾼다). 그 문으로 `ai_enabled`까지
-- 지나가면 **누구나 스스로 AI를 켠다.** 승인 상태를 트리거로 막아둔 것과
-- 똑같은 자리다.
--
-- 함수 전체를 다시 쓴다. 원본은 `20260920090000`에 있다.

create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_protected_changed boolean;
  v_privileged        boolean;
  v_now               timestamptz := pg_catalog.now();
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id는 변경할 수 없습니다.' using errcode = '42501';
  end if;

  v_protected_changed :=
       new.status            is distinct from old.status
    or new.status_reason     is distinct from old.status_reason
    or new.status_changed_by is distinct from old.status_changed_by
    or new.requested_at      is distinct from old.requested_at
    or new.approved_at       is distinct from old.approved_at
    or new.rejected_at       is distinct from old.rejected_at
    or new.suspended_at      is distinct from old.suspended_at
    or new.email             is distinct from old.email
    -- 2026-10-06. AI 허용은 관리자가 주는 것이다.
    or new.ai_enabled        is distinct from old.ai_enabled;

  if not v_protected_changed then
    return new;
  end if;

  v_privileged :=
       public.is_admin()
    or current_user::text in ('postgres', 'service_role', 'supabase_admin');

  if not v_privileged then
    raise exception
      '승인 상태와 계정 식별 정보, AI 허용은 관리자만 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  -- 관리자 또는 서비스 컨텍스트의 상태 변경이면 처리 이력을 자동으로 남긴다.
  if new.status is distinct from old.status then
    new.status_changed_by := auth.uid();

    if new.status = 'active'::public.user_status then
      new.approved_at := v_now;
    elsif new.status = 'rejected'::public.user_status then
      new.rejected_at := v_now;
    elsif new.status = 'suspended'::public.user_status then
      new.suspended_at := v_now;
    end if;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. 감사 기록이 'ai_access_changed'를 받게 한다
-- -----------------------------------------------------------------------------
-- **목록에 먼저 더한다.** 거부하면 그 트리거를 부른 UPDATE까지 통째로
-- 되돌아가고, 화면에는 "바꾸지 못했습니다"만 나온다. 2026-09-26에 허용량
-- 더하기가 바로 그래서 안 됐고 **쓰는 사람이 먼저 찾았다.**
-- (`20260926110000`)

alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_action_check;

alter table public.admin_audit_logs
  add constraint admin_audit_logs_action_check check (
    action in (
      'user_status_changed',
      'user_role_granted',
      'user_role_revoked',
      'app_setting_updated',
      -- 19-E. 관리자가 AI 한도에 허용량을 더한 일.
      'ai_usage_granted',
      -- 2026-10-06. 관리자가 AI 기능 허용을 켜거나 끈 일.
      'ai_access_changed'
    )
  );


-- -----------------------------------------------------------------------------
-- 5. 켜고 끈 일을 남긴다
-- -----------------------------------------------------------------------------
-- **SECURITY DEFINER여야 한다.** authenticated 역할에는 admin_audit_logs
-- INSERT 권한이 없다. 다른 감사 트리거와 같은 까닭이다. 001의 허용 목록에
-- 이 이름을 더했다.
--
-- 왜 켠 것과 끈 것을 모두 남기는가
--   끈 것만 남기면 "언제부터 쓸 수 있었나"를 알 수 없고, 켠 것만 남기면
--   지금 왜 못 쓰는지를 알 수 없다. **돈이 드는 기능의 문을 여닫은
--   기록이라 양쪽이 다 있어야 한다.**

create or replace function public.audit_profile_ai_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_enabled is distinct from old.ai_enabled then
    insert into public.admin_audit_logs (
      actor_id, action, target_user_id, previous_value, new_value
    )
    values (
      auth.uid(),
      'ai_access_changed',
      new.id,
      pg_catalog.jsonb_build_object('ai_enabled', old.ai_enabled),
      pg_catalog.jsonb_build_object('ai_enabled', new.ai_enabled)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists profiles_audit_ai_access_change on public.profiles;
create trigger profiles_audit_ai_access_change
  after update on public.profiles
  for each row
  execute function public.audit_profile_ai_access_change();


-- -----------------------------------------------------------------------------
-- 6. 한 달 AI 예산
-- -----------------------------------------------------------------------------
-- 값의 모양까지 검사한다. `require_user_approval`을 boolean으로 못 박아둔
-- 것과 같은 자리다. **글자가 들어오면 셈하는 쪽에서 조용히 틀린다.**
--
-- 위쪽 한도를 둔 까닭
--   오타 하나로 `500`이 들어가면 막는 자리가 사라진다. Anthropic Console의
--   예산이 바깥에서 막아 주지만, **그때는 기능이 통째로 멈추는 모양으로
--   나타난다.** 안쪽에서 먼저 걸려야 한다.

alter table public.app_settings
  drop constraint if exists app_settings_ai_monthly_budget_usd_is_number;

alter table public.app_settings
  add constraint app_settings_ai_monthly_budget_usd_is_number check (
    key <> 'ai_monthly_budget_usd'
    or (
      pg_catalog.jsonb_typeof(value) = 'number'
      and (value #>> '{}')::numeric > 0
      and (value #>> '{}')::numeric <= 100
    )
  );

insert into public.app_settings (key, value, description)
values (
  'ai_monthly_budget_usd',
  '5'::jsonb,
  'AI 기능에 한 달에 쓸 돈(USD). Anthropic Console의 예산 상한과 같은 값으로 둔다. 한 사람 몫은 이 값을 AI 허용받은 사람 수로 나눠 정한다.'
)
on conflict (key) do nothing;
