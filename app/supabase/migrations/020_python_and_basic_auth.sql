-- Migration 020: Python app support + basic auth

-- Expand app_type CHECK constraint
ALTER TABLE hosting_apps DROP CONSTRAINT IF EXISTS hosting_apps_app_type_check;
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_app_type_check
  CHECK (app_type IN ('wordpress', 'nodejs', 'static', 'python'));

-- Python-specific runtime configuration
ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS python_module     TEXT DEFAULT 'app:app',
  ADD COLUMN IF NOT EXISTS gunicorn_workers  INTEGER DEFAULT 2;

-- DB-level constraints for Python config invariants
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_gunicorn_workers_range
  CHECK (gunicorn_workers >= 1 AND gunicorn_workers <= 8);
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_python_module_format
  CHECK (python_module ~ '^[a-zA-Z_][a-zA-Z0-9_.]*:[a-zA-Z_][a-zA-Z0-9_]*$');

-- Basic auth columns
ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS basic_auth_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS basic_auth_user    TEXT;

-- DB-level constraint: basic_auth_user required when basic_auth_enabled
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_basic_auth_user_required
  CHECK (NOT basic_auth_enabled OR basic_auth_user IS NOT NULL);
