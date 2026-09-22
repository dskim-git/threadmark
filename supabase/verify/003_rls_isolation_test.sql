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
  (select count(*) from public.sources where deleted_at is null)        as 저장된_자료,
  (select count(*) from public.captures where deleted_at is null)       as 저장된_기록,
  (select count(*) from public.projects where deleted_at is null)       as 프로젝트,
  (select count(*) from public.source_projects)                         as 자료_연결,
  (select count(*) from public.source_files
    where status = 'ready'::public.source_file_status)                  as 보관된_파일,
  coalesce(
    pg_catalog.current_setting('threadmark.check19', true),
    '건너뜀'
  )                                                                     as 비활성_자료_검사,
  coalesce(
    pg_catalog.current_setting('threadmark.check27', true),
    '건너뜀'
  )                                                                     as 비활성_기록_검사;
