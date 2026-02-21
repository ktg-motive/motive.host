'use client';

import type { RunCloudActionLog } from '@runcloud';
import Card from '@/components/ui/card';

interface ActivityTabProps {
  actionLog: RunCloudActionLog[];
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
        {actionLog.map((entry, i) => (
          <div key={`${entry.created_at}-${i}`} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-muted-white">
                {entry.content}
              </span>
              <p className="mt-0.5 text-xs text-slate">{entry.kind}</p>
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
