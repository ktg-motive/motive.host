import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import MailboxDetail from '@/components/email/mailbox-detail';

export default async function MailboxPage({
  params,
}: {
  params: Promise<{ domain: string; email: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { domain, email } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedEmail = decodeURIComponent(email);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate">
        <Link href="/email" className="transition-colors hover:text-muted-white">Email</Link>
        <span className="mx-2">/</span>
        <Link href={`/email/${domain}`} className="font-mono transition-colors hover:text-muted-white">
          {decodedDomain}
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-muted-white">{decodedEmail}</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-mono text-2xl font-bold text-muted-white">{decodedEmail}</h1>
        <p className="mt-1 text-sm text-slate">
          Manage mailbox settings and storage
        </p>
      </div>

      <MailboxDetail domain={decodedDomain} email={decodedEmail} />
    </div>
  );
}
