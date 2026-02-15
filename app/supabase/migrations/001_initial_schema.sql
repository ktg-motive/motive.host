-- Motive Hosting: Initial Schema
-- Customers, domains, contacts, transactions

-- customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  xcloud_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- domains
create table domains (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) not null,
  domain_name text unique not null,
  registered_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean default false,
  privacy_enabled boolean default false,
  status text not null default 'pending',
  opensrs_order_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- domain_contacts
create table domain_contacts (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid references domains(id) not null,
  contact_type text not null, -- registrant, admin, tech, billing
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  org_name text,
  created_at timestamptz default now()
);

-- transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) not null,
  domain_id uuid references domains(id),
  type text not null, -- register, renew, transfer
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table customers enable row level security;
alter table domains enable row level security;
alter table domain_contacts enable row level security;
alter table transactions enable row level security;

-- RLS policies: customers see only their own data
create policy "Users can view own customer record" on customers
  for select using (auth.uid() = id);

create policy "Users can update own customer record" on customers
  for update using (auth.uid() = id);

create policy "Users can view own domains" on domains
  for select using (customer_id = auth.uid());

create policy "Users can view own domain contacts" on domain_contacts
  for select using (
    domain_id in (select id from domains where customer_id = auth.uid())
  );

create policy "Users can view own transactions" on transactions
  for select using (customer_id = auth.uid());
