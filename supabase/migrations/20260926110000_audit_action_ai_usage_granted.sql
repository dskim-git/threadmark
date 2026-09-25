-- =============================================================================
-- 감사 기록이 'ai_usage_granted'를 받게 한다 (19-E)
-- =============================================================================
-- 2026-09-26. **사용자가 쓰다가 찾았다.** 관리자 화면에서 허용량 10번을
-- 더하려 하자 "허용량을 더하지 못했습니다"만 나왔다.
--
-- 무슨 일이 있었나
--   `admin_audit_logs.action`에 허용 목록이 걸려 있다.
--   (`20260920090000`의 `admin_audit_logs_action_check`)
--
--     user_status_changed / user_role_granted / user_role_revoked /
--     app_setting_updated
--
--   19-E에서 만든 `log_ai_usage_grant` 트리거는 거기에 없는
--   `ai_usage_granted`를 넣는다. 제약이 거부하면 **그 트리거를 부른
--   INSERT까지 통째로 되돌아간다.** 허용량 줄은 하나도 남지 않고 화면에는
--   "더하지 못했습니다"만 나온다.
--
-- 왜 목록을 두는가
--   그대로 둔다. 목록이 없으면 오타 한 글자가 새 갈래가 되어 조용히 쌓이고,
--   화면의 `actionLabel`이 모르는 값을 만나 영문 그대로 보여준다. 막는 쪽이
--   맞았다. **빠뜨린 것은 목록이 아니라 한 줄이다.**
--
-- 배운 것
--   감사 기록을 남기는 트리거를 새로 만들면 **이 목록에도 더해야 한다.**
--   표를 새로 만들 때 고칠 다섯 곳과 같은 성격인데, 그때는 표가 아니라
--   감사 기록의 갈래가 늘어난 것이었다. AGENTS.md 6절에 남겼다.
--
--   003의 검사 127이 이것을 잡는다("허용량을 더한 일이 감사 기록에 남지
--   않았습니다"). 아직 돌려보지 않은 검사였고, **쓰는 사람이 먼저 찾았다.**
--
-- 재실행 안전성
--   제약을 이름으로 떼었다 다시 붙인다. 이미 있는 줄은 모두 옛 네 값이라
--   새 목록으로 다시 볼 때 걸리지 않는다.
-- =============================================================================

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
      'ai_usage_granted'
    )
  );
