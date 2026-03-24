-- Migration 016: Create hosting_operations table for durable operation tracking
-- Enforces one active operation per app via unique partial index

CREATE TABLE hosting_operations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hosting_app_id  UUID NOT NULL REFERENCES hosting_apps(id) ON DELETE CASCADE,
  operation_type  TEXT NOT NULL
    CHECK (operation_type IN (
      'provision', 'deploy', 'restart', 'ssl_issue', 'ssl_renew', 'deprovision'
    )),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  trigger_source  TEXT NOT NULL DEFAULT 'api'
    CHECK (trigger_source IN ('api', 'webhook', 'system')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRITICAL: One active operation per app. This is the concurrency lock.
-- "Active" = status IN ('pending', 'running')
CREATE UNIQUE INDEX idx_operations_active_per_app
  ON hosting_operations(hosting_app_id)
  WHERE status IN ('pending', 'running');

-- Fast lookups
CREATE INDEX idx_operations_app ON hosting_operations(hosting_app_id);
CREATE INDEX idx_operations_status ON hosting_operations(status);
CREATE INDEX idx_operations_started ON hosting_operations(started_at DESC);

-- RLS: admin-only
ALTER TABLE hosting_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operations"
  ON hosting_operations
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM customers WHERE id = auth.uid() AND is_admin = true)
  );
