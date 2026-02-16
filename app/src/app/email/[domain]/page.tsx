import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import DomainDetail from '@/components/email/domain-detail';

export default async function DomainEmailPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate">
        <Link href="/email" className="transition-colors hover:text-muted-white">Email</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-muted-white">{decodedDomain}</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">
          <span className="font-mono">{decodedDomain}</span> Email
        </h1>
        <p className="mt-1 text-sm text-slate">
          Manage mailboxes and DNS configuration
        </p>
      </div>

      <DomainDetail domain={decodedDomain} />
    </div>
  );
}
