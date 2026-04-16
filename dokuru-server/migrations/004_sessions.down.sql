DROP VIEW IF EXISTS active_sessions_detail;
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP TRIGGER IF EXISTS trigger_touch_session ON user_sessions;
DROP FUNCTION IF EXISTS touch_session();
DROP TABLE IF EXISTS user_sessions;
