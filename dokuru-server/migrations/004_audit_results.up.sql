CREATE TABLE IF NOT EXISTS audit_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    results JSONB NOT NULL,
    scanned_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_results_env_id ON audit_results(env_id);
CREATE INDEX idx_audit_results_scanned_at ON audit_results(scanned_at DESC);
