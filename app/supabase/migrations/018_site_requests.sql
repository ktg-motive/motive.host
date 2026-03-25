create table site_requests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete restrict,
  domain          text not null,
  app_type        text not null check (app_type in ('wordpress', 'nodejs', 'static')),
  description     text not null default '',
  git_repo_url    text,
  status          text not null default 'pending'
    check (status in ('pending', 'approved', 'provisioned', 'rejected')),
  admin_notes     text,
  reviewed_by     uuid references customers(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_site_requests_customer_id on site_requests(customer_id);
create index idx_site_requests_status on site_requests(status);

create trigger trg_site_requests_updated
  before update on site_requests
  for each row execute function update_updated_at();

alter table site_requests enable row level security;

create policy "Users can view own site requests"
  on site_requests for select
  using (customer_id = auth.uid());

create policy "Users can insert own site requests"
  on site_requests for insert
  with check (customer_id = auth.uid() and status = 'pending');

create policy "Admins can view all site requests"
  on site_requests for select
  using (exists (select 1 from customers where customers.id = auth.uid() and customers.is_admin = true));

create policy "Admins can update site requests"
  on site_requests for update
  using (exists (select 1 from customers where customers.id = auth.uid() and customers.is_admin = true));

create policy "Admins can delete site requests"
  on site_requests for delete
  using (exists (select 1 from customers where customers.id = auth.uid() and customers.is_admin = true));

-- Atomic quota-checked insert (prevents race conditions on concurrent submissions)
create or replace function insert_site_request_if_quota(
  p_customer_id uuid,
  p_max_sites int,
  p_domain text,
  p_app_type text,
  p_description text,
  p_git_repo_url text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_used int;
  v_id uuid;
begin
  -- Lock the customer row to serialize all quota checks for this customer
  perform 1 from customers where id = p_customer_id for update;

  -- Count used slots atomically
  select (
    (select count(*) from hosting_apps where customer_id = p_customer_id) +
    (select count(*) from site_requests where customer_id = p_customer_id and status in ('pending', 'approved'))
  ) into v_used;

  if v_used >= p_max_sites then
    raise exception 'QUOTA_EXCEEDED';
  end if;

  insert into site_requests (customer_id, domain, app_type, description, git_repo_url)
  values (p_customer_id, p_domain, p_app_type, p_description, p_git_repo_url)
  returning id into v_id;

  return v_id;
end;
$$;
