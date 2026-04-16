-- =============================================================================
-- MIGRATION 002: Users & User Profiles
-- =============================================================================
-- Separates core identity (users) from extended profile (user_profiles)
-- This allows:
-- - Fast auth lookups on small users table
-- - Optional profile fields
-- - Public vs private data separation
-- =============================================================================

-- =============================================================================
-- Core Identity Table (Minimal, Fast)
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity (required, unique)
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(50) UNIQUE,
    
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Role
    role            VARCHAR(20) NOT NULL DEFAULT 'user',
    -- 'admin', 'user', 'moderator'
    
    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Extended Profile Table (Optional fields)
-- =============================================================================
CREATE TABLE user_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Personal Info
    full_name       VARCHAR(255),
    display_name    VARCHAR(50),  -- Custom display name (can be different from username)
    date_of_birth   DATE,
    gender          VARCHAR(20),  -- 'male', 'female', 'other', 'prefer_not_to_say'
    
    -- Contact (in addition to email)
    phone_number    VARCHAR(20),
    phone_verified  BOOLEAN DEFAULT FALSE,
    
    -- Address (nullable, can add address table later for multiple addresses)
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    state_province  VARCHAR(100),
    postal_code     VARCHAR(20),
    country_code    CHAR(2),      -- ISO 3166-1 alpha-2
    
    -- Profile Media
    avatar_url      VARCHAR(500),
    cover_image_url VARCHAR(500),
    
    -- Bio
    bio             TEXT,
    website_url     VARCHAR(255),
    
    -- Preferences
    timezone        VARCHAR(50) DEFAULT 'UTC',
    locale          VARCHAR(10) DEFAULT 'en',
    
    -- Social Links (JSON for flexibility)
    social_links    JSONB DEFAULT '{}',
    -- Example: {"twitter": "@handle", "linkedin": "url", "github": "username"}
    
    -- Metadata
    is_profile_public BOOLEAN DEFAULT TRUE,  -- Can others see this profile?
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_profiles_name ON user_profiles(full_name);

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Helper View: User with Profile
-- =============================================================================
CREATE VIEW user_complete AS
SELECT 
    u.id,
    u.email,
    u.username,
    u.is_active,
    u.email_verified,
    u.role,
    u.created_at as user_created_at,
    p.full_name,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_profile_public
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id;
