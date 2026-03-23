import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateCustomerSchema } from '@/lib/customer-schemas';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Check admin status
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Fetch customer detail with related data in parallel
  const adminDb = createAdminClient();
  const [customerRes, domainsRes, appsRes, emailDomainsRes] = await Promise.all([
    adminDb.from('customers').select('*').eq('id', id).single(),
    adminDb.from('domains').select('id, domain_name, status, registered_at, expires_at, auto_renew').eq('customer_id', id),
    adminDb.from('hosting_apps').select('id, app_slug, app_name, app_type, primary_domain, cached_status, created_at').eq('customer_id', id),
    adminDb.from('email_domains').select('id, domain_name, opensrs_status, mailbox_count').eq('customer_id', id),
  ]);

  if (!customerRes.data) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({
    customer: customerRes.data,
    domains: domainsRes.data ?? [],
    hosting_apps: appsRes.data ?? [],
    email_domains: emailDomainsRes.data ?? [],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Check admin status
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const adminDb = createAdminClient();

  // 4. Build update object dynamically (only include provided fields)
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) {
    update.name = input.name;
  }
  if (input.display_name !== undefined) {
    update.display_name = input.display_name || null;
  }
  if (input.company_name !== undefined) {
    update.company_name = input.company_name || null;
  }
  if (input.phone !== undefined) {
    update.phone = input.phone || null;
  }

  // 5. Handle plan change
  if (input.plan !== undefined) {
    update.plan = input.plan;
    update.plan_started_at = new Date().toISOString();
  }

  // 6. Handle disable/enable — set disabled_at in the update object (applied in step 7)
  const disableChanging = input.disabled !== undefined;
  if (disableChanging && input.disabled) {
    // Block self-disable
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot disable your own account' }, { status: 400 });
    }
    // Block disabling other admin accounts
    const { data: targetCustomer } = await adminDb
      .from('customers')
      .select('is_admin')
      .eq('id', id)
      .single();
    if (targetCustomer?.is_admin) {
      return NextResponse.json({ error: 'Cannot disable an admin account' }, { status: 400 });
    }
  }
  if (disableChanging) {
    update.disabled_at = input.disabled ? new Date().toISOString() : null;
  }

  // 7. Apply DB update first (before auth ban, so we can roll back on auth failure)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: updatedCustomer, error: updateError } = await adminDb
    .from('customers')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    console.error('[update-customer] failed to update customer:', updateError);
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 },
    );
  }

  if (!updatedCustomer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // 8. Apply auth ban/unban after DB update succeeds (rollback DB on auth failure)
  if (disableChanging) {
    const banDuration = input.disabled ? '876000h' : 'none';
    const { error: authError } = await adminDb.auth.admin.updateUserById(id, {
      ban_duration: banDuration,
    });
    if (authError) {
      console.error('[update-customer] auth ban/unban failed, rolling back DB:', authError);
      // Roll back the disabled_at change
      await adminDb.from('customers').update({
        disabled_at: input.disabled ? null : new Date().toISOString(),
      }).eq('id', id);
      return NextResponse.json(
        { error: `Failed to ${input.disabled ? 'disable' : 'enable'} auth account` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ customer: updatedCustomer });
}
