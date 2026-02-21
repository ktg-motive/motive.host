import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { getPlan } from '@/lib/plans';
import SiteCard from '@/components/hosting/site-card';
import Card from '@/components/ui/card';

export default async function HostingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: customer }, { data: hostingApps }] = await Promise.all([
    supabase
      .from('customers')
      .select('plan')
      .eq('id', user.id)
      .single(),
    supabase
      .from('hosting_apps')
      .select('app_slug, app_name, app_type, primary_domain, cached_status, cached_ssl_expiry, cached_last_deploy, runcloud_app_id, runcloud_server_id')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const plan = customer?.plan ?? 'harbor';
  const planInfo = getPlan(plan);
  const appList = hostingApps ?? [];
  const sitesLimit = planInfo?.sites ?? 0;

  // Fetch live data from RunCloud for each app
  const liveData = new Map<
    number,
    {
      status: string | null;
      sslValidUntil?: string | null;
      lastDeploy?: string | null;
    }
  >();

  if (appList.length > 0) {
    try {
      const rc = getRunCloudClient();
      const results = await Promise.allSettled(
        appList.map(async (app) => {
          const [webapp, ssl] = await Promise.allSettled([
            rc.getWebApp(app.runcloud_app_id),
            rc.getSSL(app.runcloud_app_id),
          ]);

          const webappData = webapp.status === 'fulfilled' ? webapp.value : null;
          const sslData = ssl.status === 'fulfilled' ? ssl.value : null;

          return {
            appId: app.runcloud_app_id,
            status: webappData
              ? webappData.state === 'active'
                ? 'running'
                : (webappData.state ?? null)
              : null,
            sslValidUntil: sslData?.validUntil ?? null,
            lastDeploy: null, // v3 API does not expose last deploy timestamp
          };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          liveData.set(result.value.appId, {
            status: result.value.status,
            sslValidUntil: result.value.sslValidUntil,
            lastDeploy: result.value.lastDeploy,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch RunCloud data:', err);
    }
  }

  const planDisplayName = planInfo?.name ?? 'Unknown';

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">
          Hosting
        </h1>
        <p className="mt-1 text-sm text-slate">
          {appList.length} of {sitesLimit} sites on your {planDisplayName} plan
        </p>
      </div>

      {appList.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-lg text-slate">No sites yet</p>
          <p className="mt-2 text-sm text-slate">
            Get in touch and we&apos;ll set up your first site.
          </p>
          <a
            href="https://motive.host/contact.html?subject=new-site"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Request a New Site
          </a>
        </Card>
      ) : (
        <div className="space-y-3">
          {appList.map((app) => (
            <SiteCard
              key={app.app_slug}
              app={app}
              live={liveData.get(app.runcloud_app_id) ?? null}
            />
          ))}

          {appList.length < sitesLimit && (
            <a
              href="https://motive.host/contact.html?subject=new-site"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="flex items-center justify-center py-8 transition-colors hover:border-gold/40">
                <div className="text-center">
                  <p className="text-lg font-medium text-gold">+ Request New Site</p>
                  <p className="mt-1 text-sm text-slate">
                    You have {sitesLimit - appList.length} {sitesLimit - appList.length === 1 ? 'slot' : 'slots'} remaining on your plan
                  </p>
                </div>
              </Card>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
