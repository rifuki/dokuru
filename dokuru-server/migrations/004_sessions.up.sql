-- =============================================================================
-- MIGRATION 004: User Sessions (Device Tracking)
-- =============================================================================
-- Tracks active login sessions across devices
-- Supports: Device list, revoke specific device, logout all
-- =============================================================================

CREATE TABLE user_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auth_method_id      UUID REFERENCES auth_methods(id),
    -- Which auth method was used to create this session
    
    -- Session Identity (link to JWT)
    session_id          VARCHAR(64) NOT NULL UNIQUE,
    -- JWT "sid" claim - shared across access & refresh tokens
    
    -- Device Information
    device_name         VARCHAR(255),
    -- e.g., "Chrome on Windows", "Safari on iPhone"
    
    device_type         VARCHAR(50),
    -- 'desktop', 'mobile', 'tablet', 'smart_tv', 'other'
    
    device_fingerprint  VARCHAR(64),
    -- Browser fingerprint for additional security
    
    ip_address          VARCHAR(45),
    -- IP address at time of login (IPv4 or IPv6)
    
    location            VARCHAR(255),
    -- Human-readable location (e.g., "Jakarta, Indonesia")
    
    ip_country_code     CHAR(2),
    -- GeoIP country (ISO 3166-1 alpha-2)
    
    user_agent          TEXT,
    -- Full user agent string
    
    -- Session Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- When session started (also JWT s_iat)
    
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Last API call timestamp
    
    expires_at          TIMESTAMPTZ NOT NULL,
    -- Absolute session expiry (created_at + 7 days)
    
    -- Revocation
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    
    revoked_at          TIMESTAMPTZ,
    
    revoked_reason      VARCHAR(50),
    -- 'logout', 'logout_all', 'password_change', 'suspicious_activity', 
    -- 'admin_action', 'expired', 'token_reuse_detected'
    
    -- Metadata
    metadata            JSONB DEFAULT '{}'
    -- Extra data: {"login_location": "Jakarta", "mfa_used": true}
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at) WHERE is_active = TRUE;

-- Trigger to update last_active_at automatically
CREATE OR REPLACE FUNCTION touch_session()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_touch_session
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION touch_session();

-- =============================================================================
-- Helper View: Active Sessions with User Info
-- =============================================================================
CREATE VIEW active_sessions_detail AS
SELECT 
    us.*,
    u.email as user_email,
    u.username,
    am.provider as auth_provider
FROM user_sessions us
JOIN users u ON u.id = us.user_id
LEFT JOIN auth_methods am ON am.id = us.auth_method_id
WHERE us.is_active = TRUE 
  AND us.expires_at > NOW();

-- =============================================================================
-- Helper Function: Cleanup Expired Sessions
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE user_sessions 
    SET is_active = FALSE, 
        revoked_at = NOW(), 
        revoked_reason = 'expired'
    WHERE is_active = TRUE 
      AND expires_at < NOW();
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
