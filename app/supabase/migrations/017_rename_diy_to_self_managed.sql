-- Migration 017: Rename managed_by value 'diy' to 'self-managed'
-- Updates the CHECK constraint and all existing rows.

-- Drop the old CHECK constraint
ALTER TABLE hosting_apps DROP CONSTRAINT IF EXISTS hosting_apps_managed_by_check;

-- Update existing rows
UPDATE hosting_apps SET managed_by = 'self-managed' WHERE managed_by = 'diy';

-- Add the new CHECK constraint
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_managed_by_check
  CHECK (managed_by IN ('runcloud', 'self-managed'));
