-- DNS Audit Log: tracks all DNS record changes
create table dns_audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) not null,
  domain_name text not null,
  action text not null, -- 'add', 'update', 'delete', 'quick_setup'
  record_type text not null, -- 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'
  record_name text not null, -- subdomain / hostname
  old_value jsonb, -- previous record state (null for adds)
  new_value jsonb, -- new record state (null for deletes)
  created_at timestamptz default now()
);

create index idx_dns_audit_log_customer on dns_audit_log(customer_id);
create index idx_dns_audit_log_domain on dns_audit_log(domain_name);
create index idx_dns_audit_log_created on dns_audit_log(created_at desc);

-- Enable RLS
alter table dns_audit_log enable row level security;

-- Users can view their own DNS audit logs
create policy "Users can view own dns audit logs" on dns_audit_log
  for select using (customer_id = auth.uid());

-- Users can insert their own DNS audit logs
create policy "Users can insert own dns audit logs" on dns_audit_log
  for insert with check (customer_id = auth.uid());
