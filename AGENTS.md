# ThreadMark 작업 지침

이 문서는 ThreadMark 저장소에서 작업하는 사람과 AI 도구가 함께 읽는다.
`CLAUDE.md`도 이 문서를 가리킨다.

## 1. 프로젝트

연구·수업·독서에서 만난 자료와 생각을 **Source–Capture–Project** 로 연결해 기록하는
개인 지식 관리 서비스다.

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/dskim-git/threadmark (public) |
| 배포 | https://thread-mark.vercel.app |
| 스택 | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Supabase, Vercel |
| 설계 문서 | `docs/THREADMARK_BLUEPRINT.md`, `docs/THREADMARK_PRIVACY_AND_DELETION_DRAFT.md` |
| 결정 기록 | `docs/decisions/`, `docs/VERIFICATION.md`, `docs/ADMIN_BOOTSTRAP.md` |

**설계 문서가 최우선 기준이다.** 문서와 코드가 어긋나면 임의로 정하지 말고 먼저 알린다.
문서에 없는 기능을 추측해서 만들지 않는다.

## 2. 작업 방식

사용자가 정한 규칙이다. 지키지 않으면 작업을 되돌려야 한다.

- 개발 순서 중 **정확히 한 단계만** 구현하고, 검증 결과를 보고한 뒤 멈춘다.
  "다음 단계 진행" 승인을 받고 넘어간다.
- 단계 시작 전에 `git status`와 관련 설계 문서를 먼저 읽는다.
- **원격 DB 변경, 배포, `git commit`, `git push`는 실행 전에 반드시 승인받는다.**
  `supabase db push` 전에는 항상 `--dry-run`을 먼저 보여준다.
- `.env.local`을 읽어 화면에 출력하거나 수정하지 않는다.
- 파괴적 명령(`db reset`, 데이터 삭제, 스키마 초기화)은 실행하지 않는다.
- 각 단계가 끝나면 `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`를 모두 실행한다.
- 보고 형식: 구현 내용 / 파일 / 보안 결정 / 검사 결과 / 확인할 사항 / 다음 단계 /
  승인 필요한 명령 / 커밋 메시지 제안.

### 설계 문서에 값이 없을 때

열거형 값이 정의되어 있지 않으면 **지금 쓰이는 값 하나만** 만들고 주석에 이유를 남긴다.
`source_status`, `project_status`, `visibility`, `app_role`이 그렇게 되어 있다.
쓰지 않을 값을 미리 넣으면 "이게 무슨 뜻이었지" 하는 혼란만 남는다.
PostgreSQL 12부터 `ALTER TYPE ... ADD VALUE`는 트랜잭션 안에서도 되므로 나중에 늘리기 쉽다.

## 3. 명령

```bash
npm run dev       # 개발 서버
npm run lint
npx tsc --noEmit
npm test          # node --test, 156개
npm run build
npm run db:types  # 원격 스키마에서 타입 재생성. 마이그레이션 적용 후 반드시 실행
```

Supabase CLI는 링크되어 있다. `supabase db push`, `migration list`, `config diff`를 쓴다.
**Docker와 psql이 없다.** 로컬 Supabase나 `db dump`는 쓸 수 없고, SQL 검증은
대시보드 SQL Editor에서 사람이 실행한다.

## 4. 현재 상태

전체 개발 순서 16단계 중 **11단계까지 완료**, 12단계 진행 중이다.

| 단계 | 상태 |
| --- | --- |
| 1~8. 인증·가입 승인 기반, RLS, 관리자 화면, 권한 테스트 | 완료 |
| 9. Source | 완료 |
| 10. Capture | 완료 |
| 11. Project와 다대다 연결 | 완료 |
| 12-A. Drive 연결·해제·폴더 | 완료 |
| **12-B. 파일 업로드와 Source 연결** | **코드 완료, 동작 확인 중** |
| 12-C. Google Picker | 예정 |
| 13. YouTube·TMDB·Kakao 메타데이터 | 예정 |
| 14. Claude 기반 AI | 예정 |
| 15. 개인정보·계정 삭제 | 예정 |
| 16. 최종 보안 점검과 배포 | 예정 |

12-B는 아직 커밋되지 않았다. `git push`는 한 번도 하지 않았다.

## 5. 보안 원칙

이 프로젝트에서 가장 중요한 부분이다. 새 기능을 만들 때마다 다시 확인한다.

1. **소유자 확인과 승인 상태 확인을 함께 건다.**
   `owner_id = auth.uid() and public.is_active_user()`.
   소유자만 보면 정지된 계정이 자기 자료에 계속 접근한다.
2. **`owner_id`를 클라이언트가 정하지 못한다.** 컬럼 기본값 `auth.uid()`와 트리거가 채운다.
3. **관리자 판정은 `user_roles`로만 한다.** 이메일 문자열 비교를 코드에 넣지 않는다.
   `tests/migration-invariants.test.mjs`가 `src/`와 `supabase/migrations/`를 검사한다.
4. **승인 상태는 JWT가 아니라 데이터베이스에서 읽는다.** 토큰에 담으면 관리자가
   계정을 정지시켜도 만료 전까지 적용되지 않는다. (ADR 0002)
5. **레이아웃의 확인만 믿지 않는다.** Next.js 레이아웃은 형제 경로 이동 시 다시
   실행되지 않을 수 있다. 각 페이지와 Server Action이 직접 확인한다.
6. **막는 것과 여는 것을 모두 검사한다.** 막는 것만 보면 과잉 차단을 놓친다.
7. **모르면 거부한다.** 조회 실패, 값 없음, 예상 밖 값은 전부 접근 거부.
8. `proxy.ts`에는 인가 판단을 두지 않는다. 세션 갱신만 한다.
9. 없는 자료와 남의 자료를 구분하지 않는다. 둘 다 404.

## 6. 반복해서 부딪힌 함정

같은 곳에서 두 번 막히지 않도록 남긴다. 모두 실제로 겪은 것이다.

### 데이터베이스

- **PostgREST는 갱신을 항상 `RETURNING`으로 감싼다.** PostgreSQL은 `RETURNING`이 있는
  `UPDATE`에 조회 정책을 갱신된 새 행에도 적용한다. 그래서 **갱신 결과가 조회 정책을
  벗어나게 만드는 갱신은 PostgREST로 할 수 없다.** 삭제 표시가 그 경우이며
  `soft_delete_*()` 함수가 이 때문에 존재한다. `.select()` 유무와 무관하다.
- **외래키 제약은 RLS를 보지 않는다.** 다른 표의 행을 가리키는 열은 참조 대상이
  내 것인지 트리거에서 따로 확인해야 한다. 연결 테이블은 **양쪽 모두** 확인한다.
- **같은 시점의 트리거는 이름 순서대로 실행된다.** 순서에 의존하는 일은 한 함수 안에 둔다.
  소유자 확정과 참조 확인을 나눠 두면 확인이 먼저 돌아 아직 정해지지 않은 값을 본다.
- **RLS의 `WITH CHECK`는 `OLD` 행을 참조할 수 없다.** "본인 행 수정"과
  "본인 상태 변경"을 구분하려면 BEFORE 트리거가 필요하다.
- **기본 권한에 기대지 않는다.** 새 표를 만들면 누가 무엇을 할 수 있는지 마이그레이션에
  전부 적는다. `google_drive_connections`에서 `service_role` 부여를 빠뜨려
  서버조차 읽지 못한 적이 있다.
- **`SECURITY DEFINER` 함수는 `set search_path = ''`와 스키마 완전 수식을 쓴다.**
  반대로 `current_user`로 서비스 컨텍스트를 판별하는 가드 함수는 반드시
  `SECURITY INVOKER`여야 한다. DEFINER면 `current_user`가 항상 소유자가 되어 무력화된다.
- **Supabase SQL Editor는 스크립트 전체를 한 트랜잭션으로 실행한다.**
  `set_config(..., true)`로 설정한 `request.jwt.claims`가 다음 DO 블록까지 살아남는다.
  자료를 만드는 검사는 삽입 전에 클레임을 비운다.

### 인증과 외부 연동

- **Server Action의 리디렉션 주소는 HTTP 헤더로 전달된다. ASCII만 가능하다.**
  한글 메시지를 주소에 그대로 넣으면 응답이 깨진다. `redirectWithQuery` 헬퍼로 인코딩한다.
- **Supabase는 `redirectTo`가 Redirect URL 허용 목록에 없으면 오류 없이 Site URL로
  돌려보낸다.** 로그인이 조용히 실패한다. 그래서 공급자에게 넘기는 주소는 고정하고
  돌아갈 경로는 쿠키로 전달한다.
- **Google OAuth의 리디렉션 URI는 글자 단위로 비교하며 와일드카드가 없다.**
  개발 포트가 바뀌면 그 주소를 Google Cloud에 등록해야 한다.
  개발 환경에서는 등록해야 할 주소를 서버 로그에 출력한다.
- **Google 동의 화면은 브랜드 인증 전까지 앱 이름 대신 리디렉션 URI의 도메인을 보여준다.**
  `supabase.co`는 소유 증명이 불가능하므로 자체 도메인 없이는 해결되지 않는다.
  블루프린트 4.3절에 기록했다.
- **resumable 업로드 자리를 서버에서 잡을 때 `Origin` 헤더를 함께 보낸다.**
  Google은 그 출처를 기억해 두었다가 그 주소에서 오는 브라우저 요청만 받아준다.
  서버끼리 주고받을 때는 필요 없는 헤더라 정리하다 없애기 쉬운데, 없으면 자리는
  만들어지고 브라우저 업로드만 CORS에서 막혀 진행률이 0%에서 멈춘다.
  `createResumableUploadSession()`에 있다. 2026-09-22에 3001번에서 통과를 확인했다.

### 도구

- **Node 테스트 러너는 상대 경로 import에 확장자가 필요하다.** 순수 모듈끼리
  참조할 때는 `./types.ts`처럼 확장자를 쓴다. `tsconfig.json`에
  `allowImportingTsExtensions`가 켜져 있다.
- **검사는 데이터 상태에 기대지 않는다.** "자기 상태를 바꿀 수 없다"를 확인할 때
  항상 `active`로 시도하면 이미 `active`인 계정에서는 값이 바뀌지 않아 트리거가
  개입하지 않는다. 지금 값을 읽어 **다른 값**으로 시도해야 한다.

## 7. 검증 자산

`docs/VERIFICATION.md`에 전체 절차가 있다. 요약하면,

| 대상 | 방법 |
| --- | --- |
| 규칙이 무너지지 않았는지 | `npm test` (156개, DB 없이 실행) |
| 스키마와 운영 불변조건 | `supabase/verify/001_verify_auth_approval.sql` (23항목) |
| 관리자 부트스트랩 | `supabase/verify/002_verify_first_admin.sql` (8항목) |
| RLS 격리와 권한 | `supabase/verify/003_rls_isolation_test.sql` (40검사) |

003은 실제 역할로 전환해 차단되어야 할 동작을 시도한다. 새 표를 만들면 여기에
격리 검사를 추가한다. 검사 19와 27은 승인되지 않은 계정이 있을 때만 실행되며,
결과 표 마지막 열에 실행 여부가 표시된다.

`SECURITY DEFINER` 함수를 추가하면 001의 허용 목록에 넣고 왜 필요한지 적는다.
그 검사는 예상 밖의 DEFINER 함수를 잡아내려고 있다.

## 8. 개발 환경

- 개발 서버는 **3001번**에서 뜬다. 3000번은 다른 앱이 쓰고 있다.
  Supabase Redirect URLs와 Google OAuth 리디렉션 URI 모두 3001이 등록되어 있어야 한다.
- 사용자 3명(관리자 1명), 신규 가입 승인 필요 설정은 `true`.
- 최초 관리자는 `docs/ADMIN_BOOTSTRAP.md` 절차로 지정했다.
- Google Cloud OAuth 클라이언트는 둘이다. 로그인용(`ThreadMark Auth`, Supabase에 등록)과
  Drive용(`ThreadMark Local Web`, 앱이 직접 사용). 한쪽 secret이 유출되어도
  다른 쪽에 번지지 않게 하려는 것이다.
