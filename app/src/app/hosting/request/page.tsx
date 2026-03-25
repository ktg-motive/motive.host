import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/plans';
import Card from '@/components/ui/card';
import SiteRequestForm from '@/components/hosting/site-request-form';

export default async function RequestSitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: customer }, { count: appCount }, { count: requestCount }] = await Promise.all([
    supabase
      .from('customers')
      .select('plan')
      .eq('id', user.id)
      .single(),
    supabase
      .from('hosting_apps')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', user.id),
    supabase
      .from('site_requests')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', user.id)
      .in('status', ['pending', 'approved']),
  ]);

  const plan = getPlan(customer?.plan);
  if (!plan) {
    redirect('/no-plan');
  }

  const totalUsed = (appCount ?? 0) + (requestCount ?? 0);
  const remainingSlots = plan.sites - totalUsed;
  const atLimit = remainingSlots <= 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <a href="/hosting" className="text-sm text-slate hover:text-gold">
          &larr; Back to Hosting
        </a>
        <h1 className="mt-4 font-display text-3xl font-bold text-muted-white">
          Request New Site
        </h1>
        <p className="mt-1 text-sm text-slate">
          {totalUsed} of {plan.sites} sites used on your {plan.name} plan
          {(requestCount ?? 0) > 0 ? ` (${requestCount} pending)` : ''}
        </p>
      </div>

      {atLimit ? (
        <Card className="py-12 text-center">
          <p className="text-lg text-muted-white">Site limit reached</p>
          <p className="mt-2 text-sm text-slate">
            Your {plan.name} plan supports up to {plan.sites} site{plan.sites === 1 ? '' : 's'}.
            Upgrade your plan or contact us to discuss options.
          </p>
          <a
            href="/hosting"
            className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Back to Hosting
          </a>
        </Card>
      ) : (
        <SiteRequestForm remainingSlots={remainingSlots} />
      )}
    </div>
  );
}
