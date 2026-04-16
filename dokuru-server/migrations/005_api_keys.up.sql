-- =============================================================================
-- MIGRATION 005: API Keys (Machine-to-Machine Auth)
-- =============================================================================
-- For service accounts and external integrations
-- Separate from user auth - designed for automated access
-- =============================================================================

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Key Hash (store hash, never plaintext)
    key_hash        VARCHAR(255) NOT NULL,
    key_prefix      VARCHAR(8),   -- First 8 chars for identification (e.g., "qk_live_")
    
    -- Owner
    created_by      UUID REFERENCES users(id),
    -- NULL = system-generated key
    
    -- Scopes/Permissions
    scopes          VARCHAR(100)[] DEFAULT '{}',
    -- e.g., {'read:users', 'write:posts', 'admin:full'}
    
    -- Rate Limiting
    rate_limit_rpm  INTEGER DEFAULT 60,
    -- Requests per minute allowed
    
    -- Usage Tracking
    last_used_at    TIMESTAMPTZ,
    use_count       INTEGER DEFAULT 0,
    
    -- Expiration
    expires_at      TIMESTAMPTZ,
    -- NULL = never expires
    
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    
    revoked_at      TIMESTAMPTZ,
    revoked_reason  VARCHAR(100),
    
    revoked_by      UUID REFERENCES users(id),
    
    -- Metadata
    metadata        JSONB DEFAULT '{}',
    -- e.g., {"allowed_ips": ["10.0.0.0/8"], "service": "payment-gateway"}
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_creator ON api_keys(created_by);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE is_active = TRUE;

-- Trigger
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Audit Log for API Key Usage (Optional but recommended)
-- =============================================================================
CREATE TABLE api_key_usage_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id      UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    
    endpoint        VARCHAR(255) NOT NULL,
    method          VARCHAR(10) NOT NULL,
    
    ip_address      INET,
    user_agent      TEXT,
    
    response_status INTEGER,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_key_logs_key_id ON api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_logs_created ON api_key_usage_logs(created_at);

-- Cleanup old logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_api_key_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_key_usage_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
