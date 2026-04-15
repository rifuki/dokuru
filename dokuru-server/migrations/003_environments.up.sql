CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    name TEXT,
    ip TEXT,
    docker_version TEXT,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_environments_user_id ON environments(user_id);
CREATE INDEX idx_environments_token_id ON environments(token_id);
CREATE INDEX idx_environments_status ON environments(status);
