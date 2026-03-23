-- Migration 013: Add disabled_at to customers for soft-disable functionality
alter table customers
  add column if not exists disabled_at timestamptz;

-- Index for quickly filtering active vs disabled customers
create index if not exists idx_customers_disabled
  on customers(disabled_at) where disabled_at is not null;
