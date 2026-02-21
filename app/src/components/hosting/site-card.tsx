import Link from 'next/link';
import Card from '@/components/ui/card';
import StatusBadge from './status-badge';

interface SiteCardProps {
  app: {
    app_slug: string;
    app_name: string;
    app_type: 'wordpress' | 'nodejs' | 'static';
    primary_domain: string;
    cached_status: string | null;
    cached_ssl_expiry: string | null;
    cached_last_deploy: string | null;
  };
  live?: {
    status: string | null;
    sslValidUntil?: string | null;
    lastDeploy?: string | null;
  } | null;
}

const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
  wordpress: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'WordPress' },
  nodejs: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Node.js' },
  static: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Static' },
};

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SiteCard({ app, live }: SiteCardProps) {
  const effectiveStatus = (live?.status ?? app.cached_status) as
    | 'running'
    | 'stopped'
    | 'error'
    | 'unknown'
    | null;
  const sslExpiry = live?.sslValidUntil ?? app.cached_ssl_expiry;
  const lastDeploy = live?.lastDeploy ?? app.cached_last_deploy;
  const typeStyle = typeStyles[app.app_type] ?? typeStyles.static;

  return (
    <Link href={`/hosting/${app.app_slug}`} className="block">
      <Card className="transition-colors hover:border-gold/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-muted-white">
                {app.app_name}
              </h3>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}
              >
                {typeStyle.label}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-slate">
              {app.primary_domain}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate sm:flex-col sm:items-end sm:gap-y-0.5">
            <StatusBadge status={effectiveStatus} />
            {sslExpiry ? (
              <span>SSL expires {formatExpiryDate(sslExpiry)}</span>
            ) : (
              <span className="text-amber-400">SSL: No cert</span>
            )}
            {lastDeploy && <span>Deployed {formatRelativeDate(lastDeploy)}</span>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
