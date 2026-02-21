import Link from 'next/link';
import { getPlan } from '@/lib/plans';

interface QuickActionsProps {
  plan: string;
  sitesUsed: number;
}

export default function QuickActions({ plan, sitesUsed }: QuickActionsProps) {
  const planInfo = getPlan(plan);
  const canAddSite = planInfo ? sitesUsed < planInfo.sites : false;

  const linkClass =
    'text-sm border border-border rounded-lg px-3 py-1.5 text-slate hover:border-gold hover:text-muted-white transition-colors';

  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/domains/search" className={linkClass}>
        + Register Domain
      </Link>
      <Link href="/email" className={linkClass}>
        + Add Mailbox
      </Link>
      {canAddSite && (
        <a
          href="https://motive.host/contact.html?subject=new-site"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          + Request New Site
        </a>
      )}
    </div>
  );
}
