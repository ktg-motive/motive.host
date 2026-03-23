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
      .select('id, app_slug, app_type, app_name, runcloud_app_id, customer_id, deploy_template, deploy_method, port')
      .eq('app_slug', appSlug)
      .single();
    app = data;
  } else {
    const { data } = await supabase
      .from('hosting_apps')
      .select('id, app_slug, app_type, app_name, runcloud_app_id, customer_id, deploy_template, deploy_method, port')
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
    const deployKeyPath = `/home/motive-host/.ssh/${appSlug.replace(/-com$/, '')}_deploy`;

    try {
      // Git pull with per-app deploy key
      await execFileAsync('git', ['-C', appDir, 'pull', 'origin', 'main'], {
        env: { ...process.env, GIT_SSH_COMMAND: `ssh -i ${deployKeyPath} -o StrictHostKeyChecking=no` },
        timeout: 30_000,
      });

      // Install + build
      await execFileAsync('npm', ['install', '--production=false'], {
        cwd: appDir,
        timeout: 120_000,
      });

      // Build (if the app has a build script)
      try {
        await execFileAsync('npm', ['run', 'build'], {
          cwd: appDir,
          timeout: 120_000,
        });
      } catch {
        // No build script is fine for some apps
      }

      // For static sites (Vite etc): symlink dist -> public
      const { stdout: lsStat } = await execFileAsync('ls', ['-d', `${appDir}/dist`]).catch(() => ({ stdout: '' }));
      if (lsStat.trim()) {
        await execFileAsync('bash', ['-c', `rm -rf ${appDir}/public && ln -sfn ${appDir}/dist ${appDir}/public`]);
      }

      // For Node.js apps with PM2: restart
      if (app.app_type === 'nodejs' && app.port) {
        try {
          await execFileAsync('pm2', ['restart', appSlug]);
        } catch {
          // App might not be running yet — start it
          await execFileAsync('bash', ['-c',
            `cd ${appDir} && PORT=${app.port} pm2 start npm --name "${appSlug}" -- start && pm2 save`
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
