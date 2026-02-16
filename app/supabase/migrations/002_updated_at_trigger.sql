-- Auto-update updated_at timestamp on customers and domains
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at
  before update on customers
  for each row execute function update_updated_at();

drop trigger if exists domains_updated_at on domains;
create trigger domains_updated_at
  before update on domains
  for each row execute function update_updated_at();
