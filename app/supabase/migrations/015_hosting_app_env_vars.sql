-- Migration 015: Create hosting_app_env_vars table for encrypted env var storage

CREATE TABLE hosting_app_env_vars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hosting_app_id  UUID NOT NULL REFERENCES hosting_apps(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  is_secret       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each app can have at most one value per key
  UNIQUE (hosting_app_id, key),

  -- Key name validation: starts with letter/underscore, alphanumeric + underscore only
  CHECK (key ~ '^[A-Za-z_][A-Za-z0-9_]*$')
);

-- Trigger: reuses update_updated_at() from migration 002
CREATE TRIGGER trg_env_vars_updated
  BEFORE UPDATE ON hosting_app_env_vars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin-only access (env vars contain secrets)
ALTER TABLE hosting_app_env_vars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage env vars"
  ON hosting_app_env_vars
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM customers WHERE id = auth.uid() AND is_admin = true)
  );

-- Index for fast lookups by app
CREATE INDEX idx_env_vars_app ON hosting_app_env_vars(hosting_app_id);
