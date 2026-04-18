DROP INDEX IF EXISTS idx_agents_access_mode;
ALTER TABLE agents DROP COLUMN IF EXISTS access_mode;
