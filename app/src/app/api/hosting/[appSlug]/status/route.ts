// app/src/app/api/hosting/[appSlug]/status/route.ts
//
// Returns PM2 process status for a self-managed app.
// Only meaningful for Node.js apps; static apps return { status: 'static' }.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppStatus } from '../../../../../../lib/server-mgmt/actions';

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
    .select('id, app_slug, app_type, managed_by')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (app.managed_by !== 'self-managed') {
    return NextResponse.json(
      { error: 'Status endpoint is only available for self-managed apps' },
      { status: 400 },
    );
  }

  if (app.app_type === 'static') {
    return NextResponse.json({ status: 'static' });
  }

  const status = await getAppStatus(app.app_slug);
  return NextResponse.json(status);
}
