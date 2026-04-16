-- =============================================================================
-- MIGRATION 001: Database Extensions
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable crypto functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Update function for timestamp columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
