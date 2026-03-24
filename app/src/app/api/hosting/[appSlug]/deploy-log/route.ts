// app/src/app/api/hosting/[appSlug]/deploy-log/route.ts
//
// Returns the last deploy log for a DIY-managed app.
// Reads from disk: /home/motive-host/webapps/{appSlug}/.deploy.log

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDeployLog } from '../../../../../../lib/server-mgmt/actions';

interface RouteContext {
  params: Promise<{ appSlug: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { appSlug } = await params;

  // Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch hosting app (scoped to authenticated user)
  const { data: app } = await supabase
    .from('hosting_apps')
    .select('id, app_slug, managed_by')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (app.managed_by !== 'diy') {
    return NextResponse.json(
      { error: 'Deploy log endpoint is only available for DIY-managed apps' },
      { status: 400 },
    );
  }

  const log = await getDeployLog(app.app_slug);
  return NextResponse.json({ log });
}
