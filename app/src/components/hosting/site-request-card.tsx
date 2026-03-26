import Card from '@/components/ui/card';

interface SiteRequestCardProps {
  request: {
    id: string;
    domain: string;
    app_type: 'wordpress' | 'nodejs' | 'static' | 'python';
    status: 'pending' | 'approved';
    created_at: string;
  };
}

const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
  wordpress: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'WordPress' },
  nodejs: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Node.js' },
  static: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Static' },
  python: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Python' },
};

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gold/10', text: 'text-gold', label: 'Pending' },
  approved: { bg: 'bg-gold/10', text: 'text-gold', label: 'Approved' },
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

export default function SiteRequestCard({ request }: SiteRequestCardProps) {
  const typeStyle = typeStyles[request.app_type] ?? typeStyles.static;
  const statusStyle = statusStyles[request.status] ?? statusStyles.pending;

  return (
    <Card className="border-dashed border-border">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-muted-white">
              {request.domain}
            </h3>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}
            >
              {typeStyle.label}
            </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
            >
              {statusStyle.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate">
            We&apos;ll set this up and notify you when it&apos;s ready
          </p>
        </div>

        <div className="text-xs text-slate sm:text-right">
          <span>Submitted {formatRelativeDate(request.created_at)}</span>
        </div>
      </div>
    </Card>
  );
}
