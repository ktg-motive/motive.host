import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/plans';
import { siteRequestSchema } from '@/lib/hosting-schemas';
import { sendSiteRequestNotification } from '@/lib/sendgrid';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch customer plan
  const { data: customer } = await supabase
    .from('customers')
    .select('plan, name, email')
    .eq('id', user.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const plan = getPlan(customer.plan);
  if (!plan) {
    return NextResponse.json({ error: 'No active plan' }, { status: 403 });
  }

  // Validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = siteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { domain, app_type, description, git_repo_url } = parsed.data;

  // Atomic quota-checked insert via RPC (prevents race conditions)
  const adminDb = createAdminClient();
  const { data: requestId, error: rpcError } = await adminDb.rpc('insert_site_request_if_quota', {
    p_customer_id: user.id,
    p_max_sites: plan.sites,
    p_domain: domain,
    p_app_type: app_type,
    p_description: description,
    p_git_repo_url: git_repo_url ?? null,
  });

  if (rpcError) {
    if (rpcError.message?.includes('QUOTA_EXCEEDED')) {
      return NextResponse.json(
        { error: `Site limit reached. Your ${plan.name} plan allows ${plan.sites} site${plan.sites === 1 ? '' : 's'}.` },
        { status: 403 },
      );
    }
    console.error('[site-requests POST] RPC failed:', rpcError);
    return NextResponse.json(
      { error: 'Failed to create site request', detail: rpcError.message },
      { status: 500 },
    );
  }

  // Fire-and-forget admin notification
  sendSiteRequestNotification({
    customerName: customer.name ?? 'Unknown',
    customerEmail: customer.email ?? user.email ?? 'Unknown',
    domain,
    appType: app_type,
    description,
    gitRepoUrl: git_repo_url,
  }).catch((err) => {
    console.error('[site-requests POST] Failed to send admin notification:', err);
  });

  return NextResponse.json(
    { success: true, request: { id: requestId, domain, status: 'pending' } },
    { status: 201 },
  );
}
