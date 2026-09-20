# ADR 0001. 인증·가입 승인 스키마 설계

- 상태: 채택
- 날짜: 2026-09-20
- 관련 마이그레이션: `supabase/migrations/20260920090000_auth_approval_foundation.sql`
- 관련 문서: `docs/THREADMARK_BLUEPRINT.md` 4절, `docs/THREADMARK_PRIVACY_AND_DELETION_DRAFT.md` 1·2·10절

## 배경

ThreadMark는 초기에 관리자의 승인을 받은 사용자만 이용할 수 있다. 승인 상태에 따른 접근 제한은
화면 숨김이 아니라 서버와 RLS에서 강제해야 한다. 이 문서는 그 기반 스키마에서 내린 결정과
그렇게 한 이유를 남긴다.

## 결정

### 1. 역할을 `profiles`가 아니라 별도 테이블 `user_roles`에 둔다

사용자는 자기 `profiles` 행을 수정할 수 있어야 한다(표시 이름, 언어, 시간대). 같은 행에
`is_admin` 같은 권한 컬럼을 두면, 자기 행을 수정할 수 있다는 사실이 곧 권한 상승 경로가 된다.

권한은 `user_roles`에 `(user_id, role)` 행이 존재하는지로 판정한다. 행이 없는 사용자는 일반
사용자다. 이 테이블에는 관리자만 INSERT·DELETE할 수 있다.

### 2. 관리자 판정 함수를 `SECURITY DEFINER`로 만든다

`user_roles`의 RLS 정책은 `is_admin()`을 호출한다. 만약 `is_admin()`이 호출자 권한으로
`user_roles`를 읽으면 그 읽기에 다시 RLS 정책이 적용되고, 그 정책이 또 `is_admin()`을 호출해
무한 재귀에 빠진다.

`SECURITY DEFINER`로 소유자(postgres) 권한에서 실행하면 RLS를 우회해 읽으므로 재귀가 끊긴다.
이것이 Supabase가 권장하는 표준 해법이다.

모든 `SECURITY DEFINER` 함수에 `set search_path = ''`를 지정하고 모든 객체를 스키마까지 적어
호출자가 동명의 가짜 객체를 심어 함수 동작을 가로채는 공격을 막는다.

### 3. 승인 상태 보호는 RLS가 아니라 BEFORE 트리거가 맡는다

RLS의 `WITH CHECK` 식은 `OLD` 행을 참조할 수 없다. 그래서 "본인 프로필 수정" 정책
(`USING (id = auth.uid())`)만으로는 사용자가 자기 `status`를 `active`로 바꾸는 것을 막지 못한다.
정책 입장에서는 그 행이 여전히 본인 행이기 때문이다.

컬럼 단위 `GRANT`로도 해결되지 않는다. 관리자 역시 `authenticated` 역할로 접속하므로,
`status` 컬럼의 UPDATE 권한을 회수하면 관리자의 승인 처리까지 막힌다.

따라서 `profiles`에 BEFORE UPDATE 가드 트리거를 두고 `OLD`와 `NEW`를 비교해,
보호 컬럼(`status`, 상태 시각들, `email`)이 바뀌었는데 호출자가 관리자도 서비스 컨텍스트도
아니면 `42501`로 거부한다.

### 4. 가드 트리거 함수는 의도적으로 `SECURITY INVOKER`다

가드 트리거는 `current_user`로 서비스 컨텍스트(`postgres`, `service_role`, `supabase_admin`)를
판별한다. 이 함수를 `SECURITY DEFINER`로 만들면 `current_user`가 항상 소유자인 `postgres`가 되어
검사가 무조건 참이 되고 가드 전체가 무력화된다.

이 성질은 눈에 잘 띄지 않아 나중에 무심코 `security definer`를 붙이기 쉽다.
`tests/migration-invariants.test.mjs`에 이를 감시하는 테스트를 두었다.

관리자 수 집계는 RLS 우회가 필요하므로 `count_admins()`로 분리해 그것만 `SECURITY DEFINER`로 둔다.

### 5. 감사 로그는 애플리케이션이 아니라 트리거가 남긴다

애플리케이션 코드가 로그를 남기는 구조는 호출을 빠뜨릴 수 있고, 빠뜨린 사실이 드러나지 않는다.
상태 변경·역할 부여·설정 변경이 일어나는 자리에서 AFTER 트리거가 직접 기록한다.

`authenticated` 역할에는 `admin_audit_logs`의 INSERT·UPDATE·DELETE 권한을 주지 않고 정책도
만들지 않는다. 기록은 `SECURITY DEFINER` 트리거만 할 수 있으므로 사실상 append-only다.

행위자 참조는 `on delete set null`로 둔다. 사용자가 탈퇴해도 감사 기록이 남아야 하기 때문이다.

### 6. 승인 설정 조회 실패는 "승인 필요"로 처리한다

`handle_new_user()`는 `app_settings.require_user_approval`을 읽어 초기 상태를 정한다.
행이 없거나 읽지 못하면 `coalesce(..., true)`로 `pending`이 된다. 설정 누락이 곧 무제한 가입
허용으로 이어지지 않게 하기 위해서다.

설정을 `false`로 바꿔도 이 트리거는 그 이후 신규 가입자에게만 실행되므로, 이미 `pending`인
사용자는 자동 승인되지 않는다. 운영 정책과 구현이 자연히 일치한다.

### 7. `app_role` 열거형에 값을 하나만 둔다

현재 특별 권한이 필요한 역할은 `admin` 하나뿐이다. 쓰이지 않는 값을 미리 넣으면
"행이 없는 사용자"와 "member 행이 있는 사용자"의 차이가 모호해진다.

역할이 늘어나면 `ALTER TYPE ... ADD VALUE`를 담은 마이그레이션으로 확장한다.
PostgreSQL 12부터는 트랜잭션 안에서도 이 구문을 실행할 수 있어 Supabase 마이그레이션과 함께 쓸 수 있다.

### 8. `FORCE ROW LEVEL SECURITY`는 쓰지 않는다

소유자에게까지 RLS를 적용하면 가입 트리거와 감사 로그 트리거 같은 `SECURITY DEFINER` 함수가
동작하지 못한다. RLS는 활성화하되 강제하지는 않는다.

### 9. 권한은 GRANT와 RLS 두 겹으로 제한한다

RLS는 접근 가능한 행을 거르고, `GRANT`는 애초에 수행 가능한 동작 자체를 제한한다.
Supabase는 `public` 스키마의 새 테이블에 기본 권한을 부여하므로, 각 테이블에서 `anon`과
`authenticated`의 권한을 모두 회수한 뒤 필요한 것만 다시 부여한다.

`anon`에게는 어떤 테이블 권한도 부여하지 않는다.

## 결과

- 일반 사용자는 자기 승인 상태와 역할을 바꿀 수 없다. RLS, GRANT, 가드 트리거 세 겹이 막는다.
- 관리자 판정에 이메일 문자열이 전혀 등장하지 않는다. 프런트엔드는 물론 SQL에도 없다.
- 승인·역할·설정 변경은 빠짐없이 감사 로그에 남는다.
- 마이그레이션만으로는 관리자가 한 명도 없다. 최초 관리자 지정은 `docs/ADMIN_BOOTSTRAP.md`의
  별도 절차를 따른다.

## 남겨둔 것

- 보호된 앱 데이터(`sources`, `captures`, `projects`)의 RLS 정책. 해당 테이블을 만드는 단계에서
  `is_active_user()`를 사용해 같은 마이그레이션 안에 함께 작성한다.
- 관리자 승인·거절 처리를 위한 서버 함수 또는 Server Action. 6단계에서 작성한다.
- `auth.users`의 이메일이 변경되었을 때 `profiles.email`을 동기화하는 처리. 필요해지는 시점에 추가한다.
