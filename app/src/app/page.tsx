import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { getPlan } from '@/lib/plans';
import GreetingBanner from '@/components/dashboard/greeting-banner';
import QuickActions from '@/components/dashboard/quick-actions';
import DomainsSummary from '@/components/dashboard/domains-summary';
import EmailSummary from '@/components/dashboard/email-summary';
import ActivityFeed from '@/components/dashboard/activity-feed';
import PlanSummaryCard from '@/components/hosting/plan-summary-card';
import SiteCard from '@/components/hosting/site-card';

interface ActivityItem {
  type: 'dns' | 'email' | 'hosting' | 'domain';
  description: string;
  timestamp: string;
}

function deriveFirstName(customer: { name?: string | null; email?: string | null } | null, email: string): string {
  if (customer?.name) {
    return customer.name.split(' ')[0];
  }
  const localPart = email.split('@')[0];
  const namePart = localPart.split('.')[0];
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated: show public landing
  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-8 px-4 text-center">
          <div>
            <p className="font-mono text-sm tracking-widest text-gold">CUSTOMER HUB</p>
            <h1 className="mt-3 font-display text-5xl font-bold tracking-tight text-muted-white">
              Motive Hosting
            </h1>
            <p className="mx-auto mt-4 max-w-md text-lg text-slate">
              Managed hosting, domains, and email for Gulf Coast businesses.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-gold px-6 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
            >
              Sign In
            </Link>
            <a
              href="https://motive.host"
              className="rounded-lg border border-border px-6 py-3 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated: fetch all dashboard data in parallel
  const [
    { data: customer },
    { data: hostingApps },
    { data: domains },
    { data: emailDomains },
    { data: mailboxes },
    { data: dnsActivity },
    { data: emailActivity },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('name, email, plan, is_admin')
      .eq('id', user.id)
      .single(),
    supabase
      .from('hosting_apps')
      .select('app_slug, app_name, app_type, primary_domain, cached_status, cached_ssl_expiry, cached_last_deploy, runcloud_app_id, runcloud_server_id')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('domains')
      .select('id, expires_at')
      .eq('customer_id', user.id),
    supabase
      .from('email_domains')
      .select('id')
      .eq('customer_id', user.id),
    supabase
      .from('email_mailboxes')
      .select('id')
      .eq('customer_id', user.id)
      .neq('status', 'deleted'),
    supabase
      .from('dns_audit_log')
      .select('action, domain_name, record_type, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('email_audit_log')
      .select('action, target_label, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const plan = customer?.plan ?? 'harbor';
  const planInfo = getPlan(plan);
  const firstName = deriveFirstName(customer, user.email ?? '');
  const appList = hostingApps ?? [];
  const domainList = domains ?? [];
  const emailDomainList = emailDomains ?? [];
  const mailboxList = mailboxes ?? [];

  // Fetch live RunCloud status for each hosting app
  let liveStatuses: Map<number, { status: string | null; sslValidUntil?: string | null; lastDeploy?: string | null }> =
    new Map();

  if (appList.length > 0) {
    try {
      const rc = getRunCloudClient();
      const results = await Promise.allSettled(
        appList.map(async (app) => {
          const webapp = await rc.getWebApp(app.runcloud_app_id);
          return {
            appId: app.runcloud_app_id,
            status: webapp.state === 'active' ? 'running' : (webapp.state ?? null),
          };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          liveStatuses.set(result.value.appId, {
            status: result.value.status,
          });
        }
      }
    } catch (err) {
      // RunCloud unavailable -- fall back to cached data
      console.error('Failed to fetch RunCloud statuses:', err);
    }
  }

  // Compute health summary
  const healthySiteCount = appList.filter((app) => {
    const live = liveStatuses.get(app.runcloud_app_id);
    const status = live?.status ?? app.cached_status;
    return status === 'running';
  }).length;

  // Compute domain stats
  const totalDomains = domainList.length;
  const nearestExpiry = domainList
    .filter((d) => d.expires_at)
    .map((d) => d.expires_at as string)
    .sort()[0] ?? null;

  // Build activity feed from audit logs
  const activities: ActivityItem[] = [];

  if (dnsActivity) {
    for (const entry of dnsActivity) {
      activities.push({
        type: 'dns',
        description: `${entry.action === 'quick_setup' ? 'Quick setup' : entry.action} ${entry.record_type} record on ${entry.domain_name}`,
        timestamp: entry.created_at,
      });
    }
  }

  if (emailActivity) {
    for (const entry of emailActivity) {
      const label = entry.target_label ?? 'email';
      const actionLabel = entry.action.replace(/_/g, ' ');
      activities.push({
        type: 'email',
        description: `${actionLabel} - ${label}`,
        timestamp: entry.created_at,
      });
    }
  }

  // Sort by timestamp descending, take top 5
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const topActivities = activities.slice(0, 5);

  // Email mailbox limit from plan
  const mailboxLimit = planInfo?.mailboxes ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <GreetingBanner
        firstName={firstName}
        siteCount={appList.length}
        healthySiteCount={healthySiteCount}
      />

      {/* Plan summary */}
      <div className="mb-8">
        <PlanSummaryCard
          plan={plan}
          sitesUsed={appList.length}
          emailDomainsUsed={emailDomainList.length}
          mailboxesUsed={mailboxList.length}
        />
      </div>

      {/* Hosting sites */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-muted-white">Your Sites</h2>
        {appList.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-slate">No sites yet</p>
            <a
              href="https://motive.host/contact.html?subject=new-site"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
            >
              Request Your First Site
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {appList.map((app) => (
              <SiteCard
                key={app.app_slug}
                app={app}
                live={liveStatuses.get(app.runcloud_app_id) ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <QuickActions plan={plan} sitesUsed={appList.length} />
      </div>

      {/* Two-column widget row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <DomainsSummary
          totalDomains={totalDomains}
          nearestExpiry={nearestExpiry}
        />
        <EmailSummary
          emailDomainCount={emailDomainList.length}
          mailboxCount={mailboxList.length}
          mailboxLimit={mailboxLimit}
        />
      </div>

      {/* Activity feed */}
      <ActivityFeed activities={topActivities} />
    </div>
  );
}
