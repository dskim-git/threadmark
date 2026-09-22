# ThreadMark (TM) Master Blueprint

> 읽고, 남기고, 연결하다.

이 문서는 ThreadMark 개발의 제품 설계서이자 VSCode/AI 코딩 지침이다. 구현을 시작하거나 구조를 변경하기 전에 전체 문서를 읽고, 명시된 핵심 원칙과 범위를 우선한다.

---

## 1. 제품 정의

ThreadMark는 논문, 책, 웹사이트, 음악, YouTube 영상, 영화·드라마·OTT 콘텐츠, PDF, 이미지, 손글씨, 음성 및 일상에서 발견한 생각을 출처와 위치 정보와 함께 저장하고, 프로젝트별로 연결하여 연구·수업·연수에 다시 활용하도록 돕는 개인 지식 작업 공간이다.

서비스명은 **ThreadMark**, 약칭은 **TM**으로 표기한다.

- 공식 GitHub 저장소: https://github.com/dskim-git/threadmark
- 저장소 공개 범위: public
- Vercel Production URL: https://thread-mark.vercel.app/

### 핵심 사용자 가치

1. 자료를 발견한 순간 빠르게 저장한다.
2. 기억할 부분을 페이지, 타임코드, 이미지 영역 등 정확한 위치와 함께 기록한다.
3. 기록을 프로젝트와 연결한다.
4. 키워드 검색과 의미 검색으로 다시 찾는다.
5. 근거와 원출처를 잃지 않은 상태로 논문, 수업 및 연수 자료에 활용한다.

### 핵심 도메인

- **Source**: 논문, 책, 웹사이트, 영상, 이미지 등 기록의 출처가 되는 자료
- **Capture**: Source에서 기억할 인용, 요약, 생각, 질문, 아이디어 또는 독립 메모
- **Project**: 논문, 연구보고서, 수업, 연수 등 Source와 Capture를 활용할 목적

모든 기능은 이 세 개념을 중심으로 설계한다. 자료 유형이 늘어나더라도 핵심 구조를 분리하거나 중복 테이블을 무분별하게 추가하지 않는다.

---

## 2. 절대 원칙

### 2.1 MathLab 완전 분리

- ThreadMark는 MathLab과 동일한 Supabase 프로젝트를 절대 사용하지 않는다.
- ThreadMark 전용 Supabase 프로젝트를 새로 만든다.
- Supabase URL, publishable key, secret key, 데이터베이스, Auth, Storage bucket을 공유하지 않는다.
- ThreadMark의 migration이나 RLS 변경이 MathLab에 적용될 가능성이 없어야 한다.
- ThreadMark의 Vercel 프로젝트와 환경변수도 MathLab과 분리한다.
- 무료 Supabase 프로젝트 슬롯을 사용할 수 없다면 MathLab 프로젝트를 공유하는 방식으로 우회하지 말고 작업을 중단한 뒤 대안을 결정한다.

### 2.2 저장소 역할 분리

- Supabase Postgres: 사용자, Source, Capture, Project, 태그, 외부 파일 ID 및 검색용 데이터
- Supabase Auth: 회원가입, 로그인 및 사용자 식별
- Google Drive: 사용자 PDF, 이미지, 그림, 음성 등 실제 파일의 기본 저장소
- Supabase Storage: MVP의 기본 파일 저장소로 사용하지 않는다. 향후 명시적 결정이 있을 때만 선택적 fallback으로 추가한다.
- Vercel: Next.js 웹앱과 서버 Route Handler 배포

### 2.3 보안 우선

- 모든 사용자 소유 데이터에는 `owner_id`를 둔다.
- 외부에 노출되는 모든 Supabase 테이블에 RLS를 적용한다.
- 브라우저에서 전달된 `owner_id`를 신뢰하지 않고 인증 세션의 `auth.uid()`를 사용한다.
- `SUPABASE_SECRET_KEY`, Google OAuth client secret, AI API key, TMDB key 등 비밀값을 클라이언트 번들에 포함하지 않는다.
- Google refresh token은 평문으로 저장하지 않는다.
- refresh token은 PostgREST에 노출되지 않는 private schema 또는 서버 전용 저장 영역에 암호화하여 보관한다.
- Google Drive 전체 접근 권한인 `drive` 또는 `drive.readonly`를 기본 요청하지 않는다.
- Google Drive는 최소 권한인 `https://www.googleapis.com/auth/drive.file`과 Google Picker를 우선한다.
- 비공개 Drive 파일을 공개 공유 링크로 바꾸어 표시하지 않는다.

### 2.4 원문과 사용자 생각의 구분

- 직접 인용, 번역, 요약, 바꾸어 쓰기, 사용자의 해석을 데이터와 UI에서 구분한다.
- AI가 생성한 텍스트는 사용자 작성 텍스트와 구분한다.
- AI 요약이나 번역을 연구 근거 자체로 취급하지 않는다.
- 논문 관련 AI 결과에는 가능한 경우 Source, 페이지, 원문 Capture를 함께 표시한다.

### 2.5 기본 공개 범위

- 모든 Source, Capture, Project 및 파일은 기본적으로 `private`이다.
- 메모의 공개 여부와 원본 파일의 공개 여부는 별도로 관리한다.
- 저작권이 있는 PDF는 메모를 공개하더라도 자동 공개하지 않는다.

### 2.6 GitHub 저장소 공개 범위

- ThreadMark GitHub 저장소는 프로젝트 결정에 따라 **public**으로 운영한다.
- 공식 저장소는 `https://github.com/dskim-git/threadmark`이다.
- 저장소가 public인지 private인지와 무관하게 API 및 인증 관련 비밀값을 Git에 저장하지 않는다.
- `.env`, `.env.local`, `.env.*.local`, OAuth client secret, Supabase secret key, AI API key, token 암호화 키를 절대 커밋하지 않는다.
- `.env.example`에는 변수 이름과 설명만 기록하고 실제 값은 넣지 않는다.
- `.gitignore`에 환경변수 파일 차단 규칙을 프로젝트 생성 직후부터 적용한다.
- GitHub secret scanning을 활성화하고 push 전에 비밀값 검사를 수행한다.
- 인증·RLS·Drive OAuth가 완성되기 전에도 공개된 코드는 누구나 검토할 수 있다고 가정하여 최소 권한과 서버 전용 비밀값 원칙을 지킨다.
- 실수로 비밀값을 커밋했다면 파일 삭제만으로 끝내지 않고 해당 키를 즉시 폐기·재발급한다.
- public 저장소라고 해서 자동으로 오픈소스 사용 권한이 부여되는 것은 아니므로, 외부 재사용을 허용할 시점에 `LICENSE`를 별도로 결정한다.

---

## 3. 권장 기술 스택

- Next.js App Router + TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Supabase Auth + Postgres + RLS
- Google Drive API v3
- Google Picker API
- PDF.js 기반 PDF 뷰어
- Zod 기반 입력 검증
- React Hook Form 기반 폼
- TanStack Query는 클라이언트 캐시가 실제로 필요한 화면에만 선택적으로 사용
- pgvector는 AI 의미 검색 단계에서 추가
- Vercel 배포
- Vitest 또는 Jest, Playwright
- ESLint, TypeScript strict mode

### 코드 작성 원칙

- Server Component를 기본으로 하고 상호작용이 필요한 부분만 Client Component로 만든다.
- 외부 API 호출과 비밀 키 사용은 서버 Route Handler 또는 서버 함수에서 처리한다.
- 기능별 코드는 `features` 또는 명확한 도메인 단위로 분리한다.
- 페이지 컴포넌트에 비즈니스 로직과 외부 API 호출을 직접 누적하지 않는다.
- DB 변경은 Supabase migration 파일로 관리한다.
- 구현 후 `lint`, `typecheck`, 테스트, production build를 실행한다.
- 임시 mock을 실제 구현처럼 남기지 않는다.
- 파일 전체를 수정할 때 기존 사용자 변경사항을 보존한다.

---

## 4. 사용자와 인증

### 4.1 인증 방식

초기 지원:

- Google 로그인
- 이메일 Magic Link

Google 로그인과 Google Drive 연결은 개념적으로 분리한다. 사용자가 이메일로 로그인하더라도 나중에 Drive를 연결할 수 있어야 하며, 로그인했다고 Drive 권한이 자동으로 부여되었다고 가정하지 않는다.

### 4.2 사용자 상태

- 프로필
- 가입일
- 선호 언어
- 기본 번역 대상 언어
- 시간대
- Google Drive 연결 상태
- Drive 루트 폴더 ID
- 최근 동기화 시각
- 사용자별 기능 설정

### 4.3 Google 로그인 설정 기록

Google 로그인은 Supabase Auth가 처리하고 Google Drive 연결은 앱이 직접 처리한다.
두 흐름은 서로 다른 OAuth client를 사용한다. 한쪽의 client secret이 유출되어도
다른 쪽 연동에 영향이 가지 않게 하기 위해서다. 10.6절에 기록한 client는 Drive 전용이다.

- OAuth client 이름: `ThreadMark Auth`
- 애플리케이션 유형: 웹 애플리케이션
- 승인된 리디렉션 URI: `https://<Supabase 프로젝트 ref>.supabase.co/auth/v1/callback`
- client secret 보관 위치: Supabase 대시보드 Authentication > Providers > Google
- 로그인 단계에서 Drive scope, offline 접근 및 refresh token을 요구하지 않는다.

Supabase Auth URL 설정:

- Site URL: `https://thread-mark.vercel.app`
- Redirect URLs: `http://localhost:3000/**`, `https://thread-mark.vercel.app/**`

앱 콜백 경로는 `/auth/callback`이며 구현 위치는 `src/app/auth/callback/route.ts`다.
로그인 후 돌아갈 경로는 쿠키로 전달한다. 이 값을 `redirectTo`의 쿼리 문자열에 실으면
공급자에게 넘기는 주소가 요청마다 달라져 Supabase의 Redirect URL 허용 목록과 맞추기 어렵고,
맞지 않으면 Supabase가 오류 없이 Site URL로 되돌려 보내 로그인이 조용히 실패한다.
돌아갈 경로는 같은 출처의 경로만 통과시켜 오픈 리디렉션을 차단한다.

개발 중에는 포트가 바뀌면 Redirect URLs에 해당 주소를 추가해야 한다.
개발 환경에서는 등록이 필요한 주소를 서버 로그에 출력한다.

#### 동의 화면에 표시되는 이름 (미해결)

Google은 브랜드 인증을 통과하기 전까지 앱 이름 대신 리디렉션 URI의 도메인을 표시한다.
로그인 콜백이 Supabase 주소이므로 사용자에게는 `<프로젝트 ref>.supabase.co`가 보인다.
브랜드 인증은 승인된 도메인 전부를 Google Search Console에서 소유 증명해야 하는데
`supabase.co`는 증명할 수 없다. Google Cloud에서 앱 이름만 바꿔서는 해결되지 않는다.

`ThreadMark`로 표시하려면 자체 도메인과 Supabase Custom Domain 부가 기능이 필요하다.
월 고정 비용이 발생하므로 실제 사용자를 받기 시작하는 시점에 결정한다.
그때까지는 Google Auth Platform의 Branding에 앱 이름·지원 이메일·홈페이지를 채워둔다.

OAuth 동의 화면 설정은 클라이언트별이 아니라 Google Cloud 프로젝트 전체에 적용된다.
12단계에서 `drive.file` 범위를 추가하면 심사 대상이 되므로, 그 전에 앱을 Production으로
게시하지 않는다.

---

## 5. Source 모델

### 5.1 Source 유형

```text
paper       논문
book        책
website     웹사이트
music       음악·앨범·공연 음원
youtube     YouTube 영상
media       영화·드라마·OTT 콘텐츠
pdf         일반 PDF
image       이미지
drawing     손글씨·그림
audio       음성
note        출처 없는 독립 메모
```

### 5.2 공통 필드

- `id`
- `owner_id`
- `type`
- `title`
- `subtitle`
- `description`
- `thumbnail_url`
- `canonical_url`
- `original_url`
- `visibility`
- `status`
- `metadata` JSONB
- `created_at`
- `updated_at`
- `deleted_at`

`metadata`는 공급자 응답을 임시로 보관하는 데 사용할 수 있지만, 검색·정렬·관계 설정에 중요한 필드는 정규 컬럼이나 유형별 프로필 테이블에 둔다.

### 5.3 외부 식별자

`source_external_ids`

- `source_id`
- `provider`: crossref, openalex, kci, riss, kakao_book, musicbrainz, spotify, apple_music, youtube, tmdb, google_drive 등
- `external_id`
- `metadata_snapshot`
- `last_synced_at`
- `sync_status`

하나의 Source가 여러 공급자의 식별자를 가질 수 있게 한다.

---

## 6. Capture 모델

### 6.1 Capture 유형

- 직접 인용
- 번역
- 요약
- 바꾸어 쓰기
- 나의 해석
- 질문
- 반론
- 활용 아이디어
- 후속 할 일
- 일반 메모
- 손글씨
- 음성 메모

### 6.2 공통 필드

- `id`
- `owner_id`
- `source_id` nullable
- `capture_type`
- `content`
- `original_text`
- `translated_text`
- `translation_language`
- `translation_provider`
- `translation_model`
- `translated_at`
- `ai_generated`
- `verification_status`
- `locator` JSONB
- `created_at`
- `updated_at`
- `deleted_at`

`translation_model`과 `translated_at`은 13-C에서 더했다. 9.4절이 "번역 공급자, 모델,
언어, 생성 시각을 기록한다"고 하는데 이 목록에 모델과 시각을 담을 자리가 없었다.
공급자와 모델을 한 칸에 몰아 적으면 나중에 모델별로 찾아볼 수 없고, 생성 시각을
`updated_at`으로 대신하면 번역문을 고치는 순간 언제 만들어진 번역인지 알 수 없게 된다.

`verification_status`는 `user_written`, `machine_generated`, `user_edited` 셋이다.
9.4절의 "수정본과 AI 원본을 구분할 수 있게 한다"를 맡는 값이고, 기계 번역문을 고치면
데이터베이스 트리거가 `user_edited`로 옮긴다. 화면이 같이 보내주기를 기대하지 않는다.

### 6.3 위치 정보 예시

PDF:

```json
{
  "kind": "pdf-selection",
  "page": 17,
  "selectedText": "학생의 오류는...",
  "contextBefore": "...",
  "contextAfter": "...",
  "rects": [
    {"x": 0.18, "y": 0.32, "width": 0.54, "height": 0.04}
  ],
  "fileChecksum": "..."
}
```

YouTube:

```json
{
  "kind": "video-time",
  "startSeconds": 754,
  "endSeconds": 802
}
```

음악:

```json
{
  "kind": "music-time",
  "startSeconds": 68,
  "endSeconds": 94,
  "section": "2절 후렴",
  "provider": "spotify"
}
```

책:

```json
{
  "kind": "book-page",
  "page": 125,
  "chapter": "3장",
  "section": "오류의 교육적 활용"
}
```

이미지:

```json
{
  "kind": "image-region",
  "x": 0.32,
  "y": 0.41,
  "width": 0.26,
  "height": 0.12
}
```

좌표는 픽셀이 아니라 0~1 사이의 정규화된 비율로 저장한다.

---

## 7. Project 모델

- Project는 논문, 연구보고서, 수업, 연수, 웹앱 개발 등 활용 목적을 나타낸다.
- 하나의 Source와 Capture는 여러 Project에 연결할 수 있다.
- 논문 Source의 활용 방식은 프로젝트마다 달라질 수 있으므로 `paper_project_uses`를 별도로 둔다.

필드 예시:

- 프로젝트명
- 프로젝트 유형
- 설명
- 상태
- 시작일·종료일
- 대표 색상
- 공개 범위
- 연구 질문
- 목표 산출물

---

## 8. 논문 기능

### 8.1 논문 메타데이터

- 제목
- 저자
- 발행 연도
- 학술지명
- 권·호
- 페이지
- DOI
- ISSN
- 초록
- 키워드
- 원문 URL
- PDF 파일
- 원문 언어
- APA 7판 참고문헌
- 사용자 수정 참고문헌

APA 문자열만 저장하지 않는다. 구조화된 메타데이터로 APA를 생성하고 사용자가 수정한 override를 별도로 보관한다.

### 8.2 논문 분석 템플릿

#### 발견 맥락

- 발견 경로
- 발견 이유와 첫인상
- 읽는 목적
- 관련 프로젝트
- 읽기 전 예상 관련성

#### 기본 이해

- 예상 독자
- 연구 주제
- 연구 목적
- 연구 문제 또는 연구 질문
- 주요 개념
- 이론적 배경

#### 연구 설계

- 연구 유형
- 연구 방법
- 연구 참여자·표본
- 자료 수집 방법
- 분석 방법
- 연구 기간과 맥락

#### 주요 내용

- 핵심 주장
- 주요 연구 결과
- 논의
- 연구의 의미
- 교육적·실천적 시사점
- 제한점
- 후속 연구 및 제언

#### 나의 활용

- 나의 해석
- 내 연구의 어느 부분에서 사용할지
- 뒷받침할 주장
- 동의·반론
- 직접 인용 후보
- 바꾸어 인용할 내용
- 연결되는 다른 자료
- 사용할 때의 주의점

### 8.3 프로젝트별 논문 활용

`paper_project_uses`

- `paper_source_id`
- `project_id`
- `planned_section`
- `usage_intent`
- `interpretation`
- `citation_plan`
- `cautions`
- `status`

### 8.4 참고문헌 관계

`source_relations`

- 인용함
- 인용됨
- 참고문헌에서 발견
- 유사 연구
- 상반된 결과
- 이론적 배경
- 연구 방법 참고
- 후속 읽기

아직 등록하지 않은 논문은 `reading_candidate`로 저장한 뒤 정식 Source로 전환할 수 있게 한다.

### 8.5 논문 검색 허브

검색어를 입력하고 다음 사이트를 새 탭으로 여는 바로가기를 제공한다.

- KCI
- RISS
- Google Scholar
- DBpia
- ScienceON
- ERIC
- Crossref
- OpenAlex

MVP는 사이트 검색 바로가기를 제공한다. Google Scholar 비공식 스크래핑에 의존하지 않는다. KCI와 RISS API도 공식 이용 조건이 확인되기 전에는 핵심 기능의 의존성으로 삼지 않는다.

지원할 논문 등록 방식:

- DOI 입력
- 논문 URL 입력
- BibTeX 붙여넣기
- RIS 가져오기
- PDF 업로드 또는 Drive 선택
- 수동 입력

---

## 9. PDF 뷰어, 위치 기억 및 번역

### 9.1 PDF 표시

- PDF.js를 사용한다.
- 데스크톱에서는 좌측 PDF, 우측 Capture 패널의 분할 화면을 사용한다.
- 모바일에서는 `PDF`와 `메모` 탭을 전환한다.
- 마지막 열람 페이지와 확대율을 사용자별로 기억한다.
- 파일은 Google Drive에서 읽어 브라우저 메모리의 PDF.js로 전달한다.
- Google Drive preview iframe만으로 구현하지 않는다. 교차 출처 iframe 내부의 선택 텍스트와 좌표에 앱이 접근할 수 없기 때문이다.

### 9.2 Google Drive PDF 전달

- 브라우저에 장기 refresh token을 전달하지 않는다.
- 서버가 사용자 세션을 확인한 후 Drive 파일을 스트리밍한다.
- 가능하면 HTTP Range 요청을 전달하여 큰 PDF를 효율적으로 읽는다.
- 앱 서버나 브라우저의 임시 데이터는 영구 저장소로 취급하지 않는다.
- Drive 파일 ID, MIME type, size, checksum, modified time을 DB에 저장한다.
- 파일이 교체된 경우 checksum을 비교하여 기존 annotation 위치가 달라질 수 있음을 표시한다.

### 9.3 텍스트 PDF 동작 기대치

공식 논문 사이트에서 내려받은 born-digital PDF는 일반적으로 다음 기능이 잘 작동할 가능성이 높다.

- 페이지 인식
- 텍스트 드래그 선택
- 선택 문장 복사
- 페이지 번호 기록
- 선택 영역 좌표 기록
- 해당 페이지 재이동
- 선택 문장 번역

그러나 다음 경우에는 오차가 생길 수 있다.

- 스캔 이미지 PDF
- 복사 방지가 적용된 PDF
- 글꼴 인코딩이 비표준인 PDF
- 2단 편집에서 여러 단을 가로질러 선택한 경우
- 수식, 표, 각주, 합자 및 하이픈 처리
- OCR 결과의 문단 순서가 잘못된 경우

따라서 위치 앵커는 `페이지 + 선택 문장 + 주변 문맥 + 좌표 + 파일 checksum`을 함께 저장한다. 좌표만 저장하지 않는다.

### 9.4 부분 번역

사용자가 PDF 텍스트를 선택하면 작은 컨텍스트 메뉴를 표시한다.

```text
[Capture로 저장] [번역] [인용 저장] [내 생각 추가]
```

번역 흐름:

1. 선택한 텍스트와 페이지 정보를 가져온다.
2. 선택된 부분만 서버 번역 API로 전송한다.
3. 원문과 번역문을 나란히 표시한다.
4. 사용자가 `번역과 함께 저장`을 선택하면 Capture로 저장한다.
5. 번역 공급자, 모델, 언어, 생성 시각을 기록한다.

원칙:

- 논문 전체를 자동 전송하지 않는다.
- 기본 대상 언어는 사용자 설정에서 정한다.
- 원문은 수정하지 않는다.
- 기계 번역임을 표시한다.
- 번역 결과는 사용자가 수정할 수 있다.
- 수정본과 AI 원본을 구분할 수 있게 한다.
- 번역 API는 교체할 수 있도록 provider interface로 추상화한다.

초기에는 향후 사용할 생성형 AI API를 짧은 선택 번역에도 재사용할 수 있다. 이후 필요하면 DeepL 또는 Google Cloud Translation을 별도 provider로 추가한다.

### 9.5 OCR

스캔 PDF에 대한 OCR은 MVP 범위에서 제외한다. 텍스트 레이어가 없는 파일을 감지하면 다음 안내를 표시한다.

```text
이 PDF에서는 선택 가능한 텍스트를 찾지 못했습니다.
페이지 메모는 사용할 수 있으며 OCR 기능은 추후 지원됩니다.
```

---

## 10. Google Drive 중심 파일 저장

### 10.1 연결 흐름

1. 사용자가 ThreadMark에 로그인한다.
2. 설정에서 `Google Drive 연결`을 선택한다.
3. 별도의 OAuth 동의 과정을 진행한다.
4. 최소 권한 `drive.file`을 요청한다.
5. 앱이 사용자의 My Drive에 `ThreadMark` 루트 폴더를 생성한다.
6. 루트 폴더 ID를 사용자 설정에 저장한다.
7. 필요한 하위 폴더를 앱이 생성한다.

권장 폴더:

```text
ThreadMark/
  Papers/
  PDFs/
  Images/
  Drawings/
  Audio/
```

물리적 폴더 구조를 Source·Project 관계와 동일하게 만들지 않는다. 한 Source가 여러 Project에 속할 수 있기 때문이다. Drive는 파일 저장, ThreadMark DB는 의미상 분류를 담당한다.

### 10.2 기존 Drive 파일

- Google Picker로 사용자가 직접 파일을 선택한다.
- 앱은 사용자가 선택하거나 앱이 생성한 파일만 접근한다.
- 광범위한 전체 Drive 읽기 권한을 기본 요청하지 않는다.

### 10.3 업로드

- 브라우저에서 선택한 파일을 Google Drive API로 업로드한다.
- 큰 파일은 resumable upload를 사용한다.
- 업로드 성공 후에만 Source와 attachment 상태를 `ready`로 변경한다.
- 업로드 도중 실패한 DB 레코드와 orphan 파일을 정리하는 작업을 둔다.

### 10.4 연결 해제 및 오류

- 사용자가 Drive 권한을 취소할 수 있다.
- 토큰 만료, 권한 취소, 파일 이동·삭제를 구분해 표시한다.
- Drive 파일이 사라져도 Source와 Capture 메타데이터는 유지한다.
- `다시 연결`, `새 파일 연결`, `메타데이터만 유지` 선택지를 제공한다.
- Drive가 연결되지 않아도 URL Source와 텍스트 메모는 사용할 수 있다.

### 10.5 토큰 저장

- access token은 단기 사용한다.
- refresh token은 서버 전용으로 암호화 저장한다.
- 클라이언트가 refresh token 테이블을 select할 수 없어야 한다.
- 암호화 키는 Vercel 환경변수에 저장한다.
- 로그에 token, authorization header, signed URL을 남기지 않는다.

### 10.6 개발·배포용 Google 설정 기록

- OAuth client 이름: `ThreadMark Local Web`
- 애플리케이션 유형: 웹 애플리케이션
- 승인된 JavaScript 원본: `http://localhost:3000`, `http://localhost:3001`, `https://thread-mark.vercel.app`
- 승인된 리디렉션 URI: `http://localhost:3000/api/google-drive/callback`, `http://localhost:3001/api/google-drive/callback`, `https://thread-mark.vercel.app/api/google-drive/callback`
- callback 구현 위치: `src/app/api/google-drive/callback/route.ts`
- Picker API key 이름: `ThreadMark Picker Local`
- 웹사이트 제한: `http://localhost:3000/*`, `http://localhost:3001`, `http://localhost:3001/*`, `https://thread-mark.vercel.app/*`, `https://docs.google.com/*`
- API 제한: Google Picker API, Google Drive API

> **개발 서버는 3001번에서 뜬다.** 3000번은 다른 앱이 쓰고 있다.
> 처음에는 3000번만 등록해 두었는데, Google은 주소를 글자 단위로 비교하며
> 와일드카드를 받지 않는다. 그래서 포트가 다르면 완전히 다른 곳으로 본다.
>
> 이 때문에 두 번 막혔다. 12-A에서는 OAuth 리디렉션이, 12-C에서는 Picker의
> API key가 걸렸다. Picker는 `The API developer key is invalid.`라는 문구를
> 보여주는데, 키 값이 틀렸다는 뜻이 아니라 **그 주소에서는 못 쓴다**는 뜻이다.
> 2026-09-22에 3001번을 모두 추가해 해결했다.
- OAuth scope: `https://www.googleapis.com/auth/drive.file`
- Google Picker App ID로 사용할 Google Cloud 숫자형 프로젝트 번호를 비공개로 확인·기록했다.
- OAuth client secret, API key, 프로젝트 번호 등 환경별 값은 저장소에 커밋하지 않는다.

공식 참고:

- Drive 최소 권한 및 Picker: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- 폴더 생성: https://developers.google.com/workspace/drive/api/guides/folder
- 파일 업로드: https://developers.google.com/workspace/drive/api/guides/manage-uploads

---

## 11. 웹사이트 저장

### 11.1 등록 정보

- URL
- canonical URL
- 페이지 제목
- 사이트명
- 설명
- 작성자
- 게시일
- 저장일
- favicon
- Open Graph 이미지
- 사용자가 작성한 메모
- 프로젝트
- 태그

### 11.2 등록 흐름

```text
URL 붙여넣기
→ 서버에서 안전하게 메타데이터 조회
→ 미리보기 표시
→ 사용자 메모 작성
→ Project와 Tag 연결
→ Source 저장
```

### 11.3 원칙과 보안

- MVP에서는 웹페이지 전체를 복제·보관하지 않는다.
- URL, 공개 메타데이터, 사용자가 직접 입력한 메모와 짧은 선택 인용을 저장한다.
- 메타데이터 조회는 서버에서 수행한다.
- SSRF 방지를 위해 localhost, 사설 IP, link-local 주소, 내부 네트워크 주소를 차단한다.
- 리다이렉트를 제한하고 최종 URL을 검증한다.
- 응답 크기, Content-Type, timeout을 제한한다.
- 로그인이나 유료 구독을 우회하지 않는다.
- 웹페이지가 사라질 수 있으므로 중요한 문장은 Capture에 짧게 보관한다.

### 11.4 후속 기능

- 브라우저 확장 프로그램
- 모바일 공유 메뉴
- 선택 문장 저장
- 읽기 모드 추출
- 링크 상태 확인

---

## 12. 책 기능

- Kakao 책 검색 API를 우선 사용한다.
- Kakao Developers에 `ThreadMark` 앱을 생성하고 REST API 키를 비공개로 확인했다.
- 도서 검색은 서버에서 `GET https://dapi.kakao.com/v3/search/book`으로 호출한다.
- REST API 키는 서버 전용 환경변수에 저장하고 브라우저 코드나 저장소에 노출하지 않는다.
- 카카오 로그인, JavaScript 키, 네이티브 앱 키, 어드민 키는 이 기능에 사용하지 않는다.
- 제목 또는 ISBN으로 검색한다.
- 제목, 저자, 번역자, 출판사, 출판일, ISBN, 소개, 표지 썸네일을 가져온다.
- 교보문고는 공식 공개 API에 의존하지 않는다.
- 교보문고 검색 바로가기와 사용자 입력 상품 URL을 지원한다.
- 서점 페이지를 임의로 스크래핑하지 않는다.

책별 사용자 정보:

- 소장 형태
- 읽기 상태
- 현재 페이지
- 총 페이지
- 시작일·완료일
- 선택 이유
- 전체 평가

---

## 13. 음악 기능

### 13.1 음악 Source 범위

음악은 다음 단위로 등록할 수 있다.

- 개별 곡
- 앨범·EP·싱글
- 영화·드라마·게임 OST
- 라이브 공연 또는 특정 연주 버전
- 플레이리스트 링크

같은 곡의 스튜디오 버전, 라이브 버전, 리메이크는 서로 다른 Source로 등록할 수 있으며 `source_relations`로 연결한다.

### 13.2 음악 메타데이터

- 곡명
- 아티스트
- 앨범명
- 앨범 아티스트
- 발매일
- 트랙 번호
- 재생 시간
- 장르
- 언어
- 작곡가
- 작사가
- 편곡자
- ISRC
- 앨범 표지 URL
- MusicBrainz ID
- Spotify·Apple Music·YouTube Music 등 공급자 링크
- OST 작품과의 관계

메타데이터가 없거나 한국 음악 정보가 불완전할 수 있으므로 모든 자동 입력값을 사용자가 수정할 수 있게 한다.

### 13.3 음악 등록 흐름

```text
곡·아티스트 검색 또는 음악 서비스 URL 입력
→ 후보 목록에서 정확한 버전 선택
→ 곡·앨범·표지·재생 시간 자동 입력
→ 공급자 링크 연결
→ 메모, Project, Tag 저장
```

MusicBrainz를 기본 공개 메타데이터 공급자로 우선 검토한다. 앨범 표지는 Cover Art Archive를 연결할 수 있다. Spotify와 Apple Music은 선택적 공급자 또는 외부 재생 링크로 취급하며, ThreadMark의 핵심 기능이 특정 상용 서비스 하나에 종속되지 않게 한다.

### 13.4 음악 Capture

지원할 메모 유형:

- 곡 전체에 대한 감상
- 특정 재생 시점 또는 구간 메모
- 기억하고 싶은 짧은 가사 구절
- 가사 해석 또는 번역
- 멜로디·리듬·악기·편곡에 대한 메모
- 특정 장면·사람·여행·시기와 연결된 기억
- 수업·연수·영상 배경음악 활용 아이디어
- 비슷한 곡 또는 관련 작품
- 다시 듣고 싶은 이유
- 분위기, 감정, 상황 태그

예:

```text
01:08–01:34 / 2절 후렴
현악기가 들어오면서 분위기가 확장되는 부분.
연구 발표 영상의 도입부 분위기와 잘 어울릴 것 같다.
```

Capture를 선택하면 지원되는 플레이어에서 해당 시점으로 이동한다. 공급자가 시점 이동을 지원하지 않으면 시간을 표시하고 외부 재생 링크를 제공한다.

### 13.5 개인 분류

공식 장르와 별도로 사용자가 자신의 맥락으로 분류할 수 있게 한다.

- 집중할 때
- 수업 준비
- 여행
- 휴식
- 자신감
- 그리움
- 발표·영상 배경음악 후보

이 값들은 일반 Tag로 저장하며 고정 목록으로 제한하지 않는다.

### 13.6 재생과 저작권 원칙

- 상업 음원 파일 자체를 ThreadMark 또는 Google Drive에 복제·저장하지 않는다.
- 공식 공급자가 허용한 embed player 또는 원본 서비스 링크를 사용한다.
- 전체 가사를 API나 웹 스크래핑으로 수집하지 않는다.
- 사용자가 개인 메모를 위해 짧은 구절을 직접 입력할 수는 있지만 기본 공개 범위는 private로 유지한다.
- 공개 공유 시 가사 원문은 별도로 검토하거나 제외할 수 있게 한다.
- 앨범 표지와 미리듣기 URL은 공급자의 이용 조건과 표시 요건을 따른다.
- 사용자가 직접 만든 음악·연주 녹음은 일반 Audio Source로 Google Drive에 저장할 수 있다.

### 13.7 다른 Source와 연결

- 음악과 영화·드라마 OST 관계
- 음악과 YouTube 뮤직비디오·라이브 영상 관계
- 원곡과 리메이크 관계
- 같은 곡의 스튜디오·라이브 버전 관계
- 음악과 수업·연수·영상 제작 Project 관계

---

## 14. YouTube 기능

- 기존 `ThreadMark` Google Cloud 프로젝트에서 YouTube Data API v3를 활성화했다.
- `ThreadMark YouTube Server` 전용 API 키를 생성했다.
- API 제한은 YouTube Data API v3로 한정하고, 키는 Next.js 서버 전용 환경변수로 보관한다.
- 공개 영상 메타데이터 조회에는 사용자 OAuth 권한을 추가하지 않는다.
- Picker용 API 키와 YouTube용 API 키를 분리한다.
- URL에서 video ID를 추출한다.
- YouTube Data API `videos.list`로 제목, 채널, 설명, 게시일, 길이, 썸네일 및 상태를 가져온다.
- YouTube IFrame Player API로 앱 안에서 재생한다.
- 임베딩이 금지된 영상은 외부 링크로 연다.
- 현재 재생 시점을 Capture에 저장한다.
- Capture 클릭 시 저장된 시점으로 이동한다.
- 삭제·비공개 영상이 되어도 기존 메모는 유지한다.

---

## 15. 영화·드라마·OTT 기능

- TMDB 계정을 생성하고 `API Key (v3 auth)`와 `API Read Access Token (v4 auth)` 발급을 확인했다.
- TMDB 자격 증명은 Next.js 서버 전용 환경변수로 저장하고 브라우저 코드나 저장소에 노출하지 않는다.
- TMDB API로 영화·TV 프로그램, 포스터, 줄거리, 장르, 출연진, 시즌·회차 정보를 가져온다.
- 한국 지역의 watch provider 정보를 조회한다.
- 제공처 정보에는 `last_synced_at`을 저장한다.
- 사용자가 직접 입력한 시청 서비스와 API 조회 결과를 구분한다.
- JustWatch 및 TMDB 표시 조건을 준수한다.
- OTT 영상 자체를 임베드하거나 다운로드하지 않는다.
- 시즌, 회차, 타임코드를 Capture 위치로 저장한다.

### 15.1 TMDB 출처 표기

ThreadMark의 About 또는 Credits 화면에 다음 요소를 반드시 함께 표시한다.

1. [TMDB 공식 승인 로고](https://www.themoviedb.org/about/logos-attribution)
2. TMDB 웹사이트 링크: https://www.themoviedb.org
3. 다음 공식 고지 문구를 번역하거나 수정하지 않고 그대로 표시한다.

> This product uses the TMDB API but is not endorsed or certified by TMDB.

표시 원칙:

- 공식 승인 로고 파일만 사용한다.
- 로고의 색상, 비율, 방향을 임의로 변경하지 않는다.
- TMDB 로고는 ThreadMark의 이름이나 로고보다 덜 두드러지게 표시한다.
- TMDB가 ThreadMark를 보증하거나 인증한다는 인상을 주지 않는다.
- 비상업적 사용과 출처 표기 조건을 전제로 하며, 수익화 전에 상업용 라이선스를 다시 확인한다.

---

## 16. 이미지, 손글씨 및 그림

### 이미지

- Google Drive에 원본을 저장한다.
- 전체 메모, 포인트 메모, 사각형 영역 메모를 지원한다.
- 화면 표시용 썸네일은 가능한 경우 외부 공급자 URL 또는 Drive의 파생 파일을 사용한다.

### 그림판

- 독립 캔버스와 자료 위 필기 모드를 제공한다.
- 펜, 형광펜, 지우개, 도형, 텍스트, 색상, 굵기, undo/redo를 지원한다.
- 멀티터치 확대·축소와 스타일러스 입력을 고려한다.
- 편집 가능한 vector/stroke JSON과 미리보기 WebP 또는 PNG를 함께 저장한다.
- 임시 작업은 IndexedDB에 자동 저장한 뒤 네트워크 복구 시 동기화한다.

---

## 17. 음성 메모

- 브라우저 MediaRecorder 기반 녹음을 지원한다.
- 압축된 음성 형식을 사용한다.
- 파일은 사용자의 Google Drive에 저장한다.
- 제목, 길이, 날짜, 프로젝트, 태그, 메모를 저장한다.
- 전사문, AI 요약, 확인 여부를 별도 필드로 둔다.
- 원본 보관 또는 전사 후 삭제를 사용자가 선택할 수 있게 한다.
- 다른 사람의 음성을 녹음할 때 동의가 필요하다는 안내를 제공한다.
- iOS Safari와 Android Chrome의 실제 녹음 형식 차이를 테스트한다.

---

## 18. 외부 API와 메타데이터

초기 또는 단계별로 사용할 수 있는 공급자:

- Crossref: DOI 기반 논문 메타데이터
- OpenAlex: 논문·저자·인용 관계 보완
- KCI/RISS/Google Scholar: 우선 검색 바로가기
- Kakao Book Search: 도서와 표지
- MusicBrainz: 곡·아티스트·앨범·ISRC 등 음악 메타데이터
- Cover Art Archive: MusicBrainz release 기반 앨범 표지
- Spotify·Apple Music: 선택적 메타데이터·공식 재생 링크 또는 embed
- YouTube Data API: 영상 메타데이터
- TMDB: 영화·TV·포스터·watch providers
- 생성형 AI 또는 번역 API: 부분 번역, 요약, 임베딩

외부 API 응답은 신뢰 가능한 사용자 입력으로 취급하지 않는다. Zod로 검증하고 오류·누락에 대비한다. 외부 API가 중단되어도 기존 Source와 Capture를 열 수 있어야 한다.

### 18.1 생성형 AI 공급자와 비용 정책

ThreadMark의 생성형 AI 공급자는 **Anthropic Claude API**로 결정한다.

- Anthropic Console에 ThreadMark 전용 Workspace를 생성했다.
- Workspace 월 예산 상한은 **USD 5**로 설정했다.
- ThreadMark 서버 전용 API 키를 생성했다.
- 기본 모델은 `claude-sonnet-5`로 사용한다.
- 비용 절감이 중요한 짧은 분류·태그 후보 생성에는 `claude-haiku-4-5-20251001` 사용을 선택적으로 검토한다.
- Claude API 키는 Next.js 서버 전용 환경변수에만 저장하고 브라우저 코드, 로그, Git 저장소에 노출하지 않는다.
- 초기 환경변수 이름은 `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BUDGET_USD`로 통일한다.
- `ANTHROPIC_MODEL`의 초기값은 `claude-sonnet-5`, `ANTHROPIC_BUDGET_USD`의 초기값은 `5`로 둔다.

초기 적용 범위:

- 사용자가 직접 선택한 PDF 또는 Capture 텍스트의 부분 번역
- 짧은 요약
- 키워드와 태그 후보
- 연구·수업 활용 아이디어 초안

데이터 전송 원칙:

- 사용자가 명시적으로 실행한 범위만 Claude API로 전송한다.
- PDF 전체나 Google Drive 파일 전체를 자동 전송하지 않는다.
- 요청 전에 전송될 텍스트 범위를 사용자가 확인할 수 있게 한다.
- AI 결과는 원문, 사용자 작성 내용과 구분하고 모델명과 생성 시점을 기록할 수 있게 한다.
- 예산 상한에 가까워지거나 초과하면 AI 요청을 중단하고 사용자에게 안내한다.

Claude는 자체 임베딩 모델을 제공하지 않으므로 의미 검색용 임베딩 공급자는 MVP 이후 별도로 결정한다. 초기 MVP에서는 Claude 텍스트 생성 기능과 일반 키워드 검색을 우선하며, 임베딩 공급자나 로컬 임베딩 모델을 성급하게 추가하지 않는다.

공식 참고:

- Claude 모델: https://platform.claude.com/docs/en/models/overview
- Claude API: https://platform.claude.com/docs/en/api/overview
- Claude API 가격: https://platform.claude.com/docs/en/about-claude/pricing

---

## 19. AI 검색과 추천

AI 검색은 MVP 핵심 CRUD가 안정된 뒤 추가한다.

흐름:

```text
사용자 질문
→ 사용자 권한과 Project 범위 확인
→ 키워드 검색 + 벡터 검색
→ 관련 Capture 선별
→ AI가 관계 설명
→ Source와 위치가 포함된 결과 표시
```

원칙:

- 사용자 간 비공개 데이터가 섞이지 않게 한다.
- 벡터 검색 전후 모두 `owner_id`와 공유 권한을 검사한다.
- 전체 PDF보다 사용자가 저장한 Capture를 우선 임베딩한다.
- 검색 결과에는 관련 Capture와 출처 위치를 표시한다.
- AI 사용량 제한과 비용 추적을 둔다.

---

## 20. 데이터베이스 초안

핵심 테이블:

- `profiles`
- `projects`
- `sources`
- `captures`
- `tags`
- `capture_tags`
- `source_projects`
- `capture_projects`
- `source_external_ids`
- `source_files`
- `paper_profiles`
- `paper_analyses`
- `paper_project_uses`
- `source_relations`
- `book_profiles`
- `music_profiles`
- `music_provider_links`
- `youtube_profiles`
- `media_profiles`
- `website_profiles`
- `translations`
- `drawings`
- `audio_profiles`
- `share_links`
- `collaborators`

서버 전용 private 영역:

- Google OAuth refresh token
- token 암호화 정보
- 외부 API 동기화 상태
- background job 상태

RLS 테스트는 최소 두 명의 사용자와 anonymous role을 대상으로 작성한다.

---

## 21. 주요 화면 및 경로

```text
/
/login
/home
/inbox
/captures/[id]/edit
/library
/library/papers
/library/books
/library/websites
/library/music
/library/youtube
/library/media
/library/images
/library/audio
/sources/new
/sources/[id]
/sources/[id]/edit
/sources/[id]/reader
/projects
/projects/[id]
/projects/[id]/edit
/research/search
/ai-search
/shared
/settings
/settings/integrations
/admin/users
/admin/settings
```

`/admin` 아래는 관리자 전용이다. 가입 승인 처리와 운영 설정 변경을 담당한다.
일반 사용자에게는 링크를 보여주지 않지만, 링크를 감추는 것은 통제가 아니다.
각 페이지와 Server Action이 `is_admin()`으로 직접 확인하고 RLS가 한 번 더 막는다.

### 데스크톱 내비게이션

- 홈
- 빠른 기록
- 내 자료
- 논문
- 책
- 웹사이트
- 음악
- 영상
- 이미지·그림
- 음성
- 프로젝트
- 연구 검색
- AI 검색
- 공유
- 설정

### 반응형 원칙

- 모바일과 태블릿을 처음부터 지원한다.
- 데스크톱 split view를 모바일에 억지로 축소하지 않는다.
- 모바일 PDF 화면은 PDF/메모 탭을 사용한다.
- 터치 대상은 충분한 크기를 확보한다.
- 스타일러스, 키보드, 마우스 입력을 모두 고려한다.

---

## 22. MVP 범위

### MVP에 포함

- 회원가입과 로그인
- 사용자별 RLS
- Project CRUD
- Source CRUD
- Capture CRUD
- Tag
- 빠른 기록과 Inbox
- 웹사이트 URL + 메모 저장
- 음악 Source 수동 등록, 공급자 링크 및 시간 위치 Capture
- Google Drive 연결
- ThreadMark Drive 폴더 생성
- PDF 업로드 또는 Drive 파일 선택
- PDF.js 뷰어
- 페이지 메모
- 선택 텍스트 Capture
- 선택 텍스트 부분 번역
- 논문 분석 템플릿
- 논문 검색 사이트 바로가기
- 기본 키워드 검색
- 반응형 UI

### MVP 이후

- OCR
- AI 의미 검색과 RAG
- YouTube 상세 기능
- MusicBrainz·앨범 표지·음악 서비스 자동 메타데이터
- Kakao 책 검색
- TMDB
- 이미지 영역 주석
- 그림판
- 음성 녹음과 전사
- 브라우저 확장 프로그램
- 공개 컬렉션
- 공동 편집
- 결제와 용량 정책

MVP 이후 기능의 데이터 확장 가능성은 고려하되, 미리 모든 UI와 로직을 구현하지 않는다.

---

## 23. 구현 순서

### Phase 0: 프로젝트 기반

- GitHub public 저장소
- 비밀값을 제외하는 `.gitignore`와 값이 없는 `.env.example`
- Next.js + TypeScript
- 코드 품질 도구
- 환경변수 템플릿
- 전용 Supabase 프로젝트
- migration 구조
- Vercel 연결

### Phase 1: 인증과 데이터 보호

- Supabase Auth
- profile 생성
- middleware/session
- RLS
- 두 사용자 격리 테스트

### Phase 2: Source–Capture–Project

- Project CRUD
- Source CRUD
- Capture CRUD
- Tag
- Inbox
- 검색

### Phase 3: Google Drive

- Google Cloud 프로젝트
- OAuth consent screen
- Drive API
- `drive.file` scope
- token 암호화 저장
- ThreadMark 폴더 생성
- upload/download/Picker
- 연결 해제와 복구

### Phase 4: PDF 연구 워크스페이스

- PDF.js
- Drive PDF 스트리밍
- 페이지 상태
- 텍스트 선택
- annotation anchor
- 선택 번역
- 파일 변경 감지

### Phase 5: 논문 연구 기능

- DOI/BibTeX/RIS
- APA
- 분석 템플릿
- 프로젝트별 활용 계획
- 참고문헌 관계
- 검색 허브

### Phase 6: 다른 매체

- Website metadata
- Kakao Book
- MusicBrainz·Cover Art Archive·음악 서비스 링크
- YouTube
- TMDB
- 이미지
- 그림판
- 음성

### Phase 7: AI와 공유

- embeddings
- hybrid search
- 출처 기반 추천
- 공개·비공개 공유
- 협업

---

## 24. 환경변수 계획

예시 이름만 정의하며 실제 값을 Git에 커밋하지 않는다.

```env
NEXT_PUBLIC_APP_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=
NEXT_PUBLIC_GOOGLE_PICKER_APP_ID=
TOKEN_ENCRYPTION_KEY=

KAKAO_REST_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
MUSICBRAINZ_USER_AGENT=
YOUTUBE_API_KEY=
TMDB_API_READ_TOKEN=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
ANTHROPIC_BUDGET_USD=5
```

- `.env.example`에는 이름과 설명만 둔다.
- `.env.local`은 Git에서 제외한다.
- Vercel Preview와 Production 값을 분리한다.
- public prefix가 붙은 변수에는 공개되어도 되는 값만 둔다.
- Supabase publishable key와 `threadmark-server` secret key 생성을 확인했으며, legacy `anon`·`service_role` 키 대신 사용한다.
- 로컬 `.env.local`에 필수 개발 환경변수와 별도 생성한 256-bit token 암호화 키를 입력했으며 Git 제외 상태를 확인했다.
- Vercel Production에 Config 9개와 Secret 8개를 프로젝트 범위로 등록하고 새 Production 배포에 적용했다.
- Preview에는 Supabase secret key, Google OAuth client secret, token 암호화 키 및 외부 API 비밀값을 기본 제공하지 않는다. Preview는 공개 설정과 RLS가 적용되는 Supabase publishable key만 사용하며, 필요한 서버 기능은 별도 Preview 자격 증명을 마련하기 전까지 비활성화한다.

---

## 25. 완료 기준과 테스트

### 핵심 통합 테스트

1. 사용자 A가 사용자 B의 Source, Capture, Project를 읽거나 수정할 수 없다.
2. Drive 미연결 사용자는 URL Source와 텍스트 Capture를 저장할 수 있다.
3. Drive 연결 사용자는 PDF를 업로드하고 다시 열 수 있다.
4. 텍스트 PDF에서 문장을 선택하면 페이지와 선택 문장이 함께 저장된다.
5. 저장된 Capture를 누르면 해당 페이지와 위치로 이동한다.
6. 선택 문장만 번역 API로 전송되고 전체 PDF는 전송되지 않는다.
7. Drive 권한을 취소해도 기존 Source와 Capture는 사라지지 않는다.
8. 사용자가 Drive 파일을 삭제하면 복구 가능한 오류 상태가 표시된다.
9. 모바일에서 PDF와 메모 탭을 전환할 수 있다.
10. MathLab의 Supabase 및 Vercel 환경에는 어떠한 변경도 발생하지 않는다.

### 배포 전 점검

- lint 성공
- typecheck 성공
- test 성공
- production build 성공
- RLS 테스트 성공
- 비밀값 노출 검사
- 모바일 실제 기기 확인
- Google OAuth redirect URL 확인
- 개인정보 처리방침 및 서비스 약관 링크 확인

---

## 26. 코딩 전 준비 체크리스트

아래 항목은 한 번에 진행하지 않고 순서대로 완료한다.

1. [완료] GitHub에 public `threadmark` 저장소 생성: https://github.com/dskim-git/threadmark
2. [완료] 로컬 작업 폴더와 Git 연결 및 초기 커밋 push: `C:\\git-projects\\threadmark`, `e8d8743 chore: initialize Next.js app`
3. [완료] Node.js 및 패키지 관리자 버전 확인: Node.js `v24.11.0`, npm/npx `11.6.1`
4. [완료] Next.js 프로젝트 초기화: Next.js `16.3.5`, React `19.2.8`, TypeScript, Tailwind CSS 4, ESLint 9
5. [완료] 초기 lint 및 production build 통과
6. [완료] 기본 화면과 로컬 개발 서버 동작 확인
7. [완료] ThreadMark 전용 Supabase 무료 프로젝트 생성: 서울 리전, MathLab과 별도 프로젝트
8. [완료] Supabase Auth URL 설정: Site URL `https://thread-mark.vercel.app`, Redirect URLs `http://localhost:3000/**`, `https://thread-mark.vercel.app/auth/callback`
9. [완료] Google Cloud 전용 프로젝트 생성
10. [완료] Google Auth Platform 구성: External, Testing, 테스트 사용자 등록
11. [완료] Google Drive API와 Google Picker API 활성화
12. [완료] 개발용 OAuth client 생성 및 localhost origin/callback 등록
13. [완료] Picker API key 생성 및 웹사이트/API 제한 설정
14. [완료] Google Drive `drive.file` 최소 권한과 숫자형 Google Cloud 프로젝트 번호 확인
15. [완료] Kakao Developers `ThreadMark` 앱 생성 및 REST API 키 확인
16. [완료] YouTube Data API v3 활성화 및 서버 전용 제한 API 키 생성
17. [완료] TMDB 계정·API 자격 증명 확인 및 About/Credits 출처 표기 요구사항 기록
18. [완료] Anthropic Claude API 선택, ThreadMark 전용 Workspace·API 키 생성 및 월 예산 상한 USD 5 설정
19. [완료] 별도 Vercel 프로젝트 연결 및 초기 Production 배포: https://thread-mark.vercel.app/
20. [완료] 개발·Preview·Production 환경변수 분리: `.env.local` Git 제외, `.env.example` 커밋 `91a9a17`, Production Config·Secret 적용, Preview는 안전한 Config 5개만 허용
21. 개인정보 처리방침과 데이터 삭제 절차 초안

---

## 27. 개발 중 의사결정 기록 원칙

- 중요한 구조 변경은 `docs/decisions`에 ADR 형식으로 기록한다.
- 외부 API를 추가할 때 목적, 권한 범위, 비용, 데이터 보존 조건을 기록한다.
- 설계와 다른 구현이 필요하면 코드부터 변경하지 말고 이 문서 또는 ADR을 먼저 갱신한다.
- MathLab과 자원을 공유하는 제안은 승인하지 않는다.

---

## 28. 현재 결정 사항 요약

- 이름은 ThreadMark(TM)이다.
- 핵심 구조는 Source–Capture–Project다.
- GitHub 저장소는 public으로 운영하며 API·OAuth·암호화 관련 비밀값은 저장소에 커밋하지 않는다.
- 다중 사용자 구조와 RLS를 처음부터 적용한다.
- MathLab과 Supabase 프로젝트를 완전히 분리한다.
- 사용자 파일의 기본 저장소는 각 사용자의 Google Drive다.
- Google Drive는 `drive.file` 최소 권한과 Picker를 사용한다.
- 웹사이트는 URL, 메타데이터, 메모 및 선택 인용을 저장한다.
- 음악은 곡·앨범·공연 버전을 Source로 저장하고 재생 시점, 감상, 짧은 가사 구절 및 활용 아이디어를 Capture로 기록한다.
- 상업 음원과 전체 가사는 복제하지 않고 공식 링크·embed와 메타데이터를 사용한다.
- PDF.js로 텍스트 선택, 페이지 위치 저장 및 부분 번역을 지원한다.
- 텍스트 기반 공식 논문 PDF는 주요 기능이 대체로 작동하지만 예외에 대비한 fallback을 둔다.
- 논문 분석 템플릿과 프로젝트별 활용 계획을 제공한다.
- AI 의미 검색, OCR, 공유, 협업은 핵심 MVP 이후에 추가한다.
