-- Add encrypted_token column to agents table
ALTER TABLE agents ADD COLUMN encrypted_token TEXT NOT NULL DEFAULT '';
