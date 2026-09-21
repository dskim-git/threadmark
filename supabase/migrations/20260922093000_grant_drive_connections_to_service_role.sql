-- =============================================================================
-- google_drive_connections 접근 권한
-- =============================================================================
-- 배경
--   앞선 마이그레이션은 anon과 authenticated의 권한을 회수하기만 하고,
--   service_role에는 아무것도 부여하지 않았다. 새 테이블에 기본 권한이
--   자동으로 붙는다고 가정했기 때문이다. 이 프로젝트에서는 그렇지 않았다.
--
--   그 결과 서버조차 이 표를 읽지 못했다.
--
--     permission denied for table google_drive_connections
--
-- 조치
--   service_role에 필요한 권한을 명시적으로 부여한다.
--   기대에 기대지 않고, 누가 무엇을 할 수 있는지 마이그레이션에 적어둔다.
--
--   anon과 authenticated는 그대로 둔다. 설계 문서 10.5절이 요구한 대로
--   클라이언트는 이 표에 닿을 수 없어야 한다.
--
--   service_role은 RLS도 우회한다. 그래서 이 표를 다루는 코드
--   (src/lib/drive/connection.ts)는 모든 질의를 user_id로 좁힌다.
--   지금까지 데이터베이스가 해주던 소유자 확인을 그 파일이 맡는다.
-- =============================================================================

grant select, insert, update, delete
  on table public.google_drive_connections
  to service_role;

-- 클라이언트 역할에는 다시 부여하지 않는다는 사실을 분명히 해 둔다.
revoke all on table public.google_drive_connections from anon, authenticated;
