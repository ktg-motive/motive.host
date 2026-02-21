import Card from '@/components/ui/card';
import { getPlan } from '@/lib/plans';

interface PlanSummaryCardProps {
  plan: string;
  sitesUsed: number;
  emailDomainsUsed: number;
  mailboxesUsed: number;
}

function ProgressRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate">{label}</span>
        <span className="text-muted-white">
          {used} of {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-border">
        <div
          className="h-1.5 rounded-full bg-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function PlanSummaryCard({
  plan,
  sitesUsed,
  emailDomainsUsed,
  mailboxesUsed,
}: PlanSummaryCardProps) {
  const planInfo = getPlan(plan);

  if (!planInfo) {
    return (
      <Card>
        <p className="text-sm text-slate">Plan: Unknown</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold text-muted-white">
          {planInfo.name} Plan
        </h3>
        <span className="text-sm text-gold">
          ${planInfo.price}/mo
        </span>
      </div>
      <div className="space-y-3">
        <ProgressRow label="Sites" used={sitesUsed} limit={planInfo.sites} />
        <ProgressRow
          label="Email Domains"
          used={emailDomainsUsed}
          limit={planInfo.emailDomains}
        />
        <ProgressRow
          label="Mailboxes"
          used={mailboxesUsed}
          limit={planInfo.mailboxes}
        />
      </div>
    </Card>
  );
}
