import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';
import Card from '@/components/ui/card';

export default async function CustomersPage() {
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

  // Fetch customers + counts in parallel
  const adminDb = createAdminClient();
  const [{ data: customers }, { data: allDomains }, { data: allApps }] = await Promise.all([
    adminDb
      .from('customers')
      .select('id, email, name, display_name, company_name, plan, is_admin, disabled_at, created_at')
      .order('created_at', { ascending: true }),
    adminDb.from('domains').select('customer_id'),
    adminDb.from('hosting_apps').select('customer_id'),
  ]);

  const customerList = customers ?? [];

  // Build count maps
  const domainCounts = (allDomains ?? []).reduce<Record<string, number>>((acc, d) => {
    if (d.customer_id) {
      acc[d.customer_id] = (acc[d.customer_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  const appCounts = (allApps ?? []).reduce<Record<string, number>>((acc, a) => {
    if (a.customer_id) {
      acc[a.customer_id] = (acc[a.customer_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center text-sm text-slate transition-colors hover:text-gold"
        >
          &larr; Back to Admin
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-muted-white">
            Customers
          </h1>
          <Link
            href="/admin/customers/new"
            className="rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            New Customer
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate">
          {customerList.length} total customer{customerList.length !== 1 ? 's' : ''}
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-slate">
                <th className="px-4 py-3 font-medium">Name / Email</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Domains</th>
                <th className="px-4 py-3 font-medium">Apps</th>
                <th className="px-4 py-3 font-medium">Member Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customerList.map((c) => {
                const planInfo = c.plan ? PLANS[c.plan as keyof typeof PLANS] : null;
                const isDisabled = c.disabled_at !== null;
                const memberSince = new Date(c.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                });
                const domainCount = domainCounts[c.id] ?? 0;
                const appCount = appCounts[c.id] ?? 0;

                return (
                  <tr key={c.id} className="transition-colors hover:bg-card-content/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${c.id}`} className="group">
                        <p className="font-medium text-muted-white group-hover:text-gold transition-colors">
                          {c.name ?? 'No name'}
                        </p>
                        <p className="text-xs text-slate">{c.email}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate">
                      {c.company_name || '--'}
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
                    <td className="px-4 py-3">
                      {isDisabled ? (
                        <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                          Disabled
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">{domainCount}</td>
                    <td className="px-4 py-3 text-slate">{appCount}</td>
                    <td className="px-4 py-3 text-slate">{memberSince}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
