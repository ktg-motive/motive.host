import Link from 'next/link';
import Card from '@/components/ui/card';

interface EmailSummaryProps {
  emailDomainCount: number;
  mailboxCount: number;
  mailboxLimit: number;
}

export default function EmailSummary({
  emailDomainCount,
  mailboxCount,
  mailboxLimit,
}: EmailSummaryProps) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wider text-slate">
        Business Email
      </p>
      <p className="mt-2 text-3xl font-bold text-muted-white">
        {emailDomainCount}
      </p>
      <p className="mt-0.5 text-sm text-slate">
        email {emailDomainCount === 1 ? 'domain' : 'domains'}
      </p>
      <p className="mt-2 text-xs text-slate">
        {mailboxCount} of {mailboxLimit} mailboxes used
      </p>
      <Link
        href="/email"
        className="mt-4 inline-block text-sm text-gold transition-colors hover:text-gold-hover"
      >
        Manage &rarr;
      </Link>
    </Card>
  );
}
