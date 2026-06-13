-- BUG-15 follow-up: reconcile existing email data after the tier resize.
--
-- The tier resize (basic 10->5 GB, standard 25->10 GB, plus 50->15 GB) changed the
-- *meaning* of tier labels. Existing mailbox rows and domain counters were written
-- under the old sizes, so they must be reconciled or they will display/charge wrong.
--
-- Mailbox-row reconciliation (storage_tier) was performed as a one-time operation
-- against live OMA `get_user` quotas, which a migration cannot read: every existing
-- mailbox was provisioned at 10 GB in OMA (the new Standard size), so 10 GB rows were
-- set to storage_tier='standard' to match the real platform quota. That state is
-- already live; the statement below is the idempotent expression of it (a no-op on
-- already-reconciled data) so a fresh replay reaches the same place.
--
-- IMPORTANT — billing safety: tier is a billable attribute. The billing endpoint
-- derives monthly totals from storage_tier, while the Stripe subscription item is
-- only updated through the PATCH tier-change path. So this relabel is scoped to rows
-- with NO active Stripe item (stripe_subscription_item_id is null) — it can never
-- silently desync a billed mailbox from its Stripe price. Any billed legacy mailbox
-- must be migrated through the app's tier-change flow, which updates Stripe + the DB
-- price id together. (All currently-affected rows are unbilled internal mailboxes.)
update email_mailboxes
  set storage_tier = 'standard',
      updated_at = now()
  where status not in ('deleted', 'pending_billing_cleanup')
    and storage_quota_bytes = 10737418240  -- 10 GB
    and storage_tier <> 'standard'
    and stripe_subscription_item_id is null;

-- Recompute each domain's provisioned-storage counter and mailbox count from the
-- actual mailbox rows. This is generically correct and idempotent: it self-heals any
-- drift (e.g. a per-mailbox quota edit that did not cascade to the domain counter).
update email_domains d
  set storage_provisioned_bytes = coalesce(agg.bytes_sum, 0),
      mailbox_count = coalesce(agg.box_count, 0),
      updated_at = now()
  from (
    select e.id,
           sum(m.storage_quota_bytes) as bytes_sum,
           count(m.id) as box_count
    from email_domains e
    left join email_mailboxes m
      on m.email_domain_id = e.id
      and m.status not in ('deleted', 'pending_billing_cleanup')
    group by e.id
  ) agg
  where d.id = agg.id
    and (d.storage_provisioned_bytes is distinct from coalesce(agg.bytes_sum, 0)
         or d.mailbox_count is distinct from coalesce(agg.box_count, 0));
