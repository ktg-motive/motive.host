import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/plans';
import Card from '@/components/ui/card';
import ProfileForm from '@/components/account/profile-form';
import BillingPortalButton from '@/components/account/billing-portal-button';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: customer }, { count: sitesCount }] = await Promise.all([
    supabase
      .from('customers')
      .select('name, email, plan, display_name, company_name, phone, plan_started_at, stripe_customer_id')
      .eq('id', user.id)
      .single(),
    supabase
      .from('hosting_apps')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', user.id),
  ]);

  const plan = customer?.plan ?? 'harbor';
  const planInfo = getPlan(plan);
  const sitesUsed = sitesCount ?? 0;
  const hasStripe = Boolean(customer?.stripe_customer_id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">Account</h1>
        <p className="mt-1 text-sm text-slate">
          Manage your profile and billing.
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Section (client component) */}
        <ProfileForm
          initialDisplayName={customer?.display_name ?? ''}
          initialCompanyName={customer?.company_name ?? ''}
          initialPhone={customer?.phone ?? ''}
          email={user.email ?? ''}
        />

        {/* Plan Card */}
        <Card>
          <h2 className="mb-6 text-lg font-semibold text-muted-white">Plan</h2>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate">Current Plan</span>
              <span className="text-sm font-medium text-muted-white">
                {planInfo?.name ?? 'Unknown'}{' '}
                <span className="text-slate">
                  &mdash; ${planInfo?.price ?? 0}/mo
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate">Sites</span>
              <span className="text-sm text-muted-white">
                {sitesUsed} of {planInfo?.sites ?? 0} used
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate">Mailboxes</span>
              <span className="text-sm text-muted-white">
                up to {planInfo?.mailboxes ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate">Support</span>
              <span className="text-sm text-muted-white">
                {planInfo?.support ?? 'Email'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate">Member Since</span>
              <span className="text-sm text-muted-white">
                {formatDate(customer?.plan_started_at)}
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`https://motive.host/contact.html?subject=upgrade&plan=${plan}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-gold px-5 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
            >
              Upgrade Plan
            </a>
            {hasStripe && <BillingPortalButton />}
            <Link
              href="/account/billing"
              className="rounded-lg border border-border px-5 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
            >
              View Invoices
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
