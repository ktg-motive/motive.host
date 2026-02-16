-- Insert policies for all tables (applied to production, missing from committed files)
-- Uses DO blocks to skip creation if policy already exists.

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own customer record' and tablename = 'customers') then
    create policy "Users can insert own customer record" on customers for insert with check (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own domains' and tablename = 'domains') then
    create policy "Users can insert own domains" on domains for insert with check (customer_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own domains' and tablename = 'domains') then
    create policy "Users can update own domains" on domains for update using (customer_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own domain contacts' and tablename = 'domain_contacts') then
    create policy "Users can insert own domain contacts" on domain_contacts for insert with check (
      domain_id in (select id from domains where customer_id = auth.uid())
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own transactions' and tablename = 'transactions') then
    create policy "Users can insert own transactions" on transactions for insert with check (customer_id = auth.uid());
  end if;
end $$;
