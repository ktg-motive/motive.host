import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { handleRunCloudError } from '@/lib/api-utils';

const execFileAsync = promisify(execFile);

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

  // 4. Rebuild: RunCloud API for managed apps, PM2 restart for DIY apps
  if (app.managed_by === 'diy') {
    if (app.app_type === 'static') {
      return NextResponse.json(
        { error: 'Static sites do not have a running process to restart' },
        { status: 400 },
      );
    }

    try {
      await execFileAsync('pm2', ['restart', app.app_slug], { timeout: 15_000 });
    } catch (err) {
      console.error(`[rebuild] PM2 restart failed for ${app.app_slug}:`, err);
      return NextResponse.json(
        { error: 'Restart failed — check server logs' },
        { status: 500 },
      );
    }
  } else {
    const rc = getRunCloudClient();
    try {
      await rc.rebuildApp(app.runcloud_app_id);
      rc.invalidateApp(app.runcloud_app_id);
    } catch (err) {
      return handleRunCloudError(err);
    }
  }

  // 5. Log activity (best-effort — don't fail the request if this fails)
  try {
    await adminDb.from('hosting_activity').insert({
      customer_id: user.id,
      hosting_app_id: app.id,
      action: 'rebuild',
      description: 'App rebuild triggered',
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'App is restarting' });
}
