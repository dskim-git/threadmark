-- =============================================================================
-- 확인 상태 값 추가 (13-C)
-- =============================================================================
-- 설계 문서 9.4절: 기계 번역임을 표시하고, 수정본과 AI 원본을 구분할 수 있게 한다.
--
-- 지금까지 capture_verification_status에는 'user_written' 하나뿐이었다.
-- 사람이 쓴 글만 있었기 때문이다. 기계가 만든 글이 들어오면서 둘이 더 필요해졌다.
--
--   machine_generated  기계가 만든 그대로. 사람이 확인하지 않았다.
--   user_edited        기계가 만든 것을 사람이 손봤다.
--
-- 쓰지 않을 값은 미리 넣지 않는다. 이 둘은 13-C에서 실제로 쓰인다.
--
-- 왜 파일을 따로 두는가
--   PostgreSQL 12부터 ALTER TYPE ... ADD VALUE는 트랜잭션 안에서도 되지만,
--   **같은 트랜잭션에서 그 값을 쓸 수는 없다.** 값을 쓰는 제약조건과 함수는
--   다음 마이그레이션에 둔다. 한 파일에 몰아넣으면 적용할 때 거부당한다.
-- =============================================================================

alter type public.capture_verification_status
  add value if not exists 'machine_generated';

alter type public.capture_verification_status
  add value if not exists 'user_edited';
