DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
DROP INDEX IF EXISTS idx_agents_created_at;
DROP INDEX IF EXISTS idx_agents_status;
DROP INDEX IF EXISTS idx_agents_user_id;
DROP TABLE IF EXISTS agents;
