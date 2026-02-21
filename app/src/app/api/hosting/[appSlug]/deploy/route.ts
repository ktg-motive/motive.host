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

  // 3. Only Node.js apps support force deploy
  if (app.app_type !== 'nodejs') {
    return NextResponse.json(
      { error: 'Force deploy is only available for Node.js applications' },
      { status: 400 },
    );
  }

  // 4. Get git config
  const rc = getRunCloudClient();
  let git;
  try {
    git = await rc.getGit(app.runcloud_app_id);
  } catch (err) {
    return handleRunCloudError(err);
  }

  if (!git) {
    return NextResponse.json(
      { error: 'No git repository configured for this application' },
      { status: 400 },
    );
  }

  // 5. Rate limit: one deploy per 30 seconds per app
  const adminDb = createAdminClient();
  const { count: recentCount, error: countError } = await adminDb
    .from('hosting_activity')
    .select('*', { count: 'exact', head: true })
    .eq('hosting_app_id', app.id)
    .eq('action', 'force_deploy')
    .gte('created_at', new Date(Date.now() - 30_000).toISOString());

  if (countError) {
    console.error('Rate limit check failed:', countError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (recentCount !== null && recentCount > 0) {
    return NextResponse.json(
      { error: 'Please wait 30 seconds before deploying again' },
      { status: 429 },
    );
  }

  // 6. Trigger deploy then invalidate cache
  try {
    await rc.forceDeploy(app.runcloud_app_id, git.id);
    rc.invalidateApp(app.runcloud_app_id);
  } catch (err) {
    return handleRunCloudError(err);
  }

  // 7. Log activity (best-effort)
  try {
    await adminDb.from('hosting_activity').insert({
      customer_id: user.id,
      hosting_app_id: app.id,
      action: 'force_deploy',
      description: `Force deploy triggered from ${git.branch}`,
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'Deploy started' });
}
