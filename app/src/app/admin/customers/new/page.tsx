import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import CustomerForm from '@/components/admin/customer-form';

export default async function NewCustomerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Admin guard
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    redirect('/');
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
          New Customer
        </h1>
        <p className="mt-1 text-sm text-slate">
          Create a new customer account and assign a plan
        </p>
      </div>

      <CustomerForm />
    </div>
  );
}
