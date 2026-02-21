'use client';

import type { RunCloudActionLog } from '@runcloud';
import Card from '@/components/ui/card';

interface ActivityTabProps {
  actionLog: RunCloudActionLog[];
}

function formatActionName(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ActivityStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  let colorClass: string;
  if (normalized === 'success' || normalized === 'completed') {
    colorClass = 'bg-green-500/10 text-green-400';
  } else if (normalized === 'failed' || normalized === 'error') {
    colorClass = 'bg-red-500/10 text-red-400';
  } else {
    colorClass = 'bg-amber-500/10 text-amber-400';
  }

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}

export default function ActivityTab({ actionLog }: ActivityTabProps) {
  if (actionLog.length === 0) {
    return (
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Activity
        </h2>
        <p className="text-sm text-slate">No activity recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-muted-white">
        Activity
      </h2>
      <div className="divide-y divide-border">
        {actionLog.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-white">
                  {formatActionName(entry.action)}
                </span>
                <ActivityStatusBadge status={entry.status} />
              </div>
              {entry.description && (
                <p className="mt-0.5 text-xs text-slate truncate">
                  {entry.description}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs text-slate">
              {formatRelativeTime(entry.created_at)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
