-- =============================================================================
-- ThreadMark — Google Drive 연결
-- =============================================================================
-- 목적
--   사용자가 허용한 Google Drive 접근 권한을 보관한다. (설계 문서 10.5절)
--
-- 이 표가 다른 표와 다른 점
--   지금까지의 표는 "사용자의 자료"를 담았고, RLS가 소유자에게만 보여줬다.
--   이 표는 "사용자의 Google 계정에 접근할 수 있는 열쇠"를 담는다.
--
--   설계 문서 10.5절은 이렇게 요구한다.
--     클라이언트가 refresh token 테이블을 select할 수 없어야 한다.
--
--   그래서 authenticated 역할에게 어떤 권한도 주지 않는다.
--   정책을 만들지 않는 것이 아니라, 권한 자체를 부여하지 않는다.
--   본인조차 자기 refresh token을 읽을 수 없다. 읽을 이유가 없기 때문이다.
--
--   접근은 서버가 service role로만 한다. service role은 RLS를 우회하므로,
--   그 코드는 소유자 확인을 스스로 해야 한다. 지금까지 데이터베이스가 대신
--   해주던 일을 코드가 떠맡는다는 뜻이다. 그래서 쓰는 곳을 좁게 제한한다.
--
-- 저장하지 않는 것
--   access token은 저장하지 않는다. 설계 문서 10.5절이 "단기 사용"이라고 한 대로,
--   필요할 때마다 refresh token으로 새로 받는다. 남겨둘 비밀값을 하나 줄인다.
--
-- 재실행 안전성
--   모든 객체를 if not exists / or replace / drop ... if exists 형태로 작성했다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 열거형
-- -----------------------------------------------------------------------------

-- 연결 상태. 설계 문서 10.4절은 토큰 만료, 권한 취소, 파일 오류를 구분해
-- 표시하라고 한다. 사용자가 할 일이 각각 다르기 때문이다.
--
--   connected  정상
--   revoked    사용자가 Google에서 권한을 거둬들였다. 다시 연결해야 한다.
--   error      토큰 갱신에 실패했다. 원인은 last_error에 남는다.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'drive_connection_status' and n.nspname = 'public'
  ) then
    create type public.drive_connection_status as enum (
      'connected',
      'revoked',
      'error'
    );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. 테이블
-- -----------------------------------------------------------------------------

create table if not exists public.google_drive_connections (
  -- 한 사용자에 하나의 연결만 둔다.
  user_id                 uuid primary key
                            references auth.users (id) on delete cascade,

  status                  public.drive_connection_status not null
                            default 'connected',

  -- 암호화된 refresh token. 평문은 어디에도 남기지 않는다.
  -- 형식은 src/lib/crypto/secret-box.ts가 정한다.
  encrypted_refresh_token text not null,

  -- 실제로 허용된 권한 범위. 요청한 것과 다를 수 있으므로 받은 값을 남긴다.
  granted_scope           text not null,

  -- Drive 안의 ThreadMark 폴더. 설계 문서 10.1절.
  root_folder_id          text,
  -- 하위 폴더 이름과 식별자. { "Papers": "...", "PDFs": "..." } 형태다.
  folder_ids              jsonb not null default '{}'::jsonb,

  connected_at            timestamptz not null default now(),
  last_used_at            timestamptz,

  -- 사용자에게 무엇이 잘못되었는지 알려주기 위한 기록.
  -- 토큰이나 인증 헤더는 절대 여기에 넣지 않는다. (설계 문서 10.5절)
  last_error              text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint google_drive_connections_scope_length check (
    char_length(granted_scope) between 1 and 2000
  ),
  constraint google_drive_connections_last_error_length check (
    last_error is null or char_length(last_error) <= 1000
  ),
  constraint google_drive_connections_folder_ids_is_object check (
    jsonb_typeof(folder_ids) = 'object'
  )
);

comment on table public.google_drive_connections is
  '사용자가 허용한 Google Drive 접근 권한. authenticated 역할은 접근할 수 없고 서버만 다룬다.';
comment on column public.google_drive_connections.encrypted_refresh_token is
  '암호화된 refresh token. 평문을 저장하거나 기록하지 않는다.';
comment on column public.google_drive_connections.last_error is
  '사용자에게 보여줄 오류 요약. 토큰과 인증 헤더는 넣지 않는다.';


create or replace function public.set_drive_connection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists google_drive_connections_set_updated_at
  on public.google_drive_connections;
create trigger google_drive_connections_set_updated_at
  before update on public.google_drive_connections
  for each row
  execute function public.set_drive_connection_updated_at();


-- -----------------------------------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------------------------------
-- anon과 authenticated 모두에게서 권한을 회수하고 다시 부여하지 않는다.
-- 이 표에 대해서는 "정책으로 거른다"가 아니라 "닿을 수 없다"가 목표다.
--
-- service_role의 권한은 건드리지 않는다. 서버가 그 역할로만 접근한다.

revoke all on table public.google_drive_connections from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
-- 권한이 없으므로 RLS까지 필요하지는 않다. 그래도 켜 둔다.
-- 나중에 누군가 실수로 grant를 추가하더라도, 정책이 하나도 없으면
-- 여전히 아무 행도 보이지 않는다. 실수 한 번으로 열리지 않게 하는 장치다.

alter table public.google_drive_connections enable row level security;

-- 정책을 일부러 만들지 않는다.
-- authenticated에게 열어야 할 경로가 생긴다면 그때 따로 검토한다.
