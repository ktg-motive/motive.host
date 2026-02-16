import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EmailOverview from '@/components/email/email-overview';

export default async function EmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">Email</h1>
        <p className="mt-1 text-sm text-slate">
          Manage business email for your domains
        </p>
      </div>
      <EmailOverview />
    </div>
  );
}
