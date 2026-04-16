CREATE TABLE audit_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL DEFAULT '',
    docker_version TEXT NOT NULL DEFAULT '',
    total_containers INTEGER NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '[]',
    total_rules INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_results_agent_id ON audit_results(agent_id);
CREATE INDEX idx_audit_results_ran_at ON audit_results(ran_at DESC);
