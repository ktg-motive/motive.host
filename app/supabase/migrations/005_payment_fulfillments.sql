-- Payment fulfillments: idempotent domain registration keyed by Stripe PaymentIntent
-- Prevents replay attacks, race conditions, and inconsistent refund state.

create table payment_fulfillments (
  id uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id text unique not null,
  customer_id uuid references customers(id) not null,
  domain_name text not null,
  period integer not null,
  amount_cents integer not null,
  status text not null default 'pending',  -- pending, fulfilled, fulfilled_partial, failed_refunded, failed_refund_pending
  opensrs_order_id text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_fulfillments_customer on payment_fulfillments(customer_id);
create index idx_fulfillments_domain on payment_fulfillments(domain_name);

-- Auto-update updated_at
create trigger payment_fulfillments_updated_at
  before update on payment_fulfillments
  for each row execute function update_updated_at();

-- Enable RLS
alter table payment_fulfillments enable row level security;

-- Users can view their own fulfillments
create policy "Users can view own fulfillments" on payment_fulfillments
  for select using (customer_id = auth.uid());

-- Users can insert their own fulfillments (app creates the pending record)
create policy "Users can insert own fulfillments" on payment_fulfillments
  for insert with check (customer_id = auth.uid());

-- Users can update their own fulfillments (app transitions pending -> fulfilled/failed)
create policy "Users can update own fulfillments" on payment_fulfillments
  for update using (customer_id = auth.uid());
