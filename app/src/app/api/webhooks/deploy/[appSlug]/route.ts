// app/src/app/api/webhooks/deploy/[appSlug]/route.ts
//
// Public webhook endpoint for push-to-deploy (GitHub/GitLab).
// NO Supabase session auth -- authenticated via webhook signature.
//
// Flow:
//   1. Look up app by slug (admin client -- no user session)
//   2. Verify webhook signature (GitHub HMAC-SHA256 or GitLab token)
//   3. Extract branch, check if it matches configured deploy branch
//   4. Begin durable operation (rejects 409 if deploy already in progress)
//   5. Run deploy synchronously (env sync, pull, build, restart)
//   6. Complete or fail the operation, return result
//
// The deploy runs synchronously in a long-lived PM2 process.
// GitHub may time out waiting (10s), but the deploy completes regardless.
// The operation row is the source of truth, not the HTTP response.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  verifyGitHubSignature,
  verifyGitLabToken,
  extractBranch,
  shouldDeploy,
} from '../../../../../../lib/server-mgmt/webhook';
import { decryptValue } from '../../../../../../lib/server-mgmt/env';
import { deployAndRestart, writeDeployLog } from '../../../../../../lib/server-mgmt/deploy';
import { writeEnvFile, type EnvVar } from '../../../../../../lib/server-mgmt/env';
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

export async function POST(req: Request, { params }: RouteContext) {
  const { appSlug } = await params;
  const adminDb = createAdminClient();

  // 1. Look up the app (no user session -- public endpoint)
  const { data: app } = await adminDb
    .from('hosting_apps')
    .select('id, app_slug, app_type, managed_by, webhook_enabled, webhook_secret, git_branch, git_subdir, deploy_template, port')
    .eq('app_slug', appSlug)
    .single();

  // Normalize all "not deployable" states to the same 404 to prevent slug enumeration
  if (!app || app.managed_by !== 'diy' || !app.webhook_enabled || !app.webhook_secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 2. Read raw body for signature verification
  const rawBody = await req.text();

  // Decrypt the stored webhook secret
  let secret: string;
  try {
    secret = decryptValue(app.webhook_secret);
  } catch (err) {
    console.error(`[webhook] Failed to decrypt webhook secret for ${appSlug}:`, err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // 3. Verify signature -- detect provider from headers
  const githubSig = req.headers.get('x-hub-signature-256');
  const gitlabToken = req.headers.get('x-gitlab-token');

  let verified = false;
  if (githubSig) {
    verified = verifyGitHubSignature(rawBody, githubSig, secret);
  } else if (gitlabToken) {
    verified = verifyGitLabToken(gitlabToken, secret);
  }

  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 4. Parse payload and extract branch
  let payload: { ref?: string; deleted?: boolean };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventBranch = extractBranch(payload);
  const isDeleteEvent = payload.deleted === true;

  if (!shouldDeploy({ eventBranch, configuredBranch: app.git_branch, isDeleteEvent })) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Push to ${eventBranch ?? 'unknown'} does not match configured branch ${app.git_branch}`,
    }, { status: 200 });
  }

  // 5. Recover stale operations, then begin a new one
  await recoverStaleOperations(adminDb).catch(() => { /* best-effort */ });

  const operation = await beginOperation(
    adminDb,
    app.id,
    'deploy',
    'webhook',
    { branch: eventBranch, trigger: 'push' },
  );

  if (!operation) {
    return NextResponse.json(
      { error: 'Deploy already in progress' },
      { status: 409 },
    );
  }

  // 6. Run deploy synchronously so the operation completes before the response.
  //    This is a long-lived PM2 process, not serverless -- the request stays alive.
  //    GitHub webhooks time out at 10s, but that's OK: GitHub gets a timeout while
  //    the deploy completes. The operation row is the source of truth, not the HTTP response.
  //    If the process crashes mid-deploy, recoverStaleOperations() cleans up.
  const stopHeartbeat = startHeartbeat(adminDb, operation.id);
  try {
    // Sync env vars from DB to disk (always -- even if empty, to remove stale vars)
    const { data: envVars } = await adminDb
      .from('hosting_app_env_vars')
      .select('key, encrypted_value, is_secret')
      .eq('hosting_app_id', app.id);

    await writeEnvFile(app.app_slug, (envVars ?? []) as EnvVar[]);

    // Determine template for deploy
    const template = app.app_type === 'static'
      ? 'static' as const
      : (app.deploy_template as 'nextjs' | 'express' | 'generic') ?? 'generic';

    // Run the deploy
    const result = await deployAndRestart({
      appSlug: app.app_slug,
      branch: app.git_branch,
      subdir: app.git_subdir ?? undefined,
      port: app.port ?? undefined,
      template,
    });

    // Write deploy log to disk
    await writeDeployLog(app.app_slug, result).catch((err) => {
      console.error(`[webhook] Failed to write deploy log for ${app.app_slug}:`, err);
    });

    if (result.success) {
      await adminDb
        .from('hosting_apps')
        .update({ cached_last_deploy: new Date().toISOString() })
        .eq('id', app.id);

      await completeOperation(adminDb, operation.id, {
        duration_ms: result.durationMs,
        trigger: 'webhook',
      });
    } else {
      await failOperation(
        adminDb,
        operation.id,
        `Deploy failed: ${result.stderr.slice(0, 500)}`,
        { duration_ms: result.durationMs, trigger: 'webhook' },
      );
    }

    // Log activity (best-effort)
    try {
      const { data: appRow } = await adminDb.from('hosting_apps').select('customer_id').eq('id', app.id).single();
      await adminDb.from('hosting_activity').insert({
        customer_id: appRow?.customer_id,
        hosting_app_id: app.id,
        action: 'force_deploy',
        description: result.success
          ? `Webhook deploy completed (${app.git_branch}, ${result.durationMs}ms)`
          : `Webhook deploy failed (${app.git_branch})`,
        status: result.success ? 'success' : 'error',
      });
    } catch (actErr) {
      console.error(`[webhook] Failed to log activity for ${app.app_slug}:`, actErr);
    }

    return NextResponse.json({
      ok: true,
      operationId: operation.id,
      success: result.success,
      duration_ms: result.durationMs,
    }, { status: result.success ? 200 : 500 });
  } catch (err) {
    console.error(`[webhook] Deploy pipeline error for ${app.app_slug}:`, err);
    try {
      await failOperation(
        adminDb,
        operation.id,
        err instanceof Error ? err.message : 'Unknown deploy error',
      );
    } catch { /* best-effort */ }

    return NextResponse.json(
      { error: 'Deploy failed', operationId: operation.id },
      { status: 500 },
    );
  } finally {
    stopHeartbeat();
  }
}
