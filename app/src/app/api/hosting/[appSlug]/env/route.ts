import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptValue, decryptValue, isValidEnvKey, writeEnvFile } from '../../../../../../lib/server-mgmt/env';
import type { EnvVar } from '../../../../../../lib/server-mgmt/env';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RouteContext {
  params: Promise<{ appSlug: string }>;
}

/**
 * Shared auth + app lookup for all methods.
 * Returns the admin DB client and the hosting app row, or an error response.
 */
async function authorizeAndLookup(appSlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const adminDb = createAdminClient();
  const { data: app } = await adminDb
    .from('hosting_apps')
    .select('id, app_slug')
    .eq('app_slug', appSlug)
    .single();

  if (!app) {
    return { error: NextResponse.json({ error: 'App not found' }, { status: 404 }) };
  }

  return { adminDb, app };
}

/**
 * Re-fetch all env vars for an app from Supabase and rewrite its .env file on disk.
 * Returns a warning string if the file write fails, or null on success.
 */
async function syncEnvFileToDisk(
  adminDb: SupabaseClient,
  appId: string,
  appSlug: string,
): Promise<string | null> {
  const { data: rows, error } = await adminDb
    .from('hosting_app_env_vars')
    .select('key, encrypted_value, is_secret')
    .eq('hosting_app_id', appId)
    .order('key', { ascending: true });

  if (error) {
    console.error('[env syncEnvFileToDisk] Failed to re-fetch env vars:', error);
    return 'Failed to re-fetch env vars from database; .env file was NOT updated.';
  }

  const vars: EnvVar[] = (rows ?? []).map((r) => ({
    key: r.key,
    encrypted_value: r.encrypted_value,
    is_secret: r.is_secret,
  }));

  try {
    await writeEnvFile(appSlug, vars);
    return null;
  } catch (err) {
    console.error('[env syncEnvFileToDisk] Failed to write .env file:', err);
    return 'Database updated but failed to write .env file to disk. The running app still has stale config.';
  }
}

/**
 * GET /api/hosting/[appSlug]/env
 *
 * Returns all env vars for the app. Secret values are masked.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const { appSlug } = await params;
  const result = await authorizeAndLookup(appSlug);
  if ('error' in result) return result.error;
  const { adminDb, app } = result;

  const { data: rows, error } = await adminDb
    .from('hosting_app_env_vars')
    .select('id, key, encrypted_value, is_secret, updated_at')
    .eq('hosting_app_id', app.id)
    .order('key', { ascending: true });

  if (error) {
    console.error('[env GET] Failed to fetch env vars:', error);
    return NextResponse.json({ error: 'Failed to fetch env vars' }, { status: 500 });
  }

  const vars = (rows ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    value: row.is_secret ? '********' : decryptValue(row.encrypted_value),
    is_secret: row.is_secret,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ vars });
}

/**
 * POST /api/hosting/[appSlug]/env
 *
 * Upsert env vars. Accepts { vars: [{ key, value, is_secret? }] }.
 * Max 50 vars per request.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { appSlug } = await params;
  const result = await authorizeAndLookup(appSlug);
  if ('error' in result) return result.error;
  const { adminDb, app } = result;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = body as { vars?: Array<{ key: string; value: string; is_secret?: boolean }> };
  if (!parsed.vars || !Array.isArray(parsed.vars)) {
    return NextResponse.json({ error: 'Missing "vars" array' }, { status: 400 });
  }
  if (parsed.vars.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 vars per request' }, { status: 400 });
  }

  // Validate all keys before any writes
  const invalidKeys: string[] = [];
  for (const v of parsed.vars) {
    if (!v.key || typeof v.key !== 'string' || !isValidEnvKey(v.key)) {
      invalidKeys.push(v.key ?? '(empty)');
    }
    if (typeof v.value !== 'string') {
      return NextResponse.json({ error: `Value for key "${v.key}" must be a string` }, { status: 400 });
    }
  }
  if (invalidKeys.length > 0) {
    return NextResponse.json(
      { error: `Invalid env var key(s): ${invalidKeys.join(', ')}. Keys must match /^[A-Za-z_][A-Za-z0-9_]*$/` },
      { status: 400 },
    );
  }

  // Encrypt all values upfront, then upsert in a single atomic call
  const rows = parsed.vars.map((v) => ({
    hosting_app_id: app.id,
    key: v.key,
    encrypted_value: encryptValue(v.value),
    is_secret: v.is_secret ?? false,
  }));

  const { error: upsertError } = await adminDb
    .from('hosting_app_env_vars')
    .upsert(rows, { onConflict: 'hosting_app_id,key' });

  if (upsertError) {
    console.error('[env POST] Failed to upsert env vars:', upsertError);
    return NextResponse.json(
      { error: 'Failed to upsert env vars', detail: upsertError.message },
      { status: 500 },
    );
  }

  const count = rows.length;

  // Sync the .env file on disk with the updated database state
  const fileWarning = await syncEnvFileToDisk(adminDb, app.id, app.app_slug);

  return NextResponse.json({
    success: true,
    count,
    env_file_updated: !fileWarning,
    ...(fileWarning ? { warning: fileWarning } : {}),
  });
}

/**
 * DELETE /api/hosting/[appSlug]/env
 *
 * Delete env vars by key. Accepts { keys: ["KEY1", "KEY2"] }.
 */
export async function DELETE(req: Request, { params }: RouteContext) {
  const { appSlug } = await params;
  const result = await authorizeAndLookup(appSlug);
  if ('error' in result) return result.error;
  const { adminDb, app } = result;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = body as { keys?: string[] };
  if (!parsed.keys || !Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    return NextResponse.json({ error: 'Missing "keys" array' }, { status: 400 });
  }

  const { data, error } = await adminDb
    .from('hosting_app_env_vars')
    .delete()
    .eq('hosting_app_id', app.id)
    .in('key', parsed.keys)
    .select('id');

  if (error) {
    console.error('[env DELETE] Failed to delete env vars:', error);
    return NextResponse.json({ error: 'Failed to delete env vars' }, { status: 500 });
  }

  // Sync the .env file on disk with the updated database state
  const fileWarning = await syncEnvFileToDisk(adminDb, app.id, app.app_slug);

  return NextResponse.json({
    success: true,
    deleted: data?.length ?? 0,
    env_file_updated: !fileWarning,
    ...(fileWarning ? { warning: fileWarning } : {}),
  });
}
