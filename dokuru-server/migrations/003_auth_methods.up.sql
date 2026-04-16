-- =============================================================================
-- MIGRATION 003: Authentication Methods (OAuth-Ready)
-- =============================================================================
-- Separates authentication from identity
-- Supports: Password, Google, GitHub, Discord, etc.
-- One user can have multiple auth methods (link accounts)
-- =============================================================================

CREATE TABLE auth_methods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Provider Info
    provider            VARCHAR(50) NOT NULL,
    -- 'password', 'google', 'github', 'discord', 'twitter', etc.
    
    provider_id         VARCHAR(255),
    -- OAuth user ID from provider (e.g., Google sub claim)
    -- NULL for password auth
    
    -- Credentials (for password provider)
    password_hash       VARCHAR(255),
    -- Argon2id hash - NULL for OAuth
    
    -- OAuth Tokens (encrypted at application level before storing)
    oauth_access_token  TEXT,
    oauth_refresh_token TEXT,
    oauth_expires_at    TIMESTAMPTZ,
    
    -- Status
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = default login method shown to user
    
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    -- Email verified by provider?
    
    last_used_at        TIMESTAMPTZ,
    -- Track when this auth method was last used
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_provider_per_user UNIQUE(user_id, provider),
    CONSTRAINT unique_provider_id UNIQUE(provider, provider_id)
);

-- Indexes
CREATE INDEX idx_auth_methods_user_id ON auth_methods(user_id);
CREATE INDEX idx_auth_methods_provider ON auth_methods(provider, provider_id);
CREATE INDEX idx_auth_methods_primary ON auth_methods(user_id, is_primary) WHERE is_primary = TRUE;

-- Trigger
CREATE TRIGGER update_auth_methods_updated_at
    BEFORE UPDATE ON auth_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Helper Function: Get User's Primary Auth Method
-- =============================================================================
CREATE OR REPLACE FUNCTION get_primary_auth_method(p_user_id UUID)
RETURNS TABLE (
    provider VARCHAR(50),
    is_verified BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT am.provider, am.is_verified
    FROM auth_methods am
    WHERE am.user_id = p_user_id AND am.is_primary = TRUE
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
