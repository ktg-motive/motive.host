import { redirect, notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import SiteTabs from '@/components/hosting/site-tabs';
import type { RunCloudDomain, RunCloudActionLog } from '@runcloud';

interface PageProps {
  params: Promise<{ appSlug: string }>;
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { appSlug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch the hosting app by slug -- RLS ensures customer_id matches
  const { data: app } = await supabase
    .from('hosting_apps')
    .select('id, app_slug, app_name, app_type, primary_domain, runcloud_app_id, runcloud_server_id, cached_status, managed_by, created_at, ssl_pending, domain_aliases, webhook_enabled, git_branch, git_repo, deploy_template, port')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) {
    notFound();
  }

  // Fetch live data from RunCloud in parallel (only for RunCloud-managed apps)
  let webapp = null;
  let ssl = null;
  let domains: RunCloudDomain[] = [];
  let git = null;
  let actionLog: RunCloudActionLog[] = [];
  let deployKeyPublic: string | null = null;
  let lastOperation: { operation_type: string; status: string; created_at: string; error_message: string | null } | null = null;
  let isAdmin = false;

  if (app.managed_by !== 'diy') {
    try {
      const rc = getRunCloudClient();
      const [webappResult, sslResult, domainsResult, gitResult, logResult] = await Promise.allSettled([
        rc.getWebApp(app.runcloud_app_id),
        rc.getSSL(app.runcloud_app_id),
        rc.getDomains(app.runcloud_app_id),
        rc.getGit(app.runcloud_app_id),
        rc.getActionLog(app.runcloud_app_id),
      ]);

      if (webappResult.status === 'fulfilled') {
        webapp = webappResult.value;
      } else {
        console.error('Failed to fetch webapp:', webappResult.reason);
      }

      if (sslResult.status === 'fulfilled') {
        ssl = sslResult.value;
      } else {
        console.error('Failed to fetch SSL:', sslResult.reason);
      }

      if (domainsResult.status === 'fulfilled') {
        domains = domainsResult.value;
      } else {
        console.error('Failed to fetch domains:', domainsResult.reason);
      }

      if (gitResult.status === 'fulfilled') {
        git = gitResult.value;
      } else {
        console.error('Failed to fetch git:', gitResult.reason);
      }

      if (logResult.status === 'fulfilled') {
        actionLog = logResult.value;
      } else {
        console.error('Failed to fetch action log:', logResult.reason);
      }
    } catch (err) {
      console.error('RunCloud API unavailable:', err);
    }
  } else {
    // DIY apps: derive SSL and domain state from DB record
    const sslInstalled = app.ssl_pending === false;
    if (sslInstalled) {
      ssl = {
        id: 0,
        webapp_id: 0,
        method: "Let's Encrypt",
        ssl_enabled: true,
        encryption_type: 'letsencrypt',
        hsts: false,
        hsts_subdomains: false as const,
        hsts_preload: false,
        validUntil: null,
        created_at: app.created_at,
      };
    }

    // Build domain list from primary_domain + domain_aliases
    const aliases: string[] = (app.domain_aliases as string[] | null) ?? [];
    const allDomains = [app.primary_domain, ...aliases];
    domains = allDomains.map((name, idx) => ({
      id: idx,
      name,
      webapp_id: 0,
      created_at: app.created_at,
    }));

    // Read the deploy key public key from disk (best-effort)
    try {
      deployKeyPublic = await readFile(
        `/home/motive-host/.ssh/${app.app_slug}_deploy.pub`,
        'utf-8',
      );
    } catch {
      // Deploy key may not exist (e.g., static site with no git repo)
    }

    // Fetch most recent operation for this app
    const adminDb = createAdminClient();
    const { data: recentOp } = await adminDb
      .from('hosting_operations')
      .select('operation_type, status, created_at, error_message')
      .eq('hosting_app_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentOp) {
      lastOperation = recentOp;
    }
  }

  // Check admin status for gating admin-only UI sections
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  isAdmin = customer?.is_admin === true;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/hosting"
          className="mb-4 inline-flex items-center text-sm text-slate transition-colors hover:text-gold"
        >
          &larr; Back to Hosting
        </Link>
        <h1 className="font-display text-3xl font-bold text-muted-white">
          {app.app_name}
        </h1>
        <p className="mt-1 font-mono text-sm text-slate">{app.primary_domain}</p>
      </div>

      <SiteTabs
        appSlug={app.app_slug}
        app={app}
        webapp={webapp}
        ssl={ssl}
        domains={domains}
        git={git}
        actionLog={actionLog}
        sftpHost={process.env.RUNCLOUD_SERVER_IP ?? ''}
        deployKeyPublic={deployKeyPublic}
        lastOperation={lastOperation}
        isAdmin={isAdmin}
      />
    </div>
  );
}
