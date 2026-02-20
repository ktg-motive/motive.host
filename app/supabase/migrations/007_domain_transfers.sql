-- Domain transfer columns and payment_fulfillments type discriminator

-- Transfer tracking columns on domains
alter table domains
  add column if not exists transfer_order_id text,
  add column if not exists transfer_status text check (transfer_status in (
    'pending', 'processing', 'approved', 'completed', 'failed', 'cancelled'
  )),
  add column if not exists transfer_initiated_at timestamptz,
  add column if not exists transfer_completed_at timestamptz;

-- Type discriminator on payment_fulfillments (register | transfer)
alter table payment_fulfillments
  add column if not exists type text not null default 'register'
    check (type in ('register', 'transfer'));
