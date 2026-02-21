-- ============================================================================
-- Migration 008: Hosting Apps + Admin Flag
-- Links RunCloud web applications to customers; adds is_admin to customers
-- ============================================================================

-- ── is_admin flag on customers ────────────────────────────────────────────
alter table customers
  add column if not exists is_admin boolean not null default false;

-- ── hosting_apps ──────────────────────────────────────────────────────────
create table hosting_apps (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete restrict,

  -- RunCloud identifiers
  runcloud_app_id     integer not null unique,
  runcloud_server_id  integer not null default 338634,

  -- Display metadata (denormalized for fast dashboard loads)
  app_slug            text not null unique,
  app_name            text not null,
  app_type            text not null default 'wordpress'
    check (app_type in ('wordpress', 'nodejs', 'static')),
  primary_domain      text not null,

  -- Provisioning metadata
  provisioned_by      uuid references customers(id),
  provisioned_at      timestamptz not null default now(),

  -- Status cache (updated from RunCloud API or background refresh)
  cached_status       text
    check (cached_status is null or cached_status in ('running', 'stopped', 'error', 'unknown')),
  cached_ssl_expiry   timestamptz,
  cached_last_deploy  timestamptz,
  cache_updated_at    timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Indexes
create index idx_hosting_apps_customer_id on hosting_apps(customer_id);
create index idx_hosting_apps_app_slug on hosting_apps(app_slug);

-- updated_at trigger (reuses function from migration 002)
create trigger trg_hosting_apps_updated
  before update on hosting_apps
  for each row execute function update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table hosting_apps enable row level security;

-- Customers can view their own hosting apps
create policy "Users can view own hosting apps"
  on hosting_apps for select
  using (customer_id = auth.uid());

-- Admins can view all hosting apps
create policy "Admins can view all hosting apps"
  on hosting_apps for select
  using (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );

-- Admins can insert hosting apps (provisioning)
create policy "Admins can insert hosting apps"
  on hosting_apps for insert
  with check (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );

-- Admins can update hosting apps (cache refresh, metadata changes)
create policy "Admins can update hosting apps"
  on hosting_apps for update
  using (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );

-- Admins can delete hosting apps (deprovisioning)
create policy "Admins can delete hosting apps"
  on hosting_apps for delete
  using (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );
