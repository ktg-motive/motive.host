-- Add Umami analytics website ID to hosting_apps
ALTER TABLE hosting_apps ADD COLUMN umami_website_id text;
