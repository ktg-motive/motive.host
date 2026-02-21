-- ============================================================================
-- Migration 011: Add billing cleanup tracking
-- Supports safe Stripe failure handling in delete and tier-change flows
-- ============================================================================

-- Expand mailbox status enum to include billing cleanup state
alter table email_mailboxes
  drop constraint if exists email_mailboxes_status_check;

alter table email_mailboxes
  add constraint email_mailboxes_status_check
  check (status in ('active', 'suspended', 'pending_deletion', 'pending_billing_cleanup', 'deleted'));

-- Track billing errors for async retry
alter table email_mailboxes
  add column if not exists billing_error text,
  add column if not exists billing_error_at timestamptz;

-- Expand domain status to track billing cleanup
alter table email_domains
  drop constraint if exists email_domains_opensrs_status_check;

alter table email_domains
  add constraint email_domains_opensrs_status_check
  check (opensrs_status in ('pending', 'active', 'suspended', 'pending_billing_cleanup', 'deleted'));

-- Index for finding records that need billing cleanup
create index idx_email_mailboxes_billing_cleanup
  on email_mailboxes(status) where status = 'pending_billing_cleanup';

-- Expand audit log actions
alter table email_audit_log
  drop constraint if exists email_audit_log_action_check;

alter table email_audit_log
  add constraint email_audit_log_action_check
  check (action in (
    'domain_provisioned', 'domain_deleted', 'domain_suspended',
    'mailbox_created', 'mailbox_deleted', 'mailbox_suspended',
    'mailbox_reactivated', 'password_reset', 'password_force_change',
    'storage_changed', 'alias_created', 'alias_deleted',
    'forwarding_configured', 'catch_all_set', 'dns_auto_configured',
    'billing_cleanup_pending', 'billing_cleanup_completed', 'billing_cleanup_failed'
  ));
