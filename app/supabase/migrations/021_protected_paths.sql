-- Migration 021: Per-path basic auth (e.g. protect /admin/ without site-wide auth)

ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS protected_paths TEXT[] DEFAULT '{}';

-- Constraint: paths must be safe segments (lowercase alphanum, hyphens, underscores only)
ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_protected_paths_format
  CHECK (protected_paths = '{}' OR (
    array_length(protected_paths, 1) <= 10
    AND NOT EXISTS (
      SELECT 1 FROM unnest(protected_paths) AS p
      WHERE p !~ '^/[a-z0-9_-]+(/[a-z0-9_-]+)*/$'
    )
  ));
