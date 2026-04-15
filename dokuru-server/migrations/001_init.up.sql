CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(50) UNIQUE,
    name            VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'user',
    avatar_url      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role     ON users(role);

CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL,
    key_hash     VARCHAR(255) NOT NULL,
    scopes       VARCHAR(255)[] DEFAULT '{}',
    created_by   UUID REFERENCES users(id),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at   TIMESTAMP WITH TIME ZONE,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active   ON api_keys(is_active) WHERE is_active = true;
