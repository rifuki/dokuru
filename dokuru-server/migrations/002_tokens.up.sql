CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used TIMESTAMPTZ
);

CREATE INDEX idx_tokens_user_id ON tokens(user_id);
CREATE INDEX idx_tokens_token_hash ON tokens(token_hash);
