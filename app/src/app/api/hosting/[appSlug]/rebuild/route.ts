import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { handleRunCloudError } from '@/lib/api-utils';
import { restartApp } from '../../../../../../lib/server-mgmt/actions';
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
    .select('id, app_slug, app_type, runcloud_app_id, customer_id, managed_by')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 3. Rate limit: one rebuild per 30 seconds per app
  const adminDb = createAdminClient();
  const { count: recentCount, error: countError } = await adminDb
    .from('hosting_activity')
    .select('*', { count: 'exact', head: true })
    .eq('hosting_app_id', app.id)
    .eq('action', 'rebuild')
    .gte('created_at', new Date(Date.now() - 30_000).toISOString());

  if (countError) {
    console.error('Rate limit check failed:', countError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (recentCount !== null && recentCount > 0) {
    return NextResponse.json(
      { error: 'Please wait 30 seconds before restarting again' },
      { status: 429 },
    );
  }

  // 4. Rebuild: RunCloud API for managed apps, PM2 restart for self-managed apps
  if (app.managed_by === 'self-managed') {
    if (app.app_type === 'static') {
      return NextResponse.json(
        { error: 'Static sites do not have a running process to restart' },
        { status: 400 },
      );
    }

    // Recover any stale operations before checking for active ones
    await recoverStaleOperations(adminDb).catch(() => { /* best-effort */ });

    const operation = await beginOperation(adminDb, app.id, 'restart', 'api');
    if (!operation) {
      return NextResponse.json(
        { error: 'Another operation is already in progress for this app' },
        { status: 409 },
      );
    }

    const stopHeartbeat = startHeartbeat(adminDb, operation.id);
    try {
      await restartApp(app.app_slug);
      await completeOperation(adminDb, operation.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restart failed';
      await failOperation(adminDb, operation.id, message).catch(() => { /* best-effort */ });
      console.error(`[rebuild] PM2 restart failed for ${app.app_slug}:`, err);
      return NextResponse.json(
        { error: 'Restart failed -- check server logs', operation_id: operation.id },
        { status: 500 },
      );
    } finally {
      stopHeartbeat();
    }
  } else {
    if (!app.runcloud_app_id) {
      return NextResponse.json(
        { error: 'RunCloud app ID not configured' },
        { status: 400 },
      );
    }

    const rc = getRunCloudClient();
    try {
      await rc.rebuildApp(app.runcloud_app_id);
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
      action: 'rebuild',
      description: app.managed_by === 'self-managed'
        ? `PM2 process restarted for ${app.app_slug}`
        : 'App rebuild triggered via RunCloud',
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'App is restarting' });
}
