// app/src/app/api/hosting/[appSlug]/webhook/route.ts
//
// Webhook configuration API for push-to-deploy.
// Admin-only. GET returns current config, POST updates it.
//
// The webhook URL follows the pattern:
//   https://my.motive.host/api/webhooks/deploy/{appSlug}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateWebhookSecret } from '../../../../../../lib/server-mgmt/webhook';
import { encryptValue, decryptValue } from '../../../../../../lib/server-mgmt/env';

interface RouteContext {
  params: Promise<{ appSlug: string }>;
}

const WEBHOOK_BASE_URL = 'https://my.motive.host/api/webhooks/deploy';

/**
 * GET /api/hosting/[appSlug]/webhook
 * Returns current webhook configuration.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const { appSlug } = await params;

  // Auth: admin only
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

  // Fetch app
  const adminDb = createAdminClient();
  const { data: app } = await adminDb
    .from('hosting_apps')
    .select('id, app_slug, managed_by, webhook_enabled, webhook_secret, git_branch')
    .eq('app_slug', appSlug)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (app.managed_by !== 'self-managed') {
    return NextResponse.json(
      { error: 'Webhooks are only supported for self-managed apps' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    enabled: app.webhook_enabled,
    branch: app.git_branch,
    webhook_url: `${WEBHOOK_BASE_URL}/${app.app_slug}`,
    has_secret: !!app.webhook_secret,
  });
}

/**
 * POST /api/hosting/[appSlug]/webhook
 * Update webhook configuration.
 *
 * Body:
 *   enabled?: boolean      -- toggle push-to-deploy
 *   branch?: string        -- branch that triggers deploy
 *   regenerate_secret?: boolean -- generate a new secret (returned once)
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { appSlug } = await params;

  // Auth: admin only
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

  // Fetch app
  const adminDb = createAdminClient();
  const { data: app } = await adminDb
    .from('hosting_apps')
    .select('id, app_slug, managed_by, webhook_enabled, webhook_secret, git_branch')
    .eq('app_slug', appSlug)
    .single();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (app.managed_by !== 'self-managed') {
    return NextResponse.json(
      { error: 'Webhooks are only supported for self-managed apps' },
      { status: 400 },
    );
  }

  // Parse body
  let body: { enabled?: boolean; branch?: string; regenerate_secret?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  let plainSecret: string | undefined;

  if (typeof body.enabled === 'boolean') {
    updates.webhook_enabled = body.enabled;
  }

  if (typeof body.branch === 'string' && body.branch.length > 0) {
    // Basic branch name validation: alphanumeric, hyphens, underscores, slashes, dots
    if (!/^[a-zA-Z0-9._\-/]+$/.test(body.branch)) {
      return NextResponse.json(
        { error: 'Invalid branch name' },
        { status: 400 },
      );
    }
    updates.git_branch = body.branch;
  }

  if (body.regenerate_secret) {
    plainSecret = generateWebhookSecret();
    updates.webhook_secret = encryptValue(plainSecret);
  }

  // If enabling webhooks for the first time and no secret exists, auto-generate
  if (body.enabled === true && !app.webhook_secret && !plainSecret) {
    plainSecret = generateWebhookSecret();
    updates.webhook_secret = encryptValue(plainSecret);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No updates provided' },
      { status: 400 },
    );
  }

  // Apply updates
  const { error: updateError } = await adminDb
    .from('hosting_apps')
    .update(updates)
    .eq('id', app.id);

  if (updateError) {
    console.error(`[webhook config] Update failed for ${appSlug}:`, updateError);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Build response
  const response: Record<string, unknown> = {
    success: true,
    webhook_url: `${WEBHOOK_BASE_URL}/${app.app_slug}`,
  };

  // Only return the secret when it was just generated (write-once pattern)
  if (plainSecret) {
    response.secret = plainSecret;
  }

  return NextResponse.json(response);
}
