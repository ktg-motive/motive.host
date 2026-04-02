-- Migration 021: Per-path basic auth (e.g. protect /admin/ without site-wide auth)

ALTER TABLE hosting_apps
  ADD COLUMN IF NOT EXISTS protected_paths TEXT[] DEFAULT '{}';

-- Validation function: paths must be safe segments (lowercase alphanum, hyphens, underscores only)
CREATE OR REPLACE FUNCTION check_protected_paths(paths TEXT[]) RETURNS BOOLEAN AS $$
DECLARE
  p TEXT;
BEGIN
  IF paths = '{}' THEN RETURN TRUE; END IF;
  IF array_length(paths, 1) > 10 THEN RETURN FALSE; END IF;
  FOREACH p IN ARRAY paths LOOP
    IF p !~ '^/[a-z0-9_-]+(/[a-z0-9_-]+)*/$' THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE hosting_apps ADD CONSTRAINT hosting_apps_protected_paths_format
  CHECK (check_protected_paths(protected_paths));
