import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ProvisionForm from '@/components/admin/provision-form';

interface PageProps {
  searchParams: Promise<{ customer_id?: string }>;
}

export default async function ProvisionPage({ searchParams }: PageProps) {
  const { customer_id } = await searchParams;

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

  // Fetch all customers for the dropdown
  const adminDb = createAdminClient();
  const { data: customers } = await adminDb
    .from('customers')
    .select('id, email, name, plan')
    .order('name', { ascending: true });

  const customerList = (customers ?? []).map((c) => ({
    id: c.id as string,
    email: c.email as string,
    name: (c.name as string | null) ?? '',
    plan: (c.plan as string | null) ?? '',
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center text-sm text-slate transition-colors hover:text-gold"
        >
          &larr; Back to Admin
        </Link>
        <h1 className="font-display text-3xl font-bold text-muted-white">
          Provision Site
        </h1>
        <p className="mt-1 text-sm text-slate">
          Create a new RunCloud web app and link it to a customer
        </p>
      </div>

      <ProvisionForm
        customers={customerList}
        preselectedCustomerId={customer_id ?? null}
      />
    </div>
  );
}
