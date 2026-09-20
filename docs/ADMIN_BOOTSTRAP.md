# 최초 관리자 부트스트랩 절차

> 상태: **운영 프로젝트에 실행 완료 (2026-09-20).**
> 검증: `supabase/verify/002_verify_first_admin.sql` 8개 항목 통과
> 선행 조건: 1단계 마이그레이션이 원격 Supabase에 적용되어 있고, 관리자 계정으로 Google 로그인을
> 최소 한 번 완료해 `auth.users`에 행이 생성된 상태
>
> 새 환경(로컬 개발 DB 등)에서 다시 관리자를 지정할 때 이 절차를 사용한다.

## 왜 마이그레이션에 넣지 않았는가

최초 관리자 지정을 마이그레이션에 넣으면 다음 문제가 생긴다.

1. **대상이 아직 존재하지 않는다.** `user_roles.user_id`는 `auth.users(id)`를 참조한다.
   첫 로그인 전에는 그 행이 없으므로 외래키 제약으로 실패한다.
2. **이메일이 코드에 박힌다.** 관리자 이메일이 Git 저장소(public)에 남고, 관리자 판정 기준이
   `user_roles`라는 원칙이 흐려진다.
3. **되돌리기 어렵다.** 마이그레이션은 모든 환경에서 자동 실행된다. Preview나 다른 환경에서
   의도치 않게 권한이 부여될 수 있다.

따라서 관리자 부여는 사람이 한 번, 명시적으로, 특정 환경에서만 수행하는 운영 작업으로 분리한다.

## 실행 방법

### 1. 사전 확인

Supabase 대시보드 → SQL Editor에서 실행한다. SQL Editor는 `postgres` 역할로 동작하므로
RLS를 우회하고, 가드 트리거도 서비스 컨텍스트로 인정한다.

먼저 아래 한 쿼리로 세 가지를 한 번에 확인한다. 이메일은 이 문서에 적지 말고
실행 시점에 직접 입력한다.

```sql
select
  current_user                                   as 현재역할,
  (select count(*) from auth.users
    where email = '<관리자 이메일>')              as 계정존재,
  (select status::text from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = '<관리자 이메일>')            as 현재상태;
```

| 항목 | 기대값 | 확인 이유 |
| --- | --- | --- |
| `현재역할` | `postgres`, `service_role`, `supabase_admin` 중 하나 | 바로 아래 설명 참고 |
| `계정존재` | `1` | 아직 로그인하지 않았다면 `0`이다. 먼저 Google 로그인을 완료한다 |
| `현재상태` | `pending` | 이미 `active`면 부트스트랩이 필요 없다 |

`현재역할` 확인이 가장 중요하다. SQL Editor에서는 `auth.uid()`가 NULL이므로 `is_admin()`이
false가 된다. `guard_profile_protected_columns` 트리거가 상태 변경을 허용하는 근거는
`current_user`가 서비스 컨텍스트에 속하는지 하나뿐이다. 2026-09-20 확인 시점에
Supabase 대시보드 SQL Editor는 `postgres` 역할로 동작했다.

### 2. 관리자 권한 부여 및 승인

두 작업을 한 트랜잭션으로 처리한다. 관리자 계정도 가입 시점에는 `pending`이므로 `active`로
바꿔주어야 한다.

```sql
begin;

-- 대상 사용자 확인 (여기서 행이 0개면 아래 두 구문도 아무 일도 하지 않는다)
with target as (
  select id from auth.users where email = '<관리자 이메일>'
)
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from target
on conflict (user_id, role) do nothing;

with target as (
  select id from auth.users where email = '<관리자 이메일>'
)
update public.profiles
set status = 'active'::public.user_status,
    status_reason = '최초 관리자 부트스트랩'
where id in (select id from target)
  and status <> 'active'::public.user_status;

commit;
```

### 3. 결과 확인

```sql
select p.email, p.status, p.approved_at, ur.role, ur.granted_at
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where ur.role = 'admin'::public.app_role;
```

감사 로그에도 두 건이 남아 있어야 한다. 서비스 컨텍스트에서 실행했으므로 `actor_id`는 NULL이다.

```sql
select action, target_user_id, previous_value, new_value, created_at
from public.admin_audit_logs
order by created_at desc
limit 10;
```

## 주의사항

- **로컬 개발 DB와 운영 DB에서 각각 수행해야 한다.** 관리자 권한은 데이터이므로 환경 간에
  자동으로 옮겨가지 않는다.
- **Preview 환경에는 부여하지 않는다.** 블루프린트 24절에 따라 Preview는 제한된 공개 설정만 사용한다.
- **`service_role` 키를 브라우저나 클라이언트 코드에서 쓰지 않는다.** 이 절차는 Supabase 대시보드
  SQL Editor에서만 수행한다.
- 마지막 관리자의 권한은 `guard_last_admin` 트리거가 보호한다. 관리자가 한 명뿐일 때 앱에서
  그 권한을 해제하려 하면 거부된다. 의도적으로 정리해야 한다면 SQL Editor에서 수행한다.
- 부여 후에는 관리자 화면(6단계)을 통해 다른 사용자를 승인할 수 있다. 이후 이 절차를 다시
  실행할 필요는 없다.
