-- Add access_mode column to agents table (idempotent)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agents' AND column_name = 'access_mode'
    ) THEN
        ALTER TABLE agents ADD COLUMN access_mode VARCHAR(20) NOT NULL DEFAULT 'direct';
    END IF;
END $$;

-- Add index for filtering by access mode (idempotent)
CREATE INDEX IF NOT EXISTS idx_agents_access_mode ON agents(access_mode);

-- Add comment
COMMENT ON COLUMN agents.access_mode IS 'Access mode: direct | cloudflare | domain | relay';
