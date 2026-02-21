import Link from 'next/link';
import Card from '@/components/ui/card';

interface DomainsSummaryProps {
  totalDomains: number;
  nearestExpiry: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DomainsSummary({
  totalDomains,
  nearestExpiry,
}: DomainsSummaryProps) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wider text-slate">
        Domains
      </p>
      <p className="mt-2 text-3xl font-bold text-muted-white">{totalDomains}</p>
      <p className="mt-0.5 text-sm text-slate">
        {totalDomains === 1 ? 'domain' : 'domains'} registered
      </p>
      {nearestExpiry && (
        <p className="mt-2 text-xs text-amber-400">
          Next expiry: {formatDate(nearestExpiry)}
        </p>
      )}
      <Link
        href="/domains"
        className="mt-4 inline-block text-sm text-gold transition-colors hover:text-gold-hover"
      >
        View all &rarr;
      </Link>
    </Card>
  );
}
