-- =============================================================================
-- RLS 격리 및 권한 통제 테스트
-- =============================================================================
-- 블루프린트 20절: RLS 테스트는 최소 두 명의 사용자와 anonymous role을 대상으로 한다.
-- 개인정보 처리방침 15절: 승인 모드와 자동 승인 모드 모두에 대한 권한·RLS 테스트.
--
-- 사용법
--   Supabase 대시보드 SQL Editor에 이 파일 전체를 붙여넣고 실행한다.
--   모두 통과하면 마지막에 "모든 RLS 검사를 통과했습니다"가 표시된다.
--   하나라도 실패하면 그 지점에서 멈추고 어떤 검사가 왜 실패했는지 알려준다.
--
-- 안전성
--   실제 사용자 역할로 전환해 차단되어야 할 동작을 시도한다.
--   각 검사는 DO 블록 안에서 실행되며, 차단되지 않고 통과해 버린 변경은
--   블록이 예외를 일으키면서 함께 되돌려진다. 데이터는 남지 않는다.
--   조회만 하는 검사는 애초에 아무것도 바꾸지 않는다.
--
-- 전제
--   관리자 1명과 관리자가 아닌 사용자가 최소 1명 있어야 한다.
--   사용자 ID는 이메일이 아니라 user_roles를 기준으로 찾는다.
--
-- 주의
--   Supabase SQL Editor는 스크립트 전체를 한 트랜잭션으로 실행한다.
--   그래서 set_config(..., true)로 설정한 request.jwt.claims가 다음 DO 블록까지
--   살아남는다. 자료를 만드는 검사는 삽입 전에 클레임을 비워, 트리거가
--   owner_id를 엉뚱한 사용자로 덮어쓰지 않게 한다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 전제 확인
-- -----------------------------------------------------------------------------
do $$
declare
  v_admins    integer;
  v_nonadmins integer;
begin
  select count(*) into v_admins
  from public.user_roles where role = 'admin'::public.app_role;

  select count(*) into v_nonadmins
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  );

  if v_admins < 1 then
    raise exception '전제 실패: 관리자가 없습니다. 먼저 부트스트랩을 수행하세요.';
  end if;

  if v_nonadmins < 1 then
    raise exception '전제 실패: 관리자가 아닌 사용자가 필요합니다. 두 번째 계정으로 로그인하세요.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 1. 사용자 격리: 일반 사용자는 자기 프로필만 본다
-- -----------------------------------------------------------------------------
-- 블루프린트 25절 1번: 사용자 A가 사용자 B의 자료를 읽을 수 없다.
do $$
declare
  v_user  uuid;
  v_total integer;
  v_seen  integer;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  select count(*) into v_total from public.profiles;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.profiles;

  reset role;

  if v_seen <> 1 then
    raise exception
      '검사 1 실패: 일반 사용자에게 프로필 %건이 보였습니다. 1건이어야 합니다. (전체 %건)',
      v_seen, v_total;
  end if;

  if v_total < 2 then
    raise warning
      '검사 1 주의: 전체 사용자가 %건뿐이라 격리가 충분히 검증되지 않았습니다.', v_total;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 관리자는 전체 프로필을 본다
-- -----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_total integer;
  v_seen  integer;
begin
  select user_id into v_admin
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select count(*) into v_total from public.profiles;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.profiles;

  reset role;

  if v_seen <> v_total then
    raise exception
      '검사 2 실패: 관리자에게 %건만 보였습니다. 전체 %건이 보여야 합니다.',
      v_seen, v_total;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. 일반 사용자는 자기 승인 상태를 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- RLS만으로는 막히지 않는 지점이다. WITH CHECK 식은 이전 행을 참조할 수 없어
-- "본인 행 수정"과 "본인 상태 변경"을 구분하지 못한다.
-- guard_profile_protected_columns 트리거가 실제로 막는지 확인한다.
do $$
declare
  v_user    uuid;
  v_current public.user_status;
  v_target  public.user_status;
  v_blocked boolean := false;
begin
  select p.id, p.status into v_user, v_current
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  -- 지금 상태와 다른 값을 골라야 한다.
  -- 가드 트리거는 값이 실제로 바뀔 때만 개입하므로, 같은 값으로 갱신하면
  -- 막히지 않는 것이 정상이다. 그 경우를 실패로 읽으면 검사가 데이터 상태에
  -- 따라 결과가 달라진다.
  v_target := case
    when v_current = 'active'::public.user_status
      then 'suspended'::public.user_status
    else 'active'::public.user_status
  end;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.profiles set status = v_target where id = v_user;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked then
    -- 막히지 않았다. 아래 예외가 이 블록의 변경을 함께 되돌린다.
    raise exception
      '검사 3 실패: 일반 사용자가 자기 승인 상태를 %에서 %로 바꿀 수 있었습니다.',
      v_current, v_target;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. 일반 사용자는 자기 이메일을 바꿀 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_user    uuid;
  v_blocked boolean := false;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.profiles set email = 'changed@example.com' where id = v_user;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked then
    raise exception '검사 4 실패: 일반 사용자가 프로필 이메일을 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 5. 일반 사용자는 다른 사용자의 상태를 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- 이 경우 RLS의 USING 식이 대상 행을 걸러내므로 오류 없이 0행이 영향받는다.
-- 오류가 나지 않는다고 통과시키면 안 되고, 바뀐 행이 없는지를 봐야 한다.
do $$
declare
  v_user    uuid;
  v_other   uuid;
  v_changed integer := 0;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  select user_id into v_other
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.profiles
    set status = 'suspended'::public.user_status
    where id = v_other;
    get diagnostics v_changed = row_count;
  exception when others then
    v_changed := 0;
  end;

  reset role;

  if v_changed <> 0 then
    raise exception
      '검사 5 실패: 일반 사용자가 다른 사용자의 상태를 %건 변경했습니다.', v_changed;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 6. 일반 사용자는 스스로에게 관리자 역할을 줄 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_user    uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.user_roles (user_id, role)
    values (v_user, 'admin'::public.app_role);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 6 실패: 일반 사용자가 스스로에게 관리자 역할을 부여할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 7. 일반 사용자는 운영 설정을 읽을 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_seen integer;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.app_settings;

  reset role;

  if v_seen <> 0 then
    raise exception '검사 7 실패: 일반 사용자에게 운영 설정 %건이 보였습니다.', v_seen;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 8. 일반 사용자는 운영 설정을 바꿀 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_user    uuid;
  v_changed integer := 0;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.app_settings
    set value = 'false'::jsonb
    where key = 'require_user_approval';
    get diagnostics v_changed = row_count;
  exception when others then
    v_changed := 0;
  end;

  reset role;

  if v_changed <> 0 then
    raise exception '검사 8 실패: 일반 사용자가 운영 설정을 변경했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 9. 일반 사용자는 감사 로그를 읽을 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_seen integer;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.admin_audit_logs;

  reset role;

  if v_seen <> 0 then
    raise exception '검사 9 실패: 일반 사용자에게 감사 로그 %건이 보였습니다.', v_seen;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 10. 일반 사용자는 감사 로그를 지울 수 없다
-- -----------------------------------------------------------------------------
-- 감사 로그는 append-only여야 한다. 권한 자체가 없으므로 오류가 나야 한다.
do $$
declare
  v_user    uuid;
  v_blocked boolean := false;
  v_deleted integer := 0;
begin
  select p.id into v_user
  from public.profiles p
  where not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role = 'admin'::public.app_role
  )
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  begin
    delete from public.admin_audit_logs;
    get diagnostics v_deleted = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked or v_deleted > 0 then
    raise exception '검사 10 실패: 일반 사용자가 감사 로그를 삭제할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 11. 관리자도 감사 로그를 지울 수 없다
-- -----------------------------------------------------------------------------
-- 관리자에게도 삭제 권한을 주지 않았다. 기록을 남기는 쪽이 지우는 쪽보다 우선이다.
do $$
declare
  v_admin   uuid;
  v_blocked boolean := false;
  v_deleted integer := 0;
begin
  select user_id into v_admin
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  begin
    delete from public.admin_audit_logs;
    get diagnostics v_deleted = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked or v_deleted > 0 then
    raise exception '검사 11 실패: 관리자가 감사 로그를 삭제할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 12. 비로그인(anon)은 어떤 테이블도 읽을 수 없다
-- -----------------------------------------------------------------------------
-- anon에는 테이블 권한 자체를 부여하지 않았으므로 RLS 이전에 막혀야 한다.
do $$
declare
  v_table   text;
  v_blocked boolean;
begin
  foreach v_table in array array[
    'profiles', 'user_roles', 'app_settings', 'admin_audit_logs'
  ]
  loop
    v_blocked := false;

    set local role anon;

    begin
      execute format('select 1 from public.%I limit 1', v_table);
    exception when others then
      v_blocked := true;
    end;

    reset role;

    if not v_blocked then
      raise exception '검사 12 실패: 비로그인 사용자가 %를 읽을 수 있었습니다.', v_table;
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 13. 관리자는 감사 로그를 읽을 수 있다
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. 열려야 할 곳도 확인한다.
do $$
declare
  v_admin uuid;
  v_seen  integer;
begin
  select user_id into v_admin
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.admin_audit_logs;

  reset role;

  if v_seen = 0 then
    raise exception
      '검사 13 실패: 관리자가 감사 로그를 읽지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 14. 관리자는 운영 설정을 읽을 수 있다
-- -----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_seen  integer;
begin
  select user_id into v_admin
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.app_settings;

  reset role;

  if v_seen = 0 then
    raise exception '검사 14 실패: 관리자가 운영 설정을 읽지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 15. 다른 사용자의 자료를 읽을 수 없다
-- -----------------------------------------------------------------------------
-- 블루프린트 25절 1번: 사용자 A가 사용자 B의 Source를 읽거나 수정할 수 없다.
-- 임시 자료를 만들어 확인하고, 판정하기 전에 지운다.
do $$
declare
  v_owner  uuid;
  v_other  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p
  where p.id <> v_owner
  limit 1;

  if v_other is null then
    raise exception '검사 15 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- auth.uid()가 없는 컨텍스트이므로 트리거가 owner_id를 덮어쓰지 않는다.
  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 15 실패: 다른 사용자의 자료가 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 16. 다른 사용자의 자료를 수정하거나 지울 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_changed integer := 0;
  v_deleted integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.sources set title = '가로챈 제목' where id = v_source;
    get diagnostics v_changed = row_count;
  exception when others then
    v_changed := 0;
  end;

  begin
    delete from public.sources where id = v_source;
    get diagnostics v_deleted = row_count;
  exception when others then
    v_deleted := 0;
  end;

  reset role;

  delete from public.sources where id = v_source;

  if v_changed <> 0 then
    raise exception '검사 16 실패: 다른 사용자가 자료를 수정했습니다.';
  end if;

  if v_deleted <> 0 then
    raise exception '검사 16 실패: 다른 사용자가 자료를 삭제했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 17. 소유자는 자기 자료를 읽을 수 있다
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if v_seen <> 1 then
    raise exception
      '검사 17 실패: 소유자가 자기 자료를 읽지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 18. 삭제 표시된 자료는 조회에서 제외된다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title, deleted_at)
  values (
    v_owner,
    'note'::public.source_type,
    'RLS 격리 검사용 임시 자료',
    pg_catalog.now()
  )
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 18 실패: 삭제 표시된 자료가 조회에 섞였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 19. 승인되지 않은 계정은 자기 자료도 볼 수 없다
-- -----------------------------------------------------------------------------
-- 소유자 확인만으로는 부족하다는 것을 확인하는 검사다.
-- 승인 상태가 active가 아닌 계정이 있을 때만 실행된다.
-- 없으면 건너뛰며, 마지막 요약에 실행 여부가 표시된다.
do $$
declare
  v_user   uuid;
  v_source uuid;
  v_seen   integer;
begin
  select p.id into v_user
  from public.profiles p
  where p.status <> 'active'::public.user_status
  limit 1;

  if v_user is null then
    perform set_config('threadmark.check19', '건너뜀 (비활성 계정 없음)', false);
    return;
  end if;

  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_user, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception
      '검사 19 실패: 승인되지 않은 계정이 자기 자료를 볼 수 있었습니다.';
  end if;

  perform set_config('threadmark.check19', '실행됨', false);
end
$$;


-- -----------------------------------------------------------------------------
-- 20. 남의 자료를 내 것으로 가져올 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_changed integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  -- 앞선 검사에서 설정한 클레임이 남아 있으면 auth.uid()가 그 사용자를 가리키고,
  -- set_source_owner 트리거가 owner_id를 덮어써 버린다. 먼저 비운다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.sources set owner_id = v_other where id = v_source;
    get diagnostics v_changed = row_count;
  exception when others then
    v_changed := 0;
  end;

  reset role;

  delete from public.sources where id = v_source;

  if v_changed <> 0 then
    raise exception '검사 20 실패: 다른 사용자가 자료의 소유자를 바꿨습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 21. 다른 사용자의 기록을 읽을 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_capture uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.captures (owner_id, capture_type, content)
  values (v_owner, 'note'::public.capture_type, 'RLS 격리 검사용 임시 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.captures where id = v_capture;

  reset role;

  delete from public.captures where id = v_capture;

  if v_seen <> 0 then
    raise exception '검사 21 실패: 다른 사용자의 기록이 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 22. 다른 사용자의 기록을 수정하거나 지울 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_capture uuid;
  v_changed integer := 0;
  v_deleted integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.captures (owner_id, capture_type, content)
  values (v_owner, 'note'::public.capture_type, 'RLS 격리 검사용 임시 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.captures set content = '가로챈 내용' where id = v_capture;
    get diagnostics v_changed = row_count;
  exception when others then
    v_changed := 0;
  end;

  begin
    delete from public.captures where id = v_capture;
    get diagnostics v_deleted = row_count;
  exception when others then
    v_deleted := 0;
  end;

  reset role;

  delete from public.captures where id = v_capture;

  if v_changed <> 0 then
    raise exception '검사 22 실패: 다른 사용자가 기록을 수정했습니다.';
  end if;

  if v_deleted <> 0 then
    raise exception '검사 22 실패: 다른 사용자가 기록을 삭제했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 23. 다른 사용자의 자료에 기록을 붙일 수 없다
-- -----------------------------------------------------------------------------
-- Capture에만 있는 위험이다. 외래키 제약은 RLS를 보지 않으므로,
-- source_id 값만 알면 남의 자료에 기록을 연결할 수 있다.
-- check_capture_source_owner 트리거가 실제로 막는지 확인한다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 소유자의 자료를 하나 만든다.
  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  -- 다른 사용자가 그 자료에 기록을 붙이려 한다.
  begin
    insert into public.captures (source_id, capture_type, content)
    values (v_source, 'note'::public.capture_type, '남의 자료에 붙인 기록');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.captures where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 23 실패: 다른 사용자의 자료에 기록을 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 24. 소유자는 자기 자료에 기록을 붙이고 읽을 수 있다
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.captures (source_id, capture_type, content)
  values (v_source, 'note'::public.capture_type, '내 자료에 붙인 기록');

  select count(*) into v_seen
  from public.captures where source_id = v_source;

  reset role;

  delete from public.captures where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 1 then
    raise exception
      '검사 24 실패: 소유자가 자기 기록을 읽지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 25. 원문 없는 인용은 저장되지 않는다
-- -----------------------------------------------------------------------------
-- 설계 문서 2.4절의 구분이 데이터 구조로 강제되는지 확인한다.
-- 화면과 검증 스키마가 막더라도, 마지막으로 남는 보장은 제약조건이다.
do $$
declare
  v_owner   uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  begin
    insert into public.captures (owner_id, capture_type, content)
    values (v_owner, 'quote'::public.capture_type, '원문 없이 인용이라고 주장');
  exception when others then
    v_blocked := true;
  end;

  if not v_blocked then
    delete from public.captures
    where owner_id = v_owner and content = '원문 없이 인용이라고 주장';

    raise exception '검사 25 실패: 원문 없는 인용이 저장되었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 26. 번역은 원문, 번역문, 언어가 모두 있어야 저장된다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  begin
    insert into public.captures (
      owner_id, capture_type, translated_text
    )
    values (
      v_owner,
      'translation'::public.capture_type,
      '원문 없이 옮긴 글만 저장'
    );
  exception when others then
    v_blocked := true;
  end;

  if not v_blocked then
    delete from public.captures
    where owner_id = v_owner and translated_text = '원문 없이 옮긴 글만 저장';

    raise exception '검사 26 실패: 원문 없는 번역이 저장되었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 27. 승인되지 않은 계정은 자기 기록도 볼 수 없다
-- -----------------------------------------------------------------------------
-- 승인 상태가 active가 아닌 계정이 있을 때만 실행된다.
do $$
declare
  v_user    uuid;
  v_capture uuid;
  v_seen    integer;
begin
  select p.id into v_user
  from public.profiles p
  where p.status <> 'active'::public.user_status
  limit 1;

  if v_user is null then
    perform set_config('threadmark.check27', '건너뜀 (비활성 계정 없음)', false);
    return;
  end if;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.captures (owner_id, capture_type, content)
  values (v_user, 'note'::public.capture_type, 'RLS 격리 검사용 임시 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.captures where id = v_capture;

  reset role;

  delete from public.captures where id = v_capture;

  if v_seen <> 0 then
    raise exception
      '검사 27 실패: 승인되지 않은 계정이 자기 기록을 볼 수 있었습니다.';
  end if;

  perform set_config('threadmark.check27', '실행됨', false);
end
$$;


-- -----------------------------------------------------------------------------
-- 28. 다른 사용자의 프로젝트를 읽을 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen from public.projects where id = v_project;

  reset role;

  delete from public.projects where id = v_project;

  if v_seen <> 0 then
    raise exception '검사 28 실패: 다른 사용자의 프로젝트가 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 29. 다른 사용자의 프로젝트에 내 자료를 연결할 수 없다
-- -----------------------------------------------------------------------------
-- 연결 테이블의 위험 하나다. 프로젝트 쪽만 남의 것이어도 막혀야 한다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 소유자의 프로젝트와, 다른 사용자의 자료를 만든다.
  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_other, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  -- 다른 사용자가 자기 자료를 남의 프로젝트에 밀어넣으려 한다.
  begin
    insert into public.source_projects (project_id, source_id)
    values (v_project, v_source);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_projects where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 29 실패: 다른 사용자의 프로젝트에 자료를 연결할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 30. 내 프로젝트에 다른 사용자의 자료를 연결할 수 없다
-- -----------------------------------------------------------------------------
-- 연결 테이블의 반대쪽 위험이다. 자료 쪽만 남의 것이어도 막혀야 한다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 다른 사용자의 프로젝트와, 소유자의 자료를 만든다.
  insert into public.projects (owner_id, name)
  values (v_other, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  -- 프로젝트 주인이 남의 자료를 자기 프로젝트에 끌어오려 한다.
  begin
    insert into public.source_projects (project_id, source_id)
    values (v_project, v_source);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_projects where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 30 실패: 내 프로젝트에 다른 사용자의 자료를 연결할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 31. 기록 연결도 양쪽을 확인한다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_capture uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.captures (owner_id, capture_type, content)
  values (v_other, 'note'::public.capture_type, 'RLS 격리 검사용 임시 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.capture_projects (project_id, capture_id)
    values (v_project, v_capture);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.capture_projects where project_id = v_project;
  delete from public.captures where id = v_capture;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 31 실패: 다른 사용자의 프로젝트에 기록을 연결할 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 32. 소유자는 자기 자료를 자기 프로젝트에 연결할 수 있다
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_source  uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.source_projects (project_id, source_id)
  values (v_project, v_source);

  select count(*) into v_seen
  from public.source_projects where project_id = v_project;

  reset role;

  delete from public.source_projects where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if v_seen <> 1 then
    raise exception
      '검사 32 실패: 소유자가 자기 자료를 자기 프로젝트에 연결하지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 33. 다른 사용자의 연결을 볼 수 없다
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_source  uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'note'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_projects (owner_id, project_id, source_id)
  values (v_owner, v_project, v_source);

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.source_projects where project_id = v_project;

  reset role;

  delete from public.source_projects where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if v_seen <> 0 then
    raise exception '검사 33 실패: 다른 사용자의 연결이 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 34. 연결 행에는 UPDATE 권한이 없다
-- -----------------------------------------------------------------------------
-- 연결은 만들거나 끊는 것뿐이다. 고칠 수 있으면 자료를 슬쩍 바꿔치기할 수 있다.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where grantee = 'authenticated'
    and table_schema = 'public'
    and table_name in ('source_projects', 'capture_projects')
    and privilege_type = 'UPDATE';

  if v_count <> 0 then
    raise exception '검사 34 실패: 연결 테이블에 UPDATE 권한이 부여되어 있습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 35. 다른 사용자의 파일을 볼 수 없다
-- -----------------------------------------------------------------------------
-- source_files는 파일 이름과 Drive 식별자를 담는다. 이 표가 새면 남이
-- 어떤 자료를 보관하고 있는지 드러나고, Drive 식별자까지 함께 알려주게 된다.
do $$
declare
  v_owner  uuid;
  v_other  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  if v_other is null then
    raise exception '검사 35 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_files
    (owner_id, source_id, file_name, mime_type, byte_size)
  values
    (v_owner, v_source, '검사용.pdf', 'application/pdf', 1024);

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.source_files where source_id = v_source;

  reset role;

  delete from public.source_files where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 35 실패: 다른 사용자의 파일이 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 36. 다른 사용자의 자료에 파일을 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 자기 파일을
-- 붙일 수 있게 되므로, set_source_file_owner 트리거가 참조 대상을 확인한다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.source_files
      (source_id, file_name, mime_type, byte_size)
    values
      (v_source, '남의자료에.pdf', 'application/pdf', 1024);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 36 실패: 다른 사용자의 자료에 파일을 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 37. 소유자는 자기 자료에 파일을 붙이고 읽을 수 있다
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  -- owner_id를 보내지 않는다. 트리거가 채우는지도 함께 본다.
  insert into public.source_files
    (source_id, file_name, mime_type, byte_size)
  values
    (v_source, '내자료.pdf', 'application/pdf', 2048);

  select count(*) into v_seen
  from public.source_files
  where source_id = v_source and owner_id = v_owner;

  reset role;

  delete from public.source_files where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 1 then
    raise exception
      '검사 37 실패: 소유자가 자기 자료에 파일을 붙이지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 38. 확인되지 않은 파일은 ready가 될 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 10.3절: 업로드 성공 후에만 ready로 바꾼다.
-- 코드가 실수하더라도 가리킬 Drive 파일이 없는 ready는 저장되지 않아야 한다.
-- 이것이 무너지면 화면에는 파일이 있다고 나오는데 열 수 없는 상태가 된다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.source_files
      (source_id, status, file_name, mime_type, byte_size)
    values
      (v_source, 'ready'::public.source_file_status,
       '확인안된.pdf', 'application/pdf', 1024);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 38 실패: Drive 파일 없이 ready 상태가 저장되었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 39. 파일이 붙은 자료를 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- source_id를 고칠 수 있으면, 확인을 마친 파일을 다른 자료로 옮길 수 있다.
-- 자기 자료끼리라도 허용하지 않는다. 옮기려면 새로 붙이는 것이 맞다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_other   uuid;
  v_file    uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료 A')
  returning id into v_source;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료 B')
  returning id into v_other;

  insert into public.source_files
    (owner_id, source_id, file_name, mime_type, byte_size)
  values
    (v_owner, v_source, '옮겨볼.pdf', 'application/pdf', 1024)
  returning id into v_file;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.source_files set source_id = v_other where id = v_file;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where id = v_file;
  delete from public.sources where id in (v_source, v_other);

  if not v_blocked then
    raise exception
      '검사 39 실패: 파일이 붙은 자료를 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 40. 확인을 마친 파일을 다시 업로드 중으로 되돌릴 수 없다
-- -----------------------------------------------------------------------------
-- ready에서 pending으로 돌아갈 수 있으면 "확인했다"는 기록이 흔들린다.
-- 파일을 바꾸려면 새 행을 만든다.
--
-- 사라진 것으로 표시하는 것(ready -> missing)은 막지 않는다.
-- 그것은 되돌아가는 것이 아니라 지금 Drive에 없다는 사실을 적는 것이다.
-- 그 길이 열려 있는지는 검사 42가 확인한다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_file    uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_files
    (owner_id, source_id, status, drive_file_id, file_name, mime_type, byte_size)
  values
    (v_owner, v_source, 'ready'::public.source_file_status,
     'verify-only-not-a-real-drive-id', '확인된.pdf', 'application/pdf', 1024)
  returning id into v_file;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.source_files
    set status = 'pending'::public.source_file_status
    where id = v_file;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where id = v_file;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 40 실패: 확인을 마친 파일을 업로드 중으로 되돌릴 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 41. 파일이 어디에서 왔는지(origin)를 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- origin은 "우리가 지워도 되는 파일"과 "손대면 안 되는 파일"을 가른다.
--
--   upload  ThreadMark가 Drive에 만들었다.
--   picked  사용자가 원래 가지고 있던 것을 Picker로 고른 것이다.
--
-- 이 값을 바꿀 수 있으면, 앞으로 만들 정리 기능이 사용자의 원래 파일을
-- "우리가 만든 것"으로 보고 지워도 된다고 판단하게 된다.
-- 자기 행이라도 막는다. 되돌리기 어려운 쪽이 자기 자료이기 때문이다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_file    uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_files
    (owner_id, source_id, origin, status, drive_file_id,
     file_name, mime_type, byte_size)
  values
    (v_owner, v_source, 'picked'::public.source_file_origin,
     'ready'::public.source_file_status, 'verify-only-not-a-real-drive-id',
     '원래가지고있던.pdf', 'application/pdf', 1024)
  returning id into v_file;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.source_files
    set origin = 'upload'::public.source_file_origin
    where id = v_file;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where id = v_file;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 41 실패: 사용자가 원래 가지고 있던 파일을 우리가 만든 것으로 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 42. 사라진 파일로 표시하고 되돌릴 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 설계 문서 10.4절: 파일 이동·삭제를 구분해 표시한다.
-- 설계 문서 25절 통합 테스트 8번: 복구 가능한 오류 상태가 표시된다.
--
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. 실제로 12-C의 가드가
-- "ready가 아닌 모든 상태"를 막는 바람에 missing 표시까지 함께 막혔었다.
-- 이 검사는 그 길이 열려 있는지 본다.
--
-- 되돌리는 쪽도 확인한다. 휴지통에서 되살렸거나 일시적인 오류였을 수 있어서,
-- 사라졌다는 표시가 영구 판결이 되어서는 안 된다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_file   uuid;
  v_status public.source_file_status;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_files
    (owner_id, source_id, status, drive_file_id, file_name, mime_type, byte_size)
  values
    (v_owner, v_source, 'ready'::public.source_file_status,
     'verify-only-not-a-real-drive-id', '사라질.pdf', 'application/pdf', 1024)
  returning id into v_file;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  -- 사라진 것으로 표시한다.
  update public.source_files
  set status = 'missing'::public.source_file_status
  where id = v_file;

  -- 다시 찾아서 되돌린다.
  update public.source_files
  set status = 'ready'::public.source_file_status
  where id = v_file;

  select status into v_status
  from public.source_files where id = v_file;

  reset role;

  delete from public.source_files where id = v_file;
  delete from public.sources where id = v_source;

  if v_status is distinct from 'ready'::public.source_file_status then
    raise exception
      '검사 42 실패: 사라진 파일을 다시 확인된 상태로 되돌리지 못했습니다. (지금 %)',
      v_status;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 43. 사라진 파일도 업로드 중으로는 되돌릴 수 없다
-- -----------------------------------------------------------------------------
-- missing에서 pending으로 가는 길은 막는다. 다시 올린다면 새 행을 만든다.
-- 이 길이 열려 있으면 "확인을 마친 적이 있다"는 사실이 지워진다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_file    uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.source_files
    (owner_id, source_id, status, drive_file_id, file_name, mime_type, byte_size)
  values
    (v_owner, v_source, 'missing'::public.source_file_status,
     'verify-only-not-a-real-drive-id', '사라진.pdf', 'application/pdf', 1024)
  returning id into v_file;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.source_files
    set status = 'pending'::public.source_file_status
    where id = v_file;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_files where id = v_file;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 43 실패: 사라진 파일을 업로드 중으로 되돌릴 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 44. 번역을 만든 공급자·모델·시각은 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 9.4절: 번역 공급자, 모델, 언어, 생성 시각을 기록한다.
--
-- 바꿀 수 있으면 그 값은 기록이 아니라 주장이다. "이 번역은 무엇이 만들었나"를
-- 나중에 고칠 수 있으면, 기계가 만든 글을 사람이 쓴 것처럼 꾸밀 수 있다.
--
-- RLS는 "이 행이 내 것인가"만 본다. 내 행 안에서 어떤 칸을 어떻게 바꿀 수
-- 있는지는 가드 트리거가 맡는다. 여기서 확인하는 것이 그 트리거다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_capture uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.captures
    (owner_id, source_id, capture_type, original_text, translated_text,
     translation_language, translation_provider, translation_model,
     translated_at, ai_generated, verification_status)
  values
    (v_owner, v_source, 'translation'::public.capture_type,
     'The student error is', '학생의 오류는',
     'ko', 'anthropic', 'claude-sonnet-5',
     pg_catalog.now(), true,
     'machine_generated'::public.capture_verification_status)
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.captures
    set translation_model = '내가 직접 옮김'
    where id = v_capture;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 44 실패: 번역을 만든 모델을 나중에 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 45. 기계 번역을 고치면 확인 상태가 저절로 옮겨간다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 설계 문서 9.4절: 번역 결과는 사용자가 수정할 수 있다.
--                  수정본과 AI 원본을 구분할 수 있게 한다.
--
-- 앞의 검사들이 막는 쪽만 보고 있으므로 여기서 여는 쪽을 본다.
-- 고칠 수 없게 잠가버리면 9.4절을 어긴다.
--
-- 그리고 고친 뒤에도 machine_generated로 남아 있으면 그 구분은 이름뿐이다.
-- 화면이 상태를 같이 보내주기를 기대하지 않고 트리거가 옮긴다.
-- 보내주기를 잊는 화면이 하나라도 생기면 그때부터 기록이 거짓말을 한다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_capture uuid;
  v_status  public.capture_verification_status;
  v_text    text;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.captures
    (owner_id, source_id, capture_type, original_text, translated_text,
     translation_language, translation_provider, translation_model,
     translated_at, ai_generated, verification_status)
  values
    (v_owner, v_source, 'translation'::public.capture_type,
     'The student error is', '학생의 오류는',
     'ko', 'anthropic', 'claude-sonnet-5',
     pg_catalog.now(), true,
     'machine_generated'::public.capture_verification_status)
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  update public.captures
  set translated_text = '학생이 저지른 오류는'
  where id = v_capture;

  select verification_status, translated_text into v_status, v_text
  from public.captures where id = v_capture;

  reset role;

  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;

  if v_text is distinct from '학생이 저지른 오류는' then
    raise exception
      '검사 45 실패: 기계 번역문을 고치지 못했습니다. 9.4절은 고칠 수 있어야 한다고 합니다.';
  end if;

  if v_status is distinct from 'user_edited'::public.capture_verification_status then
    raise exception
      '검사 45 실패: 번역을 고쳤는데도 확인 상태가 %입니다. user_edited여야 합니다.',
      v_status;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 46. 확인 상태를 '기계가 만든 그대로'로 되돌릴 수 없다
-- -----------------------------------------------------------------------------
-- 되돌릴 수 있으면 사람이 손본 글을 다시 기계가 만든 것처럼 보이게 할 수 있고,
-- 그러면 이 값으로 아무것도 판단할 수 없다. 검사 45의 반대쪽이다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_capture uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.captures
    (owner_id, source_id, capture_type, original_text, translated_text,
     translation_language, translation_provider, translation_model,
     translated_at, ai_generated, verification_status)
  values
    (v_owner, v_source, 'translation'::public.capture_type,
     'The student error is', '학생이 저지른 오류는',
     'ko', 'anthropic', 'claude-sonnet-5',
     pg_catalog.now(), true,
     'user_edited'::public.capture_verification_status)
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.captures
    set verification_status =
      'machine_generated'::public.capture_verification_status
    where id = v_capture;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 46 실패: 사람이 손본 번역을 기계가 만든 그대로로 되돌릴 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 47. 기계에서 나온 글이라는 표시를 지울 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 9.4절: 기계 번역임을 표시한다.
--
-- 사람이 전부 고쳐 썼더라도 출발점이 기계였다는 것은 그대로다.
-- 지울 수 있으면 "이 글이 어디서 왔는가"가 남지 않는다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_capture uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'pdf'::public.source_type, 'RLS 격리 검사용 임시 자료')
  returning id into v_source;

  insert into public.captures
    (owner_id, source_id, capture_type, original_text, translated_text,
     translation_language, translation_provider, translation_model,
     translated_at, ai_generated, verification_status)
  values
    (v_owner, v_source, 'translation'::public.capture_type,
     'The student error is', '학생의 오류는',
     'ko', 'anthropic', 'claude-sonnet-5',
     pg_catalog.now(), true,
     'machine_generated'::public.capture_verification_status)
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.captures
    set ai_generated = false
    where id = v_capture;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception
      '검사 47 실패: 기계가 만든 글이라는 표시를 지울 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 48. 다른 사용자의 논문 정보를 볼 수 없다
-- -----------------------------------------------------------------------------
-- 서지 정보는 그 사람이 무엇을 읽고 있는지를 그대로 드러낸다.
-- 연구 주제가 공개되기 전에 새면 곤란한 일이 생길 수 있다.
do $$
declare
  v_owner  uuid;
  v_other  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  if v_other is null then
    raise exception '검사 48 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.paper_profiles
    (owner_id, source_id, authors, publication_year, journal_name)
  values
    (v_owner, v_source,
     '[{"family": "Kim", "given": "Daesoo"}]'::jsonb,
     2024, '검사용 학술지');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.paper_profiles where source_id = v_source;

  reset role;

  delete from public.paper_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 48 실패: 다른 사용자의 논문 정보가 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 49. 다른 사용자의 자료에 논문 정보를 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 서지 정보를
-- 붙일 수 있으므로, set_paper_profile_owner 트리거가 참조 대상을 확인한다.
-- captures와 source_files에서 이미 겪은 위험이 표마다 되풀이된다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.paper_profiles (source_id, journal_name)
    values (v_source, '남의 자료에 붙인 서지 정보');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 49 실패: 다른 사용자의 자료에 논문 정보를 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 50. 소유자는 자기 자료에 논문 정보를 붙이고 읽을 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
-- owner_id를 보내지 않고 넣어, 트리거가 채우는지도 함께 본다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.paper_profiles
    (source_id, authors, publication_year, journal_name, doi, keywords)
  values
    (v_source,
     '[{"family": "김대수"}, {"family": "Lee", "given": "Seoyeon"}]'::jsonb,
     2024, '수학교육연구', '10.1234/abcd', array['오류 분석', '형성평가']);

  select count(*) into v_seen
  from public.paper_profiles
  where source_id = v_source and owner_id = v_owner;

  reset role;

  delete from public.paper_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 1 then
    raise exception
      '검사 50 실패: 소유자가 자기 자료에 논문 정보를 붙이지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 51. 논문 정보가 붙은 자료를 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- source_id를 고칠 수 있으면 A 논문의 서지 정보가 B 자료에 붙는다.
-- 자기 자료끼리라도 허용하지 않는다. 붙일 자료를 잘못 골랐다면 지우고 다시 만든다.
-- source_files의 검사 39와 같은 이유다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_other   uuid;
  v_profile uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_source;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_other;

  insert into public.paper_profiles (owner_id, source_id, journal_name)
  values (v_owner, v_source, '옮겨볼 학술지')
  returning id into v_profile;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.paper_profiles set source_id = v_other where id = v_profile;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_profiles where id = v_profile;
  delete from public.sources where id in (v_source, v_other);

  if not v_blocked then
    raise exception
      '검사 51 실패: 논문 정보가 붙은 자료를 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 52. 모양이 깨진 저자 목록은 저장되지 않는다
-- -----------------------------------------------------------------------------
-- 설계 문서 8.1절: 구조화된 메타데이터로 APA를 생성한다.
--
-- 저자가 [{family, given?}] 모양이어야 참고문헌을 만들 수 있다.
-- 이 모양이 무너지면 참고문헌 생성이 통째로 멈추거나, 더 나쁘게는
-- 엉뚱한 이름이 실린다. 화면과 zod가 막지만 마지막 보장은 제약조건이다.
--
-- 네 가지를 시도한다. 배열이 아닌 것, 항목이 객체가 아닌 것,
-- family가 없는 것, 우리가 읽지 않는 열쇠가 섞인 것.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_bad     jsonb;
  v_blocked boolean;
  v_label   text;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  foreach v_bad in array array[
    '"Kim, Daesoo"'::jsonb,
    '["Kim, Daesoo"]'::jsonb,
    '[{"given": "Daesoo"}]'::jsonb,
    '[{"family": "  "}]'::jsonb,
    '[{"family": "Kim", "role": "corresponding"}]'::jsonb
  ]
  loop
    v_blocked := false;
    v_label := v_bad::text;

    begin
      insert into public.paper_profiles (owner_id, source_id, authors)
      values (v_owner, v_source, v_bad);
    exception when others then
      v_blocked := true;
    end;

    if not v_blocked then
      delete from public.paper_profiles where source_id = v_source;
      delete from public.sources where id = v_source;

      raise exception
        '검사 52 실패: 모양이 깨진 저자 목록이 저장되었습니다. (%)', v_label;
    end if;
  end loop;

  delete from public.paper_profiles where source_id = v_source;
  delete from public.sources where id = v_source;
end
$$;


-- -----------------------------------------------------------------------------
-- 53. 다른 사용자의 논문 분석을 볼 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 8.2절의 "나의 활용"에는 연구 계획이 그대로 적힌다.
-- 무엇을 준비하고 있는지가 드러나므로, 자료나 기록보다 더 사적인 글이다.
do $$
declare
  v_owner  uuid;
  v_other  uuid;
  v_source uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  if v_other is null then
    raise exception '검사 53 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.paper_analyses
    (owner_id, source_id, reading_purpose, where_to_use)
  values
    (v_owner, v_source, '검사용 읽는 목적', '검사용 활용 계획');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.paper_analyses where source_id = v_source;

  reset role;

  delete from public.paper_analyses where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 53 실패: 다른 사용자의 논문 분석이 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 54. 다른 사용자의 자료에 분석을 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 자료에 분석을
-- 붙일 수 있으므로, set_paper_analysis_owner 트리거가 참조 대상을 확인한다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.paper_analyses (source_id, reading_purpose)
    values (v_source, '남의 자료에 붙인 분석');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_analyses where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 54 실패: 다른 사용자의 자료에 분석을 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 55. 소유자는 자기 자료에 분석을 붙이고 읽고 고칠 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다.
-- 이 서식은 며칠에 걸쳐 여러 번 고쳐 적는 것이라, 고치는 길이 열려 있는지가
-- 특히 중요하다. 한 번 적고 못 고치면 서식으로 쓸 수 없다.
--
-- owner_id를 보내지 않고 넣어 트리거가 채우는지도 함께 본다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_value  text;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.paper_analyses (source_id, reading_purpose, main_argument)
  values (v_source, '처음 적은 목적', '핵심 주장');

  -- 며칠 뒤에 이어서 고친다.
  update public.paper_analyses
  set reading_purpose = '다시 적은 목적'
  where source_id = v_source;

  select count(*), max(reading_purpose) into v_seen, v_value
  from public.paper_analyses
  where source_id = v_source and owner_id = v_owner;

  reset role;

  delete from public.paper_analyses where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_seen <> 1 then
    raise exception
      '검사 55 실패: 소유자가 자기 자료에 분석을 붙이지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;

  if v_value is distinct from '다시 적은 목적' then
    raise exception
      '검사 55 실패: 적어둔 분석을 고치지 못했습니다. (지금 %)', v_value;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 56. 분석이 붙은 자료를 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- source_id를 고칠 수 있으면 A 논문을 읽고 적은 분석이 B 자료에 붙는다.
-- 서른 칸을 채운 글이 엉뚱한 논문의 것이 되고, 알아챌 방법이 없다.
-- 자기 자료끼리라도 허용하지 않는다. source_files와 paper_profiles와 같다.
do $$
declare
  v_owner    uuid;
  v_source   uuid;
  v_other    uuid;
  v_analysis uuid;
  v_blocked  boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_source;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_other;

  insert into public.paper_analyses (owner_id, source_id, reading_purpose)
  values (v_owner, v_source, '옮겨볼 분석')
  returning id into v_analysis;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.paper_analyses set source_id = v_other where id = v_analysis;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_analyses where id = v_analysis;
  delete from public.sources where id in (v_source, v_other);

  if not v_blocked then
    raise exception
      '검사 56 실패: 분석이 붙은 자료를 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 57. 다른 사용자의 활용 계획을 볼 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 8.3절. 활용 계획에는 "내 원고의 어디에 무엇을 쓸 것인가"가 적힌다.
-- 논문 목록보다 더 드러나는 글이다. 무엇을 쓰고 있는지가 그대로 보인다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_project uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  if v_other is null then
    raise exception '검사 57 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  insert into public.paper_project_uses
    (owner_id, paper_source_id, project_id, planned_section, usage_intent)
  values
    (v_owner, v_source, v_project, '이론적 배경', '검사용 활용 계획');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.paper_project_uses where paper_source_id = v_source;

  reset role;

  delete from public.paper_project_uses where paper_source_id = v_source;
  delete from public.projects where id = v_project;
  delete from public.sources where id = v_source;

  if v_seen <> 0 then
    raise exception '검사 57 실패: 다른 사용자의 활용 계획이 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 58. 다른 사용자의 논문에 활용 계획을 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 연결 표는 두 곳을 가리키므로 양쪽을 따로 확인해야 한다. 이것이 논문 쪽이다.
-- 내 프로젝트 + 남의 논문. 막지 않으면 남의 논문을 내 프로젝트에 편입시킨다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_project uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 논문은 관리자 것, 프로젝트는 다른 사용자 것.
  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.projects (owner_id, name)
  values (v_other, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.paper_project_uses (paper_source_id, project_id, usage_intent)
    values (v_source, v_project, '남의 논문에 붙인 계획');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_project_uses where paper_source_id = v_source;
  delete from public.projects where id = v_project;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 58 실패: 다른 사용자의 논문에 활용 계획을 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 59. 다른 사용자의 프로젝트에 활용 계획을 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 이번은 프로젝트 쪽이다. 내 논문 + 남의 프로젝트.
-- 한쪽만 확인하면 남의 프로젝트에 내 계획을 밀어넣을 수 있다.
-- source_projects에서 겪은 것과 같은 자리이며, 검사 58과 짝이다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_project uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 논문은 다른 사용자 것, 프로젝트는 관리자 것.
  insert into public.sources (owner_id, type, title)
  values (v_other, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.paper_project_uses (paper_source_id, project_id, usage_intent)
    values (v_source, v_project, '남의 프로젝트에 밀어넣은 계획');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.paper_project_uses where paper_source_id = v_source;
  delete from public.projects where id = v_project;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 59 실패: 다른 사용자의 프로젝트에 활용 계획을 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 60. 소유자는 자기 논문과 자기 프로젝트로 계획을 적고 고칠 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. 양쪽을 확인하는 트리거가
-- 지나치면 정상적인 자기 것끼리의 연결까지 막게 되는데, 그러면 기능 자체가
-- 성립하지 않는다.
--
-- owner_id를 보내지 않고 넣어 트리거가 채우는지도 함께 본다. (보안 원칙 2)
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_project uuid;
  v_use     uuid;
  v_written uuid;
  v_value   text;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.paper_project_uses (paper_source_id, project_id, usage_intent)
  values (v_source, v_project, '근거로 쓴다')
  returning id, owner_id into v_use, v_written;

  update public.paper_project_uses
  set usage_intent = '반론 상대로 쓴다', status = 'used'::public.paper_use_status
  where id = v_use;

  select usage_intent into v_value
  from public.paper_project_uses where id = v_use;

  reset role;

  delete from public.paper_project_uses where id = v_use;
  delete from public.projects where id = v_project;
  delete from public.sources where id = v_source;

  if v_use is null then
    raise exception
      '검사 60 실패: 소유자가 자기 논문에 활용 계획을 붙이지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;

  if v_written <> v_owner then
    raise exception
      '검사 60 실패: owner_id가 트리거로 채워지지 않았습니다. (%)', v_written;
  end if;

  if v_value <> '반론 상대로 쓴다' then
    raise exception
      '검사 60 실패: 적어둔 계획을 고치지 못했습니다. (지금 %)', v_value;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 61. 계획이 붙은 논문과 프로젝트를 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- 짝을 고칠 수 있으면 A 논문을 두고 적은 계획이 B 논문의 것이 되거나,
-- C 프로젝트의 계획이 D 프로젝트로 옮겨간다. 자기 것끼리라도 허용하지 않는다.
-- 잘못 골랐다면 지우고 다시 적는다. 검사 51, 56과 같은 이유다.
do $$
declare
  v_owner    uuid;
  v_source_a uuid;
  v_source_b uuid;
  v_project_c uuid;
  v_project_d uuid;
  v_use      uuid;
  v_paper_blocked   boolean := false;
  v_project_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_source_a;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_source_b;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트 C')
  returning id into v_project_c;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 임시 프로젝트 D')
  returning id into v_project_d;

  insert into public.paper_project_uses
    (owner_id, paper_source_id, project_id, usage_intent)
  values (v_owner, v_source_a, v_project_c, '옮겨볼 계획')
  returning id into v_use;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.paper_project_uses
    set paper_source_id = v_source_b where id = v_use;
  exception when others then
    v_paper_blocked := true;
  end;

  begin
    update public.paper_project_uses
    set project_id = v_project_d where id = v_use;
  exception when others then
    v_project_blocked := true;
  end;

  reset role;

  delete from public.paper_project_uses where id = v_use;
  delete from public.projects where id in (v_project_c, v_project_d);
  delete from public.sources where id in (v_source_a, v_source_b);

  if not v_paper_blocked then
    raise exception
      '검사 61 실패: 계획이 붙은 논문을 바꿀 수 있었습니다.';
  end if;

  if not v_project_blocked then
    raise exception
      '검사 61 실패: 계획이 붙은 프로젝트를 바꿀 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 62. 다른 사용자의 자료 관계를 볼 수 없다
-- -----------------------------------------------------------------------------
-- 설계 문서 8.4절. 무엇과 무엇을 이어두었는지는 읽고 있는 것의 지도가 된다.
-- 제목을 모르더라도 몇 편을 어떤 관계로 엮고 있는지가 드러난다.
do $$
declare
  v_owner  uuid;
  v_other  uuid;
  v_from   uuid;
  v_to     uuid;
  v_seen   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  if v_other is null then
    raise exception '검사 62 전제 실패: 사용자가 두 명 이상 필요합니다.';
  end if;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_from;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_to;

  insert into public.source_relations
    (owner_id, from_source_id, to_source_id, relation_type)
  values
    (v_owner, v_from, v_to, 'cites'::public.source_relation_type);

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.source_relations where from_source_id = v_from;

  reset role;

  delete from public.source_relations where from_source_id = v_from;
  delete from public.sources where id in (v_from, v_to);

  if v_seen <> 0 then
    raise exception '검사 62 실패: 다른 사용자의 자료 관계가 보였습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 63. 다른 사용자의 자료를 도착으로 삼을 수 없다
-- -----------------------------------------------------------------------------
-- 같은 표의 행 둘을 잇지만 확인은 두 방향 모두 해야 한다. 이것이 도착 쪽이다.
-- 막지 않으면 남의 자료 id만 알면 내 자료에 엮어 목록에 끌어올 수 있다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_mine    uuid;
  v_theirs  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  -- 출발은 다른 사용자 것, 도착은 관리자 것.
  insert into public.sources (owner_id, type, title)
  values (v_other, 'paper'::public.source_type, 'RLS 격리 검사용 내 논문')
  returning id into v_mine;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 남의 논문')
  returning id into v_theirs;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.source_relations (from_source_id, to_source_id, relation_type)
    values (v_mine, v_theirs, 'cites'::public.source_relation_type);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_relations
  where from_source_id in (v_mine, v_theirs) or to_source_id in (v_mine, v_theirs);
  delete from public.sources where id in (v_mine, v_theirs);

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 63 실패: 다른 사용자의 자료를 도착으로 삼을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 64. 다른 사용자의 자료를 출발로 삼을 수 없다
-- -----------------------------------------------------------------------------
-- 이번은 출발 쪽이다. 막지 않으면 남의 자료 상세에 내 자료가 관련 자료로
-- 나타난다. 그쪽 화면에 내가 줄 하나를 심는 셈이다. 검사 63과 짝이다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_mine    uuid;
  v_theirs  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_other, 'paper'::public.source_type, 'RLS 격리 검사용 내 논문')
  returning id into v_mine;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 남의 논문')
  returning id into v_theirs;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.source_relations (from_source_id, to_source_id, relation_type)
    values (v_theirs, v_mine, 'cites'::public.source_relation_type);
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.source_relations
  where from_source_id in (v_mine, v_theirs) or to_source_id in (v_mine, v_theirs);
  delete from public.sources where id in (v_mine, v_theirs);

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 64 실패: 다른 사용자의 자료를 출발로 삼을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 65. 소유자는 자기 자료끼리 잇고 읽고 끊을 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. 양쪽을 확인하는 트리거가
-- 지나치면 자기 것끼리의 연결까지 막게 되고, 그러면 기능이 성립하지 않는다.
--
-- owner_id를 보내지 않고 넣어 트리거가 채우는지도 함께 본다. (보안 원칙 2)
-- 끊는 것까지 확인한다. 고치는 길이 없으므로, 잘못 이었을 때 되돌릴 방법은
-- 끊기 하나뿐이다. 그것이 막혀 있으면 잘못된 줄이 영영 남는다.
do $$
declare
  v_owner   uuid;
  v_from    uuid;
  v_to      uuid;
  v_relation uuid;
  v_written uuid;
  v_seen    integer;
  v_left    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_from;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_to;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.source_relations (from_source_id, to_source_id, relation_type)
  values (v_from, v_to, 'similar_study'::public.source_relation_type)
  returning id, owner_id into v_relation, v_written;

  -- 두 방향 모두에서 읽힌다. 화면이 나간 것과 들어온 것을 따로 읽는다.
  select
    (select count(*) from public.source_relations where from_source_id = v_from)
    + (select count(*) from public.source_relations where to_source_id = v_to)
  into v_seen;

  delete from public.source_relations where id = v_relation;

  select count(*) into v_left
  from public.source_relations where id = v_relation;

  reset role;

  delete from public.source_relations where id = v_relation;
  delete from public.sources where id in (v_from, v_to);

  if v_relation is null then
    raise exception
      '검사 65 실패: 소유자가 자기 자료끼리 잇지 못했습니다. 정책이 과하게 잠겼습니다.';
  end if;

  if v_written <> v_owner then
    raise exception
      '검사 65 실패: owner_id가 트리거로 채워지지 않았습니다. (%)', v_written;
  end if;

  if v_seen <> 2 then
    raise exception
      '검사 65 실패: 이어둔 관계가 두 방향에서 읽히지 않았습니다. (%)', v_seen;
  end if;

  if v_left <> 0 then
    raise exception '검사 65 실패: 이어둔 관계를 끊지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 66. 자기 자신과 잇거나 같은 관계를 두 번 담을 수 없다
-- -----------------------------------------------------------------------------
-- 둘 다 제약조건이 막는다. 뜻이 없는 줄과 똑같은 줄 둘을 만들지 않는다.
-- 똑같은 줄이 둘이면 화면에서 어느 것을 끊어야 할지 알 수 없다.
do $$
declare
  v_owner   uuid;
  v_from    uuid;
  v_to      uuid;
  v_self_blocked  boolean := false;
  v_twice_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 A')
  returning id into v_from;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문 B')
  returning id into v_to;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.source_relations (from_source_id, to_source_id, relation_type)
    values (v_from, v_from, 'cites'::public.source_relation_type);
  exception when others then
    v_self_blocked := true;
  end;

  insert into public.source_relations (from_source_id, to_source_id, relation_type)
  values (v_from, v_to, 'cites'::public.source_relation_type);

  begin
    insert into public.source_relations (from_source_id, to_source_id, relation_type)
    values (v_from, v_to, 'cites'::public.source_relation_type);
  exception when others then
    v_twice_blocked := true;
  end;

  reset role;

  delete from public.source_relations
  where from_source_id in (v_from, v_to) or to_source_id in (v_from, v_to);
  delete from public.sources where id in (v_from, v_to);

  if not v_self_blocked then
    raise exception '검사 66 실패: 자기 자신과 이을 수 있었습니다.';
  end if;

  if not v_twice_blocked then
    raise exception '검사 66 실패: 같은 관계를 두 번 담을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 67. 읽을 후보를 정식 자료로 바꿀 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 설계 문서 8.4절: "아직 등록하지 않은 논문은 reading_candidate로 저장한 뒤
-- 정식 Source로 전환할 수 있게 한다."
--
-- 가드 트리거가 상태 변경을 막는데, 허용해야 하는 방향까지 막으면 담아둔 논문이
-- 영영 후보로 남는다. 막는 것만 확인하면 그것을 놓친다.
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_status text;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  -- 삽입 전에 클레임을 비운다. 비우지 않으면 소유자 고정 트리거가
  -- owner_id를 앞선 검사에서 설정한 사용자로 덮어쓴다.
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, status, title)
  values (
    v_owner,
    'paper'::public.source_type,
    'reading_candidate'::public.source_status,
    'RLS 격리 검사용 임시 읽을 후보'
  )
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  update public.sources
  set status = 'active'::public.source_status
  where id = v_source;

  select status::text into v_status
  from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if v_status is distinct from 'active' then
    raise exception
      '검사 67 실패: 읽을 후보를 정식 자료로 바꾸지 못했습니다. (지금 %)', v_status;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 68. 정식 자료를 읽을 후보로 되돌릴 수 없다
-- -----------------------------------------------------------------------------
-- 되돌릴 수 있게 두면 인용과 메모와 파일이 붙은 논문이 "아직 안 읽은 것"이 된다.
-- 목록에서 후보로 표시되고 서지 정보가 비어 보이는데, 그 상태에서 무엇이 진짜인지
-- 알 방법이 없다. 자기 자료라도 허용하지 않는다.
--
-- RLS의 WITH CHECK는 OLD 행을 볼 수 없어서 이 규칙은 BEFORE 트리거에 있다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_status  text;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.sources
    set status = 'reading_candidate'::public.source_status
    where id = v_source;
  exception when others then
    v_blocked := true;
  end;

  select status::text into v_status
  from public.sources where id = v_source;

  reset role;

  delete from public.sources where id = v_source;

  if not v_blocked or v_status is distinct from 'active' then
    raise exception
      '검사 68 실패: 정식 자료를 읽을 후보로 되돌릴 수 있었습니다. (지금 %)', v_status;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 69. 다른 사용자의 자료에 책 정보를 붙일 수 없다
-- -----------------------------------------------------------------------------
-- 외래키 제약은 RLS를 보지 않는다. 자료 id만 알면 남의 책에 내 읽기 기록을
-- 붙일 수 있게 된다. set_book_profile_owner 트리거가 막는다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'book'::public.source_type, 'RLS 격리 검사용 임시 책')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.book_profiles (source_id, publisher)
    values (v_source, '남의 자료에 붙인 출판사');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.book_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 69 실패: 다른 사용자의 자료에 책 정보를 붙일 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 70. 소유자는 자기 책에 정보를 붙이고 읽을 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. (보안 원칙 6)
do $$
declare
  v_owner  uuid;
  v_source uuid;
  v_read   text;
  v_status public.book_reading_status;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'book'::public.source_type, 'RLS 격리 검사용 내 책')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.book_profiles (source_id, publisher, reading_status)
  values (v_source, '내가 적은 출판사', 'reading'::public.book_reading_status);

  select publisher, reading_status into v_read, v_status
  from public.book_profiles where source_id = v_source;

  reset role;

  delete from public.book_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if v_read is distinct from '내가 적은 출판사' then
    raise exception '검사 70 실패: 자기 책의 정보를 읽지 못했습니다.';
  end if;

  if v_status is distinct from 'reading'::public.book_reading_status then
    raise exception '검사 70 실패: 읽기 상태가 저장되지 않았습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 71. 읽은 쪽이 전체 쪽수를 넘을 수 없다
-- -----------------------------------------------------------------------------
-- 넘는 값은 두 칸 중 하나를 잘못 적었다는 뜻이다. 조용히 받아두면 사용자가
-- 고칠 기회를 잃는다. 화면도 막지만 데이터베이스에서도 막는다.
do $$
declare
  v_owner   uuid;
  v_source  uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'book'::public.source_type, 'RLS 격리 검사용 쪽수 책')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.book_profiles (source_id, total_pages, current_page)
    values (v_source, 300, 400);
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.book_profiles where source_id = v_source;
  delete from public.sources where id = v_source;

  if not v_blocked then
    raise exception '검사 71 실패: 읽은 쪽이 전체 쪽수를 넘을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 72. 다른 사용자의 뼈대 자리를 볼 수 없다
-- -----------------------------------------------------------------------------
-- 자리에는 `여기에 쓸 글`이 함께 담긴다. 목차가 아니라 **원고**가 새는 것이다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_node    uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 뼈대 프로젝트')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title, body)
  values (v_owner, v_project, '서론', '남이 보면 안 되는 원고')
  returning id into v_node;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.project_outline_nodes where id = v_node;

  reset role;

  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.projects where id = v_project;

  if v_seen <> 0 then
    raise exception
      '검사 72 실패: 다른 사용자의 뼈대 자리가 %건 보였습니다.', v_seen;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 73. 다른 사용자의 프로젝트에 자리를 만들 수 없다
-- -----------------------------------------------------------------------------
-- 외래키는 RLS를 보지 않는다. 프로젝트 id만 알면 남의 뼈대에 자리를 끼워
-- 넣을 수 있게 된다. set_project_outline_node_owner 트리거가 막는다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 남의 프로젝트')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_outline_nodes (project_id, title)
    values (v_project, '남의 프로젝트에 끼워 넣은 자리');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 73 실패: 다른 사용자의 프로젝트에 자리를 만들 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 74. 다른 사용자의 자리 아래에 자리를 만들 수 없다
-- -----------------------------------------------------------------------------
-- 73번과 다른 길이다. 내 프로젝트를 대고 **위 자리만 남의 것**으로 적으면,
-- 프로젝트 확인만으로는 통과한다. assert_project_outline_owned가 막는다.
do $$
declare
  v_owner    uuid;
  v_other    uuid;
  v_project  uuid;
  v_mine     uuid;
  v_node     uuid;
  v_blocked  boolean := false;
  v_added    integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 남의 뼈대')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '남의 자리')
  returning id into v_node;

  insert into public.projects (owner_id, name)
  values (v_other, 'RLS 격리 검사용 내 프로젝트')
  returning id into v_mine;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_outline_nodes (project_id, parent_id, title)
    values (v_mine, v_node, '남의 자리 밑에 붙인 자리');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_outline_nodes
  where project_id in (v_project, v_mine);
  delete from public.projects where id in (v_project, v_mine);

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 74 실패: 다른 사용자의 자리 아래에 자리를 만들 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 75. 자기 것이라도 다른 프로젝트의 자리 아래에 둘 수 없다
-- -----------------------------------------------------------------------------
-- 소유자만 보면 **내 다른 프로젝트의 자리 밑에 붙일 수 있다.** 그러면 그 자리가
-- 두 프로젝트에 걸치고, 어느 쪽 화면에 보이는지가 질의에 따라 달라진다.
-- 자기 것끼리라도 막는다. source_relations와 같은 판단이다.
do $$
declare
  v_owner    uuid;
  v_projectA uuid;
  v_projectB uuid;
  v_node     uuid;
  v_blocked  boolean := false;
  v_added    integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 프로젝트 가')
  returning id into v_projectA;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 프로젝트 나')
  returning id into v_projectB;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_projectA, '가의 자리')
  returning id into v_node;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_outline_nodes (project_id, parent_id, title)
    values (v_projectB, v_node, '나에 있으면서 가에 붙은 자리');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_outline_nodes
  where project_id in (v_projectA, v_projectB);
  delete from public.projects where id in (v_projectA, v_projectB);

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 75 실패: 다른 프로젝트의 자리 아래에 자리를 둘 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 76. 소유자는 자리를 만들고 읽고 고치고 옮길 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 막는 것만 확인하면 과하게 잠근 경우를 놓친다. (보안 원칙 6)
-- 특히 **옮기기**가 중요하다. 막아버리면 뼈대를 고칠 수 없는데, 위의 74~78이
-- 전부 옮기기를 막는 검사라 한쪽으로 기울기 쉽다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_top     uuid;
  v_second  uuid;
  v_child   uuid;
  v_body    text;
  v_parent  uuid;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 내 뼈대')
  returning id into v_project;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.project_outline_nodes (project_id, title)
  values (v_project, '서론')
  returning id into v_top;

  insert into public.project_outline_nodes (project_id, title, position)
  values (v_project, '이론적 배경', 1)
  returning id into v_second;

  -- 아래에 자리를 더한다.
  insert into public.project_outline_nodes (project_id, parent_id, title)
  values (v_project, v_top, '연구의 필요성')
  returning id into v_child;

  -- 글을 적는다. 이 칸이 뼈대를 목차가 아니게 만든다. (설계 문서 7.3절)
  update public.project_outline_nodes
  set body = '이 연구는'
  where id = v_child;

  -- 다른 자리 밑으로 옮긴다. 화면의 `한 단 들이기`가 하는 일이다.
  update public.project_outline_nodes
  set parent_id = v_second
  where id = v_child;

  select body, parent_id into v_body, v_parent
  from public.project_outline_nodes where id = v_child;

  reset role;

  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.projects where id = v_project;

  if v_body is distinct from '이 연구는' then
    raise exception '검사 76 실패: 자기 자리에 쓴 글을 읽지 못했습니다.';
  end if;

  if v_parent is distinct from v_second then
    raise exception '검사 76 실패: 자기 자리를 옮기지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 77. 자기 아래에 있는 자리로 옮길 수 없다
-- -----------------------------------------------------------------------------
-- 옮기기를 열어두면 반드시 부딪히는 고리다. 걸리면 그 가지가 **화면에서
-- 통째로 사라진다.** 깊이를 담지 않으므로 트리거가 부모를 따라 위로
-- 거슬러 올라가며 확인한다. (설계 문서 7.3절)
--
-- 손자까지 내려가 확인하는 이유는, 바로 아래만 보는 검사로는 이 고리를
-- 잡지 못하기 때문이다. 거슬러 올라가는 고리가 정말 도는지를 본다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_top     uuid;
  v_child   uuid;
  v_grand   uuid;
  v_blocked boolean := false;
  v_parent  uuid;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 고리 뼈대')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '할아버지')
  returning id into v_top;

  insert into public.project_outline_nodes (owner_id, project_id, parent_id, title)
  values (v_owner, v_project, v_top, '아버지')
  returning id into v_child;

  insert into public.project_outline_nodes (owner_id, project_id, parent_id, title)
  values (v_owner, v_project, v_child, '손자')
  returning id into v_grand;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.project_outline_nodes
    set parent_id = v_grand
    where id = v_top;
  exception when others then
    v_blocked := true;
  end;

  select parent_id into v_parent
  from public.project_outline_nodes where id = v_top;

  reset role;

  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.projects where id = v_project;

  if not v_blocked or v_parent is not null then
    raise exception
      '검사 77 실패: 자기 손자 밑으로 옮길 수 있었습니다. 뼈대에 고리가 생깁니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 78. 자리의 프로젝트는 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- 바꿀 수 있으면 자리 하나만 다른 뼈대로 넘어간다. 그 자리에 적어둔 글과
-- 놓아둔 재료가 함께 따라가고, 아래 자리들은 원래 프로젝트에 남아 떠돈다.
do $$
declare
  v_owner    uuid;
  v_projectA uuid;
  v_projectB uuid;
  v_node     uuid;
  v_blocked  boolean := false;
  v_where    uuid;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 원래 프로젝트')
  returning id into v_projectA;

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 옮길 프로젝트')
  returning id into v_projectB;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_projectA, '옮겨지면 안 되는 자리')
  returning id into v_node;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.project_outline_nodes
    set project_id = v_projectB
    where id = v_node;
  exception when others then
    v_blocked := true;
  end;

  select project_id into v_where
  from public.project_outline_nodes where id = v_node;

  reset role;

  delete from public.project_outline_nodes
  where project_id in (v_projectA, v_projectB);
  delete from public.projects where id in (v_projectA, v_projectB);

  if not v_blocked or v_where is distinct from v_projectA then
    raise exception
      '검사 78 실패: 자리를 다른 프로젝트로 옮길 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 79. 다른 사용자가 놓아둔 재료를 볼 수 없다
-- -----------------------------------------------------------------------------
-- 놓인 재료에는 `이걸로 여기서 할 말`이 함께 담긴다. 남의 생각이다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_node    uuid;
  v_source  uuid;
  v_seen    integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 놓인 재료')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '서론')
  returning id into v_node;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 임시 논문')
  returning id into v_source;

  insert into public.project_node_items (owner_id, node_id, source_id, note)
  values (v_owner, v_node, v_source, '남이 보면 안 되는 생각');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_seen
  from public.project_node_items where node_id = v_node;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if v_seen <> 0 then
    raise exception
      '검사 79 실패: 다른 사용자가 놓아둔 재료가 %건 보였습니다.', v_seen;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 80. 다른 사용자의 자리에 내 재료를 놓을 수 없다
-- -----------------------------------------------------------------------------
-- 외래키는 RLS를 보지 않는다. 자리 id만 알면 남의 원고에 내 것을 끼워 넣을
-- 수 있게 된다. set_project_node_item_owner가 자리·자료·기록 셋을 함께 본다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_node    uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 남의 자리')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '남의 서론')
  returning id into v_node;

  insert into public.sources (owner_id, type, title)
  values (v_other, 'paper'::public.source_type, 'RLS 격리 검사용 내 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_node_items (node_id, source_id, note)
    values (v_node, v_source, '남의 자리에 끼워 넣은 것');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 80 실패: 다른 사용자의 자리에 재료를 놓을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 81. 내 자리에 다른 사용자의 재료를 놓을 수 없다
-- -----------------------------------------------------------------------------
-- 80번의 반대 방향이다. 자리는 내 것이고 **놓는 것만 남의 것**이다.
-- 자리만 확인하는 가드는 이쪽을 그냥 통과시킨다. assert_source_owned가 막는다.
do $$
declare
  v_owner   uuid;
  v_other   uuid;
  v_project uuid;
  v_node    uuid;
  v_source  uuid;
  v_blocked boolean := false;
  v_added   integer := 0;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  select p.id into v_other
  from public.profiles p where p.id <> v_owner limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 남의 논문')
  returning id into v_source;

  insert into public.projects (owner_id, name)
  values (v_other, 'RLS 격리 검사용 내 프로젝트')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_other, v_project, '내 서론')
  returning id into v_node;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_node_items (node_id, source_id, note)
    values (v_node, v_source, '남의 자료를 내 자리에');
    get diagnostics v_added = row_count;
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_blocked or v_added > 0 then
    raise exception
      '검사 81 실패: 다른 사용자의 자료를 내 자리에 놓을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 82. 소유자는 자기 자리에 자기 재료를 놓고 할 말을 고칠 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 자료와 기록을 모두 놓아본다. 한 자리에 둘이 섞여 있는 것이 그 자리의 모습이다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_node    uuid;
  v_source  uuid;
  v_capture uuid;
  v_item    uuid;
  v_note    text;
  v_count   integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 놓기 프로젝트')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 놓을 논문')
  returning id into v_source;

  insert into public.captures (owner_id, capture_type, content)
  values (v_owner, 'note'::public.capture_type, 'RLS 격리 검사용 놓을 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.project_outline_nodes (project_id, title)
  values (v_project, '서론')
  returning id into v_node;

  insert into public.project_node_items (node_id, source_id)
  values (v_node, v_source)
  returning id into v_item;

  insert into public.project_node_items (node_id, capture_id, position)
  values (v_node, v_capture, 1);

  -- 놓은 뒤에 `이걸로 여기서 할 말`을 적는다. 이 칸만은 고칠 수 있어야 한다.
  update public.project_node_items
  set note = '표본 설계의 근거로 쓴다'
  where id = v_item;

  select note into v_note
  from public.project_node_items where id = v_item;

  select count(*) into v_count
  from public.project_node_items where node_id = v_node;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if v_count <> 2 then
    raise exception
      '검사 82 실패: 한 자리에 놓은 것이 %건입니다. 2건이어야 합니다.', v_count;
  end if;

  if v_note is distinct from '표본 설계의 근거로 쓴다' then
    raise exception '검사 82 실패: 놓은 재료에 할 말을 적지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 83. 같은 자리에 같은 것을 두 번 놓을 수 없다
-- -----------------------------------------------------------------------------
-- 화면에 같은 줄이 둘 보이는 것은 실수이지 뜻이 아니다.
--
-- 한 색인에 자료와 기록 두 칸을 함께 걸면 안 된다. PostgreSQL에서 NULL은
-- 자기 자신과도 같지 않아서 `자리+자료+NULL`이 서로 다른 값으로 취급되고,
-- 막으려던 중복이 그대로 들어온다. 그래서 부분 색인을 따로 건다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_node    uuid;
  v_source  uuid;
  v_blocked boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 두 번 놓기')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '서론')
  returning id into v_node;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 두 번 놓을 논문')
  returning id into v_source;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.project_node_items (node_id, source_id)
  values (v_node, v_source);

  begin
    insert into public.project_node_items (node_id, source_id, position)
    values (v_node, v_source, 1);
  exception when others then
    v_blocked := true;
  end;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_blocked then
    raise exception
      '검사 83 실패: 같은 자리에 같은 자료를 두 번 놓을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 84. 자료와 기록 중 정확히 하나만 놓을 수 있다
-- -----------------------------------------------------------------------------
-- 둘 다 비면 무엇을 놓았는지 알 수 없고, 둘 다 차면 어느 쪽을 보여줄지
-- **화면이 정하게 된다.** 화면이 정하면 그 판단이 코드 여기저기로 번진다.
do $$
declare
  v_owner    uuid;
  v_project  uuid;
  v_node     uuid;
  v_source   uuid;
  v_capture  uuid;
  v_both     boolean := false;
  v_neither  boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 둘 중 하나')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '서론')
  returning id into v_node;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 논문')
  returning id into v_source;

  insert into public.captures (owner_id, capture_type, content)
  values (v_owner, 'note'::public.capture_type, 'RLS 격리 검사용 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.project_node_items (node_id, source_id, capture_id)
    values (v_node, v_source, v_capture);
  exception when others then
    v_both := true;
  end;

  begin
    insert into public.project_node_items (node_id, note)
    values (v_node, '아무것도 놓지 않았다');
  exception when others then
    v_neither := true;
  end;

  reset role;

  delete from public.project_node_items where node_id = v_node;
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if not v_both then
    raise exception '검사 84 실패: 자료와 기록을 함께 놓을 수 있었습니다.';
  end if;

  if not v_neither then
    raise exception '검사 84 실패: 아무것도 놓지 않은 줄을 담을 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 85. 무엇을 어디에 놓았는지는 나중에 바꿀 수 없다
-- -----------------------------------------------------------------------------
-- 바꿀 수 있으면 가 재료를 두고 적은 `여기서 할 말`이 나 재료의 것이 된다.
-- 옮기려면 빼고 다시 놓는다. 그때 무슨 말을 적을지 다시 생각하게 되는 편이 맞다.
do $$
declare
  v_owner   uuid;
  v_project uuid;
  v_node    uuid;
  v_other   uuid;
  v_sourceA uuid;
  v_sourceB uuid;
  v_item    uuid;
  v_moved   boolean := false;
  v_swapped boolean := false;
  v_at      uuid;
  v_what    uuid;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 바꿔치기')
  returning id into v_project;

  insert into public.project_outline_nodes (owner_id, project_id, title)
  values (v_owner, v_project, '서론')
  returning id into v_node;

  insert into public.project_outline_nodes (owner_id, project_id, title, position)
  values (v_owner, v_project, '결론', 1)
  returning id into v_other;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 논문 가')
  returning id into v_sourceA;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 논문 나')
  returning id into v_sourceB;

  insert into public.project_node_items (owner_id, node_id, source_id, note)
  values (v_owner, v_node, v_sourceA, '가로 할 말')
  returning id into v_item;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    update public.project_node_items set node_id = v_other where id = v_item;
  exception when others then
    v_moved := true;
  end;

  begin
    update public.project_node_items set source_id = v_sourceB where id = v_item;
  exception when others then
    v_swapped := true;
  end;

  select node_id, source_id into v_at, v_what
  from public.project_node_items where id = v_item;

  reset role;

  delete from public.project_node_items where node_id in (v_node, v_other);
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.sources where id in (v_sourceA, v_sourceB);
  delete from public.projects where id = v_project;

  if not v_moved or v_at is distinct from v_node then
    raise exception '검사 85 실패: 놓인 재료를 다른 자리로 옮길 수 있었습니다.';
  end if;

  if not v_swapped or v_what is distinct from v_sourceA then
    raise exception
      '검사 85 실패: 놓인 것을 다른 재료로 바꿀 수 있었습니다. 적어둔 말이 남의 것이 됩니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 86. 자리를 지우면 그 아래와 놓인 자리는 사라지고 재료는 남는다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- 설계 문서 7.3절의 약속이다. 사라지는 것은 **어디에 놓았는가**뿐이고,
-- 자료와 기록은 프로젝트에 그대로 남아 `자리 못 찾은 것`으로 간다.
--
-- 이것이 어긋나면 자리 하나를 지울 때 모아둔 것까지 함께 사라진다. 사용자가
-- 되돌릴 방법이 없고, 지운 뒤에야 알게 된다. 설계상 그렇게 되어 있지만
-- **눈으로 본 적이 없어서** 여기서 확인한다.
do $$
declare
  v_owner    uuid;
  v_project  uuid;
  v_top      uuid;
  v_child    uuid;
  v_source   uuid;
  v_capture  uuid;
  v_nodes    integer;
  v_items    integer;
  v_sources  integer;
  v_captures integer;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  perform set_config('request.jwt.claims', '{}', true);

  insert into public.projects (owner_id, name)
  values (v_owner, 'RLS 격리 검사용 지우기')
  returning id into v_project;

  insert into public.sources (owner_id, type, title)
  values (v_owner, 'paper'::public.source_type, 'RLS 격리 검사용 남아야 할 논문')
  returning id into v_source;

  insert into public.captures (owner_id, capture_type, content)
  values (v_owner, 'note'::public.capture_type, 'RLS 격리 검사용 남아야 할 기록')
  returning id into v_capture;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.project_outline_nodes (project_id, title)
  values (v_project, '지울 자리')
  returning id into v_top;

  insert into public.project_outline_nodes (project_id, parent_id, title)
  values (v_project, v_top, '함께 사라질 아래 자리')
  returning id into v_child;

  insert into public.project_node_items (node_id, source_id)
  values (v_top, v_source);

  insert into public.project_node_items (node_id, capture_id)
  values (v_child, v_capture);

  -- 위 자리 하나만 지운다. 아래 자리는 딸려 사라져야 한다.
  delete from public.project_outline_nodes where id = v_top;

  select count(*) into v_nodes
  from public.project_outline_nodes where project_id = v_project;

  select count(*) into v_items
  from public.project_node_items where node_id in (v_top, v_child);

  select count(*) into v_sources
  from public.sources where id = v_source and deleted_at is null;

  select count(*) into v_captures
  from public.captures where id = v_capture and deleted_at is null;

  reset role;

  delete from public.project_node_items where node_id in (v_top, v_child);
  delete from public.project_outline_nodes where project_id = v_project;
  delete from public.captures where id = v_capture;
  delete from public.sources where id = v_source;
  delete from public.projects where id = v_project;

  if v_nodes <> 0 then
    raise exception
      '검사 86 실패: 아래 자리가 %건 남았습니다. 함께 사라져야 합니다.', v_nodes;
  end if;

  if v_items <> 0 then
    raise exception
      '검사 86 실패: 놓인 기록이 %건 남았습니다. 자리가 없는데 남아 떠돕니다.', v_items;
  end if;

  if v_sources <> 1 then
    raise exception
      '검사 86 실패: 자료가 함께 사라졌습니다. 자리를 지워도 재료는 남아야 합니다.';
  end if;

  if v_captures <> 1 then
    raise exception
      '검사 86 실패: 기록이 함께 사라졌습니다. 자리를 지워도 재료는 남아야 합니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 87. 로그인한 사용자는 자기 Drive 연결조차 읽을 수 없다
-- -----------------------------------------------------------------------------
-- **이 표는 다른 표와 잠그는 방식이 다르다.**
--
-- 지금까지의 표는 "소유자에게만 보여준다"였다. 이 표는 담고 있는 것이
-- 사용자의 자료가 아니라 **Google 계정에 접근할 수 있는 열쇠**다. 그래서
-- 설계 문서 10.5절이 "클라이언트가 refresh token 표를 select할 수 없어야
-- 한다"고 못 박았고, authenticated에는 권한 자체를 주지 않았다.
--
-- **본인조차 읽을 수 없다.** 읽을 이유가 없기 때문이다. 화면이 보여주는 것은
-- 연결 상태뿐이고 그것은 서버가 골라 내려준다.
--
-- 막히는 방식까지 확인한다. 권한이 없어 막히는 것과 정책에 걸려 0건이
-- 나오는 것은 **방어선이 한 겹 다르다.** 누군가 grant를 더하면 앞의 것이
-- 뒤의 것으로 조용히 내려앉는데, 그때 알아야 한다.
do $$
declare
  v_owner   uuid;
  v_denied  boolean := false;
  v_seen    integer := -1;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    select count(*) into v_seen
    from public.google_drive_connections
    where user_id = v_owner;
  exception when insufficient_privilege then
    v_denied := true;
  when others then
    v_denied := true;
  end;

  reset role;

  if v_denied then
    return;
  end if;

  if v_seen = 0 then
    raise exception
      '검사 87 실패: Drive 연결 표에 권한이 생겼습니다. 지금은 정책이 없어 0건이 나오지만, 정책이 하나라도 생기면 그대로 열립니다.';
  end if;

  raise exception
    '검사 87 실패: 로그인한 사용자가 자기 Drive 연결을 %건 읽었습니다. 토큰이 담긴 표입니다.',
    v_seen;
end
$$;


-- -----------------------------------------------------------------------------
-- 88. 로그인한 사용자는 Drive 연결을 담거나 고치거나 지울 수 없다
-- -----------------------------------------------------------------------------
-- 읽기만 막으면 절반이다. 고칠 수 있으면 **남의 연결에 내 토큰을 밀어 넣거나**
-- 남의 연결을 끊어버릴 수 있다. 지우는 것은 되돌릴 수 없다.
do $$
declare
  v_owner    uuid;
  v_inserted boolean := false;
  v_updated  boolean := false;
  v_deleted  boolean := false;
begin
  select user_id into v_owner
  from public.user_roles where role = 'admin'::public.app_role limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.google_drive_connections
      (user_id, encrypted_refresh_token, granted_scope)
    values (v_owner, '검사용 가짜 토큰', 'https://www.googleapis.com/auth/drive.file');
    v_inserted := true;
  exception when others then
    null;
  end;

  begin
    update public.google_drive_connections
    set status = 'revoked'::public.drive_connection_status;
    v_updated := true;
  exception when others then
    null;
  end;

  begin
    delete from public.google_drive_connections;
    v_deleted := true;
  exception when others then
    null;
  end;

  reset role;

  if v_inserted then
    raise exception
      '검사 88 실패: 로그인한 사용자가 Drive 연결을 담을 수 있었습니다.';
  end if;

  if v_updated then
    raise exception
      '검사 88 실패: 로그인한 사용자가 Drive 연결을 고칠 수 있었습니다.';
  end if;

  if v_deleted then
    raise exception
      '검사 88 실패: 로그인한 사용자가 Drive 연결을 지울 수 있었습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 89. 로그인하지 않은 쪽은 Drive 연결에 닿을 수 없다
-- -----------------------------------------------------------------------------
-- anon은 로그인 화면과 사용법 화면이 쓰는 역할이다. 그쪽에서 이 표에 닿을
-- 길이 있으면 로그인조차 필요 없어진다.
do $$
declare
  v_denied boolean := false;
  v_seen   integer := -1;
begin
  set local role anon;
  perform set_config('request.jwt.claims', '{}', true);

  begin
    select count(*) into v_seen from public.google_drive_connections;
  exception when others then
    v_denied := true;
  end;

  reset role;

  if not v_denied then
    raise exception
      '검사 89 실패: 로그인하지 않은 쪽에서 Drive 연결을 %건 읽었습니다.', v_seen;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 90. 서버는 Drive 연결을 다룰 수 있다 (열려야 하는 것)
-- -----------------------------------------------------------------------------
-- **이것을 실제로 겪었다.** 표를 만들면서 anon과 authenticated의 권한만
-- 회수하고 service_role에는 아무것도 주지 않았다. 새 표에 기본 권한이
-- 자동으로 붙는다고 여겼기 때문이다. 그래서 서버조차 읽지 못했다.
--
--   permission denied for table google_drive_connections
--
-- 막는 것만 검사하면 이 고장을 잡지 못한다. 그리고 이 고장은 Drive 기능
-- **전체**를 멈추게 한다. (보안 원칙 6)
do $$
declare
  v_free   uuid;
  v_seen   integer;
  v_status public.drive_connection_status;
begin
  set local role service_role;

  -- 읽을 수 있는가. 권한이 없으면 여기서 멈춘다.
  select count(*) into v_seen from public.google_drive_connections;

  reset role;

  /*
    담고 고치고 지울 수 있는가.

    연결이 없는 계정을 골라 쓴다. user_id가 기본키라 이미 연결된 계정에
    담으면 충돌이 나고, 그것은 권한 문제가 아니다. **검사가 엉뚱한 이유로
    실패하면 다음부터 그 검사를 믿지 않게 된다.**
  */
  select p.id into v_free
  from public.profiles p
  where not exists (
    select 1 from public.google_drive_connections c where c.user_id = p.id
  )
  limit 1;

  if v_free is null then
    raise warning
      '검사 90 주의: 모든 계정에 Drive 연결이 있어 담기·고치기·지우기는 확인하지 못했습니다. 읽기만 확인했습니다.';
    return;
  end if;

  set local role service_role;

  insert into public.google_drive_connections
    (user_id, encrypted_refresh_token, granted_scope)
  values (v_free, '검사용 가짜 토큰', 'https://www.googleapis.com/auth/drive.file');

  update public.google_drive_connections
  set status = 'revoked'::public.drive_connection_status
  where user_id = v_free;

  select status into v_status
  from public.google_drive_connections where user_id = v_free;

  delete from public.google_drive_connections where user_id = v_free;

  reset role;

  if v_status is distinct from 'revoked'::public.drive_connection_status then
    raise exception '검사 90 실패: 서버가 Drive 연결 상태를 고치지 못했습니다.';
  end if;

  if exists (
    select 1 from public.google_drive_connections where user_id = v_free
  ) then
    raise exception '검사 90 실패: 서버가 Drive 연결을 지우지 못했습니다.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 91. Drive 연결 표에는 정책이 하나도 없다
-- -----------------------------------------------------------------------------
-- 이 표의 방어선은 두 겹이다.
--
--   첫째 겹  authenticated에 권한이 없다. 닿을 수조차 없다. (87·88)
--   둘째 겹  RLS가 켜져 있고 **정책이 하나도 없다.**
--
-- 둘째 겹이 있는 이유는, 나중에 누군가 실수로 grant를 더하더라도 정책이
-- 없으면 여전히 한 행도 보이지 않기 때문이다. **실수 한 번으로 열리지
-- 않게 하는 장치다.**
--
-- 정책을 하나 더하는 순간 그 장치가 사라진다. 그런데 정책을 더하는 일은
-- "이 표도 다른 표처럼 만들자"는 선의로 일어나기 쉽다. 여기서 막는다.
do $$
declare
  v_policies integer;
  v_rls      boolean;
begin
  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'google_drive_connections';

  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'google_drive_connections';

  if v_policies > 0 then
    raise exception
      '검사 91 실패: Drive 연결 표에 정책이 %개 생겼습니다. 권한을 잘못 주는 실수가 그대로 열리게 됩니다.',
      v_policies;
  end if;

  if not coalesce(v_rls, false) then
    raise exception
      '검사 91 실패: Drive 연결 표의 RLS가 꺼져 있습니다. 두 번째 방어선이 없습니다.';
  end if;
end
$$;


-- =============================================================================
-- 모두 통과
-- =============================================================================
select
  '모든 RLS 검사를 통과했습니다' as 결과,
  (select count(*) from public.profiles)                                as 전체_사용자,
  (select count(*) from public.user_roles
    where role = 'admin'::public.app_role)                              as 관리자,
  (select count(*) from public.admin_audit_logs)                        as 감사_기록,
  (select (value #>> '{}') from public.app_settings
    where key = 'require_user_approval')                                as 승인_필요_설정,
  (select count(*) from public.sources
    where deleted_at is null
      and status = 'active'::public.source_status)                      as 저장된_자료,
  (select count(*) from public.sources
    where deleted_at is null
      and status = 'reading_candidate'::public.source_status)           as 읽을_후보,
  (select count(*) from public.captures where deleted_at is null)       as 저장된_기록,
  (select count(*) from public.projects where deleted_at is null)       as 프로젝트,
  (select count(*) from public.source_projects)                         as 자료_연결,
  (select count(*) from public.source_files
    where status = 'ready'::public.source_file_status)                  as 보관된_파일,
  (select count(*) from public.source_files
    where status = 'missing'::public.source_file_status)                as 사라진_파일,
  (select count(*) from public.captures
    where deleted_at is null and ai_generated)                          as 기계_번역,
  (select count(*) from public.paper_profiles)                          as 논문_정보,
  (select count(*) from public.paper_analyses)                          as 논문_분석,
  (select count(*) from public.paper_project_uses)                      as 활용_계획,
  (select count(*) from public.paper_project_uses
    where status = 'used'::public.paper_use_status)                     as 원고에_넣음,
  (select count(*) from public.source_relations)                        as 자료_관계,
  (select count(*) from public.book_profiles)                           as 책_정보,
  (select count(*) from public.book_profiles
    where reading_status = 'finished'::public.book_reading_status)      as 다_읽은_책,
  (select count(*) from public.project_outline_nodes)                   as 뼈대_자리,
  (select count(*) from public.project_outline_nodes
    where body is not null and pg_catalog.btrim(body) <> '')            as 글_쓴_자리,
  (select count(*) from public.project_node_items)                      as 놓인_재료,
  (select count(*) from public.google_drive_connections)                as 드라이브_연결,
  (select count(*) from public.google_drive_connections
    where status <> 'connected'::public.drive_connection_status)        as 손본_연결,
  coalesce(
    pg_catalog.current_setting('threadmark.check19', true),
    '건너뜀'
  )                                                                     as 비활성_자료_검사,
  coalesce(
    pg_catalog.current_setting('threadmark.check27', true),
    '건너뜀'
  )                                                                     as 비활성_기록_검사;
