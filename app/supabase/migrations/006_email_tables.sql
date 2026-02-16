-- ============================================================================
-- Migration 006: Email Management Tables
-- Motive Mail — hosted email product on OpenSRS OMA
-- ============================================================================

-- ── Stripe columns on customers ─────────────────────────────────────────────
alter table customers
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text;

-- ── email_domains ──────────────────────────────────────────────────────────
create table email_domains (
  id              uuid primary key default gen_random_uuid(),
  domain_id       uuid not null references domains(id) on delete restrict,
  customer_id     uuid not null references customers(id) on delete restrict,
  domain_name     text not null,

  opensrs_status  text not null default 'pending'
    check (opensrs_status in ('pending', 'active', 'suspended', 'deleted')),

  mx_verified     boolean not null default false,
  spf_verified    boolean not null default false,
  dkim_verified   boolean not null default false,
  dmarc_verified  boolean not null default false,
  dkim_selector   text,
  dkim_record     text,

  catch_all_address text,
  spam_filter_level text not null default 'moderate'
    check (spam_filter_level in ('aggressive', 'moderate', 'permissive')),

  mailbox_count           integer not null default 0,
  storage_used_bytes      bigint not null default 0,
  storage_provisioned_bytes bigint not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (domain_id),
  unique (domain_name)
);

create index idx_email_domains_customer on email_domains(customer_id);

-- ── email_mailboxes ────────────────────────────────────────────────────────
create table email_mailboxes (
  id                uuid primary key default gen_random_uuid(),
  email_domain_id   uuid not null references email_domains(id) on delete restrict,
  customer_id       uuid not null references customers(id) on delete restrict,

  email_address     text not null,
  local_part        text not null,
  domain_name       text not null,

  display_name      text,
  mailbox_type      text not null default 'mailbox'
    check (mailbox_type in ('mailbox', 'forward', 'filter')),
  storage_tier      text not null default 'standard'
    check (storage_tier in ('basic', 'standard', 'plus')),
  storage_quota_bytes bigint not null,
  storage_used_bytes  bigint not null default 0,

  status            text not null default 'active'
    check (status in ('active', 'suspended', 'pending_deletion', 'deleted')),
  password_change_required boolean not null default false,
  forward_to        text,

  stripe_subscription_item_id text,
  stripe_price_id   text,

  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  unique (email_address)
);

create index idx_email_mailboxes_domain on email_mailboxes(email_domain_id);
create index idx_email_mailboxes_customer on email_mailboxes(customer_id);
create index idx_email_mailboxes_status on email_mailboxes(status) where status != 'deleted';

-- ── email_aliases (Phase D) ────────────────────────────────────────────────
create table email_aliases (
  id              uuid primary key default gen_random_uuid(),
  mailbox_id      uuid not null references email_mailboxes(id) on delete cascade,
  alias_address   text not null,
  created_at      timestamptz not null default now(),

  unique (alias_address)
);

-- ── email_audit_log ────────────────────────────────────────────────────────
create table email_audit_log (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete restrict,
  actor_id        uuid not null,
  action          text not null
    check (action in (
      'domain_provisioned', 'domain_deleted', 'domain_suspended',
      'mailbox_created', 'mailbox_deleted', 'mailbox_suspended',
      'mailbox_reactivated', 'password_reset', 'password_force_change',
      'storage_changed', 'alias_created', 'alias_deleted',
      'forwarding_configured', 'catch_all_set', 'dns_auto_configured'
    )),
  target_type     text not null
    check (target_type in ('domain', 'mailbox', 'alias')),
  target_id       uuid,
  target_label    text,
  details         jsonb,
  created_at      timestamptz not null default now()
);

create index idx_email_audit_customer on email_audit_log(customer_id);
create index idx_email_audit_created on email_audit_log(created_at desc);
create index idx_email_audit_target on email_audit_log(target_type, target_id);

-- ── email_migrations (Phase D) ─────────────────────────────────────────────
create table email_migrations (
  id              uuid primary key default gen_random_uuid(),
  email_domain_id uuid not null references email_domains(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete restrict,
  status          text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  checklist       jsonb not null default '{}'::jsonb,
  old_provider    text,
  notes           text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),

  unique (email_domain_id)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
create trigger trg_email_domains_updated
  before update on email_domains
  for each row execute function update_updated_at();

create trigger trg_email_mailboxes_updated
  before update on email_mailboxes
  for each row execute function update_updated_at();

create trigger trg_email_migrations_updated
  before update on email_migrations
  for each row execute function update_updated_at();

-- ── RPC functions for atomic counter updates ────────────────────────────────
create or replace function increment_mailbox_count(
  p_email_domain_id uuid,
  p_quota_bytes bigint
) returns void as $$
begin
  update email_domains
  set mailbox_count = mailbox_count + 1,
      storage_provisioned_bytes = storage_provisioned_bytes + p_quota_bytes
  where id = p_email_domain_id
    and customer_id = auth.uid();
  if not found then
    raise exception 'email domain not found or not owned by caller';
  end if;
end;
$$ language plpgsql security definer;

create or replace function decrement_mailbox_count(
  p_email_domain_id uuid,
  p_quota_bytes bigint
) returns void as $$
begin
  update email_domains
  set mailbox_count = greatest(0, mailbox_count - 1),
      storage_provisioned_bytes = greatest(0, storage_provisioned_bytes - p_quota_bytes)
  where id = p_email_domain_id
    and customer_id = auth.uid();
  if not found then
    raise exception 'email domain not found or not owned by caller';
  end if;
end;
$$ language plpgsql security definer;

-- Restrict RPC execute to authenticated users only
revoke execute on function increment_mailbox_count(uuid, bigint) from public;
revoke execute on function decrement_mailbox_count(uuid, bigint) from public;
grant execute on function increment_mailbox_count(uuid, bigint) to authenticated;
grant execute on function decrement_mailbox_count(uuid, bigint) to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table email_domains enable row level security;
alter table email_mailboxes enable row level security;
alter table email_aliases enable row level security;
alter table email_audit_log enable row level security;
alter table email_migrations enable row level security;

-- email_domains
create policy "Users can view own email domains"
  on email_domains for select
  using (customer_id = auth.uid());

create policy "Users can insert own email domains"
  on email_domains for insert
  with check (customer_id = auth.uid());

create policy "Users can update own email domains"
  on email_domains for update
  using (customer_id = auth.uid());

-- email_mailboxes
create policy "Users can view own mailboxes"
  on email_mailboxes for select
  using (customer_id = auth.uid());

create policy "Users can insert own mailboxes"
  on email_mailboxes for insert
  with check (customer_id = auth.uid());

create policy "Users can update own mailboxes"
  on email_mailboxes for update
  using (customer_id = auth.uid());

-- email_aliases
create policy "Users can view own aliases"
  on email_aliases for select
  using (
    mailbox_id in (
      select id from email_mailboxes where customer_id = auth.uid()
    )
  );

create policy "Users can insert own aliases"
  on email_aliases for insert
  with check (
    mailbox_id in (
      select id from email_mailboxes where customer_id = auth.uid()
    )
  );

create policy "Users can delete own aliases"
  on email_aliases for delete
  using (
    mailbox_id in (
      select id from email_mailboxes where customer_id = auth.uid()
    )
  );

-- email_audit_log
create policy "Users can view own email audit logs"
  on email_audit_log for select
  using (customer_id = auth.uid());

create policy "Users can insert own email audit logs"
  on email_audit_log for insert
  with check (customer_id = auth.uid());

-- email_migrations
create policy "Users can view own email migrations"
  on email_migrations for select
  using (customer_id = auth.uid());

create policy "Users can insert own email migrations"
  on email_migrations for insert
  with check (customer_id = auth.uid());

create policy "Users can update own email migrations"
  on email_migrations for update
  using (customer_id = auth.uid());
