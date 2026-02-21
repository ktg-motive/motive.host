import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { createHostingAppSchema } from '@/lib/hosting-schemas';
import { handleRunCloudError } from '@/lib/api-utils';
import { sendWelcomeHostingEmail } from '@/lib/sendgrid';

export async function POST(request: Request) {
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

  const parsed = createHostingAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 4. Verify the RunCloud app exists
  const rc = getRunCloudClient();
  try {
    await rc.getWebApp(parsed.data.runcloud_app_id);
  } catch (err) {
    return handleRunCloudError(err);
  }

  // 5. Verify the target customer exists
  const adminDb = createAdminClient();
  const { data: targetCustomer } = await adminDb
    .from('customers')
    .select('id, email, plan, name')
    .eq('id', parsed.data.customer_id)
    .single();

  if (!targetCustomer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // 6. Insert hosting_apps record
  const { data: hostingApp, error: insertError } = await adminDb
    .from('hosting_apps')
    .insert({
      customer_id: parsed.data.customer_id,
      runcloud_app_id: parsed.data.runcloud_app_id,
      app_slug: parsed.data.app_slug,
      app_name: parsed.data.app_name,
      app_type: parsed.data.app_type,
      primary_domain: parsed.data.primary_domain,
      provisioned_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Duplicate — this RunCloud app or slug is already linked' },
        { status: 409 },
      );
    }
    console.error('Failed to insert hosting app:', insertError);
    return NextResponse.json({ error: 'Failed to link hosting app' }, { status: 500 });
  }

  // Fire-and-forget welcome email — never block the response
  if (targetCustomer.email) {
    sendWelcomeHostingEmail(
      targetCustomer.email,
      targetCustomer.name ?? '',
      targetCustomer.plan ?? 'harbor',
      parsed.data.app_name,
      parsed.data.primary_domain,
    ).catch((err) => console.error('Welcome email failed:', err));
  }

  return NextResponse.json({ hostingApp }, { status: 201 });
}

export async function GET() {
  // Auth + admin check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminDb = createAdminClient();
  const { data, error } = await adminDb
    .from('hosting_apps')
    .select('*, customers(email, plan)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to list hosting apps:', error);
    return NextResponse.json({ error: 'Failed to list hosting apps' }, { status: 500 });
  }

  return NextResponse.json({ hostingApps: data });
}
