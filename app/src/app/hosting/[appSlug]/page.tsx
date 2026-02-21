import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getRunCloudClient } from '@/lib/runcloud-client';
import SiteOverview from '@/components/hosting/site-overview';

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
    .select('id, app_slug, app_name, app_type, primary_domain, runcloud_app_id, runcloud_server_id, cached_status, created_at')
    .eq('app_slug', appSlug)
    .eq('customer_id', user.id)
    .single();

  if (!app) {
    notFound();
  }

  // Fetch live data from RunCloud in parallel
  let webapp = null;
  let ssl = null;
  let domains: { id: number; name: string; webapp_id: number; created_at: string }[] = [];
  let git = null;

  try {
    const rc = getRunCloudClient();
    const [webappResult, sslResult, domainsResult, gitResult] = await Promise.allSettled([
      rc.getWebApp(app.runcloud_app_id),
      rc.getSSL(app.runcloud_app_id),
      rc.getDomains(app.runcloud_app_id),
      rc.getGit(app.runcloud_app_id),
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
  } catch (err) {
    console.error('RunCloud API unavailable:', err);
  }

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

      <SiteOverview
        appSlug={app.app_slug}
        app={app}
        webapp={webapp}
        ssl={ssl}
        domains={domains}
        git={git}
      />
    </div>
  );
}
