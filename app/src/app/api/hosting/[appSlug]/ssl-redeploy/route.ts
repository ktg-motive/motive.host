import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { handleRunCloudError } from '@/lib/api-utils';
import { renewSSL } from '../../../../../../lib/server-mgmt/actions';
import {
  beginOperation,
  completeOperation,
  failOperation,
  recoverStaleOperations,
  startHeartbeat,
} from '../../../../../../lib/server-mgmt/operations';

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
    .select('id, app_slug, app_type, runcloud_app_id, customer_id, managed_by, primary_domain')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 3. Rate limit: one SSL redeploy per hour (Let's Encrypt rate limit protection)
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

  // 4. Redeploy SSL -- branch on managed_by
  if (app.managed_by === 'self-managed') {
    // Self-managed: force-renew via certbot
    // Cert name uses the bare domain (www. stripped) -- matches how provisioning issues the cert
    const certDomain = app.primary_domain?.toLowerCase().replace(/^www\./, '');
    if (!certDomain) {
      return NextResponse.json(
        { error: 'No primary domain configured for this app' },
        { status: 400 },
      );
    }

    // Recover any stale operations before checking for active ones
    await recoverStaleOperations(adminDb).catch(() => { /* best-effort */ });

    const operation = await beginOperation(adminDb, app.id, 'ssl_renew', 'api');
    if (!operation) {
      return NextResponse.json(
        { error: 'Another operation is already in progress for this app' },
        { status: 409 },
      );
    }

    const stopHeartbeat = startHeartbeat(adminDb, operation.id);
    try {
      await renewSSL(certDomain);
      await completeOperation(adminDb, operation.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSL renewal failed';
      await failOperation(adminDb, operation.id, message).catch(() => { /* best-effort */ });
      console.error(`[ssl-redeploy] certbot renew failed for ${certDomain}:`, err);
      return NextResponse.json(
        { error: 'SSL renewal failed -- check server logs', operation_id: operation.id },
        { status: 500 },
      );
    } finally {
      stopHeartbeat();
    }
  } else {
    // RunCloud-managed: use RunCloud API
    if (!app.runcloud_app_id) {
      return NextResponse.json(
        { error: 'RunCloud app ID not configured' },
        { status: 400 },
      );
    }

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

    try {
      await rc.redeploySSL(app.runcloud_app_id, ssl.id);
      rc.invalidateApp(app.runcloud_app_id);
    } catch (err) {
      return handleRunCloudError(err);
    }
  }

  // 5. Log activity (best-effort)
  try {
    await adminDb.from('hosting_activity').insert({
      customer_id: user.id,
      hosting_app_id: app.id,
      action: 'ssl_redeploy',
      description: app.managed_by === 'self-managed'
        ? `SSL certificate force-renewed via certbot for ${app.primary_domain?.toLowerCase().replace(/^www\./, '')}`
        : 'SSL certificate redeployed via RunCloud',
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'SSL redeploy started' });
}
