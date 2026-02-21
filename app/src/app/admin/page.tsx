import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';
import Card from '@/components/ui/card';

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Admin guard
  const { data: currentCustomer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!currentCustomer?.is_admin) {
    redirect('/');
  }

  // Fetch all data in parallel
  const adminDb = createAdminClient();
  const [{ data: customers }, { data: hostingApps }] = await Promise.all([
    adminDb
      .from('customers')
      .select('id, email, name, plan, is_admin, created_at, plan_started_at')
      .order('created_at', { ascending: true }),
    adminDb
      .from('hosting_apps')
      .select('id, app_slug, app_name, app_type, primary_domain, runcloud_app_id, customer_id, created_at, customers(email, name)')
      .order('created_at', { ascending: false }),
  ]);

  const customerList = customers ?? [];
  const appList = hostingApps ?? [];

  // Summary stats
  const totalCustomers = customerList.length;
  const totalApps = appList.length;
  const planCounts = customerList.reduce<Record<string, number>>((acc, c) => {
    if (c.plan) {
      acc[c.plan] = (acc[c.plan] ?? 0) + 1;
    }
    return acc;
  }, {});

  // Count apps per customer
  const appsByCustomer = appList.reduce<Record<string, number>>((acc, app) => {
    acc[app.customer_id] = (acc[app.customer_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate">
          Internal management tools
        </p>
      </div>

      {/* Summary stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-muted-white">{totalCustomers}</p>
          <p className="text-xs text-slate">Customers</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-muted-white">{totalApps}</p>
          <p className="text-xs text-slate">Hosting Apps</p>
        </Card>
        {(['harbor', 'gulf', 'horizon', 'captain'] as const).map((planId) => (
          <Card key={planId} className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-white">{planCounts[planId] ?? 0}</p>
            <p className="text-xs text-slate">{PLANS[planId].name}</p>
          </Card>
        ))}
      </div>

      {/* Customers table */}
      <div className="mb-8">
        <h2 className="mb-4 font-display text-xl font-bold text-muted-white">Customers</h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-slate">
                  <th className="px-4 py-3 font-medium">Name / Email</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Apps</th>
                  <th className="px-4 py-3 font-medium">Member Since</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customerList.map((c) => {
                  const planInfo = c.plan ? PLANS[c.plan as keyof typeof PLANS] : null;
                  const memberSince = new Date(c.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  });
                  const appCount = appsByCustomer[c.id] ?? 0;

                  return (
                    <tr key={c.id} className="transition-colors hover:bg-card-content/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-muted-white">{c.name ?? 'No name'}</p>
                        <p className="text-xs text-slate">{c.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {planInfo ? (
                          <span className="inline-block rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                            {planInfo.name}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                            No Plan
                          </span>
                        )}
                        {c.is_admin && (
                          <span className="ml-1 inline-block rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {appCount} {appCount === 1 ? 'site' : 'sites'}
                      </td>
                      <td className="px-4 py-3 text-slate">{memberSince}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/provision?customer_id=${c.id}`}
                          className="text-xs font-medium text-gold transition-colors hover:text-gold-hover"
                        >
                          Provision Site
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Hosting Apps table */}
      <div>
        <h2 className="mb-4 font-display text-xl font-bold text-muted-white">Hosting Apps</h2>
        {appList.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-slate">No hosting apps provisioned yet</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-slate">
                    <th className="px-4 py-3 font-medium">App Name</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Domain</th>
                    <th className="px-4 py-3 font-medium">RunCloud ID</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appList.map((app) => {
                    const appCustomer = app.customers as unknown as { email: string; name: string | null } | null;
                    const typeLabel = app.app_type === 'nodejs' ? 'Node.js' : app.app_type === 'wordpress' ? 'WordPress' : app.app_type;

                    return (
                      <tr key={app.id} className="transition-colors hover:bg-card-content/50">
                        <td className="px-4 py-3 font-medium text-muted-white">{app.app_name}</td>
                        <td className="px-4 py-3 text-slate">
                          {appCustomer?.name ?? appCustomer?.email ?? 'Unknown'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            app.app_type === 'nodejs'
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-blue-500/10 text-blue-400'
                          }`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate">{app.primary_domain}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate">{app.runcloud_app_id}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/hosting/${app.app_slug}`}
                            className="text-xs font-medium text-gold transition-colors hover:text-gold-hover"
                          >
                            View App
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
