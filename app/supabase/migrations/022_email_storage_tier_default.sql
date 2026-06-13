-- BUG-15: The mailbox storage_tier column defaulted to 'standard', which is
-- unprovisionable under OMA's 20 GB per-mailbox cap. Move the safety-net default
-- to 'basic' (the smallest, always-provisionable tier). The application always
-- passes an explicit storage_tier on insert, so this only matters as a fallback.
alter table email_mailboxes
  alter column storage_tier set default 'basic';
