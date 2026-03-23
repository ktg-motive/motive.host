import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import CustomerDetail from '@/components/admin/customer-detail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;

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

  // Fetch customer detail + related data in parallel
  const adminDb = createAdminClient();
  const [customerRes, domainsRes, appsRes, emailDomainsRes] = await Promise.all([
    adminDb.from('customers').select('*').eq('id', id).single(),
    adminDb.from('domains').select('id, domain_name, status, registered_at, expires_at, auto_renew').eq('customer_id', id),
    adminDb.from('hosting_apps').select('id, app_slug, app_name, app_type, primary_domain, cached_status, created_at').eq('customer_id', id),
    adminDb.from('email_domains').select('id, domain_name, opensrs_status, mailbox_count').eq('customer_id', id),
  ]);

  if (!customerRes.data) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin/customers"
          className="mb-4 inline-flex items-center text-sm text-slate transition-colors hover:text-gold"
        >
          &larr; Back to Customers
        </Link>
        <h1 className="font-display text-3xl font-bold text-muted-white">
          {customerRes.data.name ?? customerRes.data.email}
        </h1>
        <p className="mt-1 text-sm text-slate">
          {customerRes.data.email}
        </p>
      </div>

      <CustomerDetail
        customer={customerRes.data}
        domains={domainsRes.data ?? []}
        hostingApps={appsRes.data ?? []}
        emailDomains={emailDomainsRes.data ?? []}
      />
    </div>
  );
}
