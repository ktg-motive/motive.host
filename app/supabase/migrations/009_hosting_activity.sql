-- ============================================================================
-- Migration 009: Hosting Activity Log
-- Persists client-triggered hosting actions (rebuilds, deploys, SSL redeploys)
-- ============================================================================

create table hosting_activity (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  hosting_app_id  uuid references hosting_apps(id) on delete set null,
  action          text not null,  -- 'rebuild', 'force_deploy', 'ssl_redeploy'
  description     text,
  status          text not null default 'success'
    check (status in ('success', 'failed')),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index idx_hosting_activity_customer on hosting_activity(customer_id);
create index idx_hosting_activity_app on hosting_activity(hosting_app_id);
create index idx_hosting_activity_created on hosting_activity(created_at desc);

alter table hosting_activity enable row level security;

create policy "Users can view own hosting activity"
  on hosting_activity for select
  using (customer_id = auth.uid());

-- Admins can view all activity
create policy "Admins can view all hosting activity"
  on hosting_activity for select
  using (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );

-- Inserts are performed via service role (createAdminClient) from API routes,
-- which bypasses RLS. No anon/authenticated insert policy is intentional —
-- clients cannot self-insert activity; only server-side code can.
-- This policy allows admin-scoped inserts if ever needed via user client.
create policy "Admins can insert hosting activity"
  on hosting_activity for insert
  with check (
    exists (
      select 1 from customers
      where customers.id = auth.uid()
        and customers.is_admin = true
    )
  );
