ALTER TABLE audit_results
ADD COLUMN active_containers JSONB NOT NULL DEFAULT '[]'::jsonb;
