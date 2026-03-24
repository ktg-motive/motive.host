-- Migration 014: Add DIY server management columns to hosting_apps
-- Enables dual-mode operation (RunCloud vs DIY) and webhook auto-deploy

-- managed_by column
ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS managed_by TEXT NOT NULL DEFAULT 'runcloud'
    CHECK (managed_by IN ('runcloud', 'diy'));

COMMENT ON COLUMN hosting_apps.managed_by IS
  'Management backend: runcloud (legacy) or diy (direct server management)';

-- Make runcloud_app_id nullable (DIY apps will not have one)
ALTER TABLE hosting_apps
  ALTER COLUMN runcloud_app_id DROP NOT NULL;

-- Webhook auto-deploy columns
ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS webhook_secret  TEXT,
  ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS git_branch      TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS git_repo        TEXT;

COMMENT ON COLUMN hosting_apps.webhook_secret IS
  'Encrypted per-app webhook secret for GitHub/GitLab signature verification';
COMMENT ON COLUMN hosting_apps.webhook_enabled IS
  'Whether push-to-deploy is active for this app';
COMMENT ON COLUMN hosting_apps.git_branch IS
  'Branch that triggers auto-deploy (default: main)';
COMMENT ON COLUMN hosting_apps.git_repo IS
  'Git clone URL (e.g. git@github.com:org/repo.git)';

-- Domain management columns
ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS domain_aliases  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS www_behavior    TEXT NOT NULL DEFAULT 'add_www'
    CHECK (www_behavior IN ('add_www', 'no_www', 'as_is')),
  ADD COLUMN IF NOT EXISTS dns_ownership   TEXT NOT NULL DEFAULT 'motive'
    CHECK (dns_ownership IN ('motive', 'external'));

COMMENT ON COLUMN hosting_apps.domain_aliases IS
  'Additional domains that resolve to this app (besides primary_domain)';
COMMENT ON COLUMN hosting_apps.www_behavior IS
  'How to handle www: add_www adds www prefix, no_www redirects www to bare, as_is does nothing';
COMMENT ON COLUMN hosting_apps.dns_ownership IS
  'Whether Motive controls DNS (auto-config) or customer manages externally';
