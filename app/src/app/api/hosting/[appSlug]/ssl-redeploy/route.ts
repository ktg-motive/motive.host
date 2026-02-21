import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { handleRunCloudError } from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ appSlug: string }>;
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { appSlug } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Fetch hosting app (scoped to authenticated user)
  const { data: app } = await supabase
    .from('hosting_apps')
    .select('id, app_slug, app_type, runcloud_app_id, customer_id')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 3. Get SSL config
  const rc = getRunCloudClient();
  let ssl;
  try {
    ssl = await rc.getSSL(app.runcloud_app_id);
  } catch (err) {
    return handleRunCloudError(err);
  }

  if (!ssl) {
    return NextResponse.json(
      { error: 'No SSL certificate configured for this application' },
      { status: 400 },
    );
  }

  // 4. Rate limit: one SSL redeploy per hour (Let's Encrypt rate limit protection)
  const adminDb = createAdminClient();
  const { count: recentCount, error: countError } = await adminDb
    .from('hosting_activity')
    .select('*', { count: 'exact', head: true })
    .eq('hosting_app_id', app.id)
    .eq('action', 'ssl_redeploy')
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());

  if (countError) {
    console.error('Rate limit check failed:', countError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (recentCount !== null && recentCount > 0) {
    return NextResponse.json(
      { error: 'SSL can only be redeployed once per hour' },
      { status: 429 },
    );
  }

  // 5. Redeploy SSL then invalidate cache
  try {
    await rc.redeploySSL(app.runcloud_app_id, ssl.id);
    rc.invalidateApp(app.runcloud_app_id);
  } catch (err) {
    return handleRunCloudError(err);
  }

  // 6. Log activity (best-effort)
  try {
    await adminDb.from('hosting_activity').insert({
      customer_id: user.id,
      hosting_app_id: app.id,
      action: 'ssl_redeploy',
      description: 'SSL certificate redeployed',
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'SSL redeploy started' });
}
