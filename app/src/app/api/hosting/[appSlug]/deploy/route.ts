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

  // 2. Fetch hosting app (scoped to authenticated user or admin)
  const adminDb = createAdminClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  let app;
  if (customer?.is_admin) {
    const { data } = await adminDb
      .from('hosting_apps')
      .select('id, app_slug, app_type, app_name, runcloud_app_id, customer_id, deploy_template, deploy_method, port, git_branch, git_subdir')
      .eq('app_slug', appSlug)
      .single();
    app = data;
  } else {
    const { data } = await supabase
      .from('hosting_apps')
      .select('id, app_slug, app_type, app_name, runcloud_app_id, customer_id, deploy_template, deploy_method, port, git_branch, git_subdir')
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

  // 4. Try RunCloud git deploy first, fall back to local deploy
  const rc = getRunCloudClient();
  let git;
  try {
    git = await rc.getGit(app.runcloud_app_id);
  } catch {
    // RunCloud git not available — will use local deploy
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
    // Local deploy: git pull + build + restart (same server)
    const appDir = `/home/motive-host/webapps/${appSlug}`;
    // Try common deploy key naming patterns
    const keyBase = `/home/motive-host/.ssh`;
    const candidates = [
      `${keyBase}/${appSlug}_deploy`,
      `${keyBase}/${appSlug.replace(/-com$/, '')}_deploy`,
      `${keyBase}/${appSlug.replace(/-[a-z]+$/, '')}_deploy`,
    ];
    let deployKeyPath = candidates[0]; // default
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
      // Remove public symlink so git can restore the real public/ directory
      await execFileAsync('bash', ['-c', `test -L ${appDir}/public && rm -f ${appDir}/public || true`]);

      // Git fetch + reset with per-app deploy key (supports non-main branches)
      await execFileAsync('git', ['-C', appDir, 'fetch', 'origin', branch], {
        env: { ...process.env, GIT_SSH_COMMAND: `ssh -i ${deployKeyPath} -o StrictHostKeyChecking=no` },
        timeout: 30_000,
      });
      await execFileAsync('git', ['-C', appDir, 'reset', '--hard', `origin/${branch}`], {
        timeout: 10_000,
      });

      // Force-restore public/ from git (in case pull didn't restore it)
      await execFileAsync('git', ['-C', appDir, 'checkout', '--', 'public'], {
        timeout: 10_000,
      }).catch(() => { /* public/ may not exist in repo */ });

      // Install dependencies (in subdir if applicable)
      await execFileAsync('npm', ['install', '--production=false'], {
        cwd: workDir,
        timeout: 120_000,
      });

      // Build (Vite copies public/ into dist/ during this step)
      try {
        await execFileAsync('npm', ['run', 'build'], {
          cwd: workDir,
          timeout: 120_000,
        });
      } catch {
        // No build script is fine for some apps
      }

      // For static sites (Vite etc): replace public/ with symlink to dist/ AFTER build
      // Vite needs public/ as a real directory during build to copy assets into dist/
      const distDir = app.git_subdir ? `${workDir}/dist` : `${appDir}/dist`;
      const { stdout: lsStat } = await execFileAsync('ls', ['-d', distDir]).catch(() => ({ stdout: '' }));
      if (lsStat.trim()) {
        await execFileAsync('bash', ['-c', `rm -rf ${appDir}/public && ln -sfn ${distDir} ${appDir}/public`]);
      }

      // For Node.js apps with PM2: restart
      if (app.app_type === 'nodejs' && app.port) {
        try {
          await execFileAsync('pm2', ['restart', appSlug]);
        } catch {
          // App might not be running yet — start it
          await execFileAsync('bash', ['-c',
            `cd ${workDir} && PORT=${app.port} pm2 start npm --name "${appSlug}" -- start && pm2 save`
          ]);
        }
      }
    } catch (err) {
      console.error(`[deploy] local deploy failed for ${appSlug}:`, err);
      return NextResponse.json(
        { error: 'Deploy failed — check server logs' },
        { status: 500 },
      );
    }
  }

  // 5. Log activity
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
