import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { handleRunCloudError } from '@/lib/api-utils';
import { deployAndRestart, writeDeployLog } from '../../../../../../lib/server-mgmt/deploy';
import { writeEnvFile, type EnvVar } from '../../../../../../lib/server-mgmt/env';
import { injectAnalyticsScript } from '../../../../../../lib/server-mgmt/analytics';
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

  // 2. Fetch hosting app (scoped to authenticated user or admin)
  const adminDb = createAdminClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  let app;
  const selectCols = 'id, app_slug, app_type, app_name, runcloud_app_id, customer_id, deploy_template, deploy_method, port, git_branch, git_subdir, managed_by, umami_website_id';
  if (customer?.is_admin) {
    const { data } = await adminDb
      .from('hosting_apps')
      .select(selectCols)
      .eq('app_slug', appSlug)
      .single();
    app = data;
  } else {
    const { data } = await supabase
      .from('hosting_apps')
      .select(selectCols)
      .eq('app_slug', appSlug)
      .eq('customer_id', user.id)
      .single();
    app = data;
  }

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 3. Rate limit: one deploy per 30 seconds per app
  const { count: recentCount } = await adminDb
    .from('hosting_activity')
    .select('*', { count: 'exact', head: true })
    .eq('hosting_app_id', app.id)
    .eq('action', 'force_deploy')
    .gte('created_at', new Date(Date.now() - 30_000).toISOString());

  if (recentCount !== null && recentCount > 0) {
    return NextResponse.json(
      { error: 'Please wait 30 seconds before deploying again' },
      { status: 429 },
    );
  }

  // 4. Branch: self-managed vs RunCloud
  if (app.managed_by === 'self-managed') {
    return handleDiyDeploy(adminDb, app);
  }

  // RunCloud path (existing behavior)
  return handleRunCloudDeploy(adminDb, app);
}

/**
 * Self-managed deploy: durable operation + env sync + deployAndRestart
 */
async function handleDiyDeploy(
  adminDb: ReturnType<typeof createAdminClient>,
  app: {
    id: string;
    app_slug: string;
    app_type: string;
    customer_id: string;
    deploy_template: string | null;
    port: number | null;
    git_branch: string;
    git_subdir: string | null;
    umami_website_id: string | null;
  },
) {
  // Recover any stale operations before checking for active ones
  await recoverStaleOperations(adminDb).catch(() => { /* best-effort */ });

  const operation = await beginOperation(adminDb, app.id, 'deploy', 'api');
  if (!operation) {
    return NextResponse.json(
      { error: 'Another operation is already in progress for this app' },
      { status: 409 },
    );
  }

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

    // Run the deploy pipeline
    const result = await deployAndRestart({
      appSlug: app.app_slug,
      branch: app.git_branch,
      subdir: app.git_subdir ?? undefined,
      port: app.port ?? undefined,
      template,
    });

    // Write deploy log to disk (best-effort)
    await writeDeployLog(app.app_slug, result).catch((err) => {
      console.error(`[deploy] Failed to write deploy log for ${app.app_slug}:`, err);
    });

    // Inject analytics script into built HTML (best-effort)
    if (result.success && app.umami_website_id) {
      await injectAnalyticsScript(app.app_slug, app.umami_website_id).catch((err) => {
        console.warn(`[deploy] Analytics injection failed for ${app.app_slug}:`, err instanceof Error ? err.message : err);
      });
    }

    if (result.success) {
      // Update cached_last_deploy timestamp
      await adminDb
        .from('hosting_apps')
        .update({ cached_last_deploy: new Date().toISOString() })
        .eq('id', app.id);

      await completeOperation(adminDb, operation.id, {
        duration_ms: result.durationMs,
      });

      // Log activity (best-effort)
      try {
        await adminDb.from('hosting_activity').insert({
          customer_id: app.customer_id,
          hosting_app_id: app.id,
          action: 'force_deploy',
          description: `Deploy completed (${result.durationMs}ms)`,
          status: 'success',
        });
      } catch (actErr) {
        console.error('Failed to record hosting activity:', actErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Deploy completed',
        duration_ms: result.durationMs,
        operation_id: operation.id,
      });
    } else {
      await failOperation(
        adminDb,
        operation.id,
        `Deploy failed: ${result.stderr.slice(0, 500)}`,
        { duration_ms: result.durationMs },
      );

      // Log activity (best-effort)
      try {
        await adminDb.from('hosting_activity').insert({
          customer_id: app.customer_id,
          hosting_app_id: app.id,
          action: 'force_deploy',
          description: `Deploy failed: ${result.stderr.slice(0, 200)}`,
          status: 'error',
        });
      } catch (actErr) {
        console.error('Failed to record hosting activity:', actErr);
      }

      return NextResponse.json(
        { error: 'Deploy failed', details: result.stderr.slice(0, 500), operation_id: operation.id },
        { status: 500 },
      );
    }
  } catch (err) {
    // Unexpected error -- fail the operation
    const message = err instanceof Error ? err.message : 'Unknown error';
    await failOperation(adminDb, operation.id, message).catch(() => { /* best-effort */ });

    console.error(`[deploy] Unexpected error for ${app.app_slug}:`, err);
    return NextResponse.json(
      { error: 'Deploy failed', operation_id: operation.id },
      { status: 500 },
    );
  } finally {
    stopHeartbeat();
  }
}

/**
 * RunCloud deploy: existing behavior (git deploy via RunCloud API with local fallback)
 */
async function handleRunCloudDeploy(
  adminDb: ReturnType<typeof createAdminClient>,
  app: {
    id: string;
    app_slug: string;
    app_type: string;
    app_name: string;
    runcloud_app_id: number | null;
    customer_id: string;
    deploy_template: string | null;
    deploy_method: string | null;
    port: number | null;
    git_branch: string;
    git_subdir: string | null;
  },
) {
  if (!app.runcloud_app_id) {
    return NextResponse.json(
      { error: 'RunCloud app ID not configured' },
      { status: 400 },
    );
  }

  const rc = getRunCloudClient();
  let git;
  try {
    git = await rc.getGit(app.runcloud_app_id);
  } catch {
    // RunCloud git not available -- will use local deploy
  }

  if (git) {
    // RunCloud-managed git deploy
    try {
      await rc.forceDeploy(app.runcloud_app_id, git.id);
      rc.invalidateApp(app.runcloud_app_id);
    } catch (err) {
      return handleRunCloudError(err);
    }
  } else {
    // Local deploy fallback for RunCloud apps without git config
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const appDir = `/home/motive-host/webapps/${app.app_slug}`;
    const keyBase = `/home/motive-host/.ssh`;
    const candidates = [
      `${keyBase}/${app.app_slug}_deploy`,
      `${keyBase}/${app.app_slug.replace(/-com$/, '')}_deploy`,
      `${keyBase}/${app.app_slug.replace(/-[a-z]+$/, '')}_deploy`,
    ];
    let deployKeyPath = candidates[0];
    for (const candidate of candidates) {
      try {
        await execFileAsync('test', ['-f', candidate]);
        deployKeyPath = candidate;
        break;
      } catch {
        // try next
      }
    }

    const branch = app.git_branch || 'main';
    const workDir = app.git_subdir ? `${appDir}/${app.git_subdir}` : appDir;

    try {
      await execFileAsync('bash', ['-c', `test -L ${appDir}/public && rm -f ${appDir}/public || true`]);
      await execFileAsync('git', ['-C', appDir, 'fetch', 'origin', branch], {
        env: { ...process.env, GIT_SSH_COMMAND: `ssh -i ${deployKeyPath} -o StrictHostKeyChecking=no` },
        timeout: 30_000,
      });
      await execFileAsync('git', ['-C', appDir, 'reset', '--hard', `origin/${branch}`], { timeout: 10_000 });
      await execFileAsync('git', ['-C', appDir, 'checkout', '--', 'public'], { timeout: 10_000 })
        .catch(() => { /* public/ may not exist */ });

      await execFileAsync('npm', ['install', '--production=false'], { cwd: workDir, timeout: 120_000 });

      try {
        await execFileAsync('npm', ['run', 'build'], { cwd: workDir, timeout: 120_000 });
      } catch {
        // No build script is fine
      }

      const distDir = app.git_subdir ? `${workDir}/dist` : `${appDir}/dist`;
      const { stdout: lsStat } = await execFileAsync('ls', ['-d', distDir]).catch(() => ({ stdout: '' }));
      if (lsStat.trim()) {
        await execFileAsync('bash', ['-c', `rm -rf ${appDir}/public && ln -sfn ${distDir} ${appDir}/public`]);
      }

      if (app.app_type === 'nodejs' && app.port) {
        try {
          await execFileAsync('pm2', ['restart', app.app_slug]);
        } catch {
          await execFileAsync('bash', ['-c',
            `cd ${workDir} && PORT=${app.port} pm2 start npm --name "${app.app_slug}" -- start && pm2 save`
          ]);
        }
      }
    } catch (err) {
      console.error(`[deploy] local deploy failed for ${app.app_slug}:`, err);
      return NextResponse.json(
        { error: 'Deploy failed -- check server logs' },
        { status: 500 },
      );
    }
  }

  // Log activity
  try {
    await adminDb.from('hosting_activity').insert({
      customer_id: app.customer_id,
      hosting_app_id: app.id,
      action: 'force_deploy',
      description: git ? `Force deploy triggered from ${git.branch}` : 'Local deploy (git pull + build)',
      status: 'success',
    });
  } catch (err) {
    console.error('Failed to record hosting activity:', err);
  }

  return NextResponse.json({ success: true, message: 'Deploy completed' });
}
