-- Add access_mode column to agents table
ALTER TABLE agents 
ADD COLUMN access_mode VARCHAR(20) NOT NULL DEFAULT 'direct';

-- Add index for filtering by access mode
CREATE INDEX idx_agents_access_mode ON agents(access_mode);

-- Add comment
COMMENT ON COLUMN agents.access_mode IS 'Access mode: direct | cloudflare | domain | relay';
