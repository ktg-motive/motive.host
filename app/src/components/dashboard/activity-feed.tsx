import Card from '@/components/ui/card';

interface ActivityItem {
  type: 'dns' | 'email' | 'hosting' | 'domain';
  description: string;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
}

const typeDots: Record<string, string> = {
  dns: 'bg-blue-400',
  email: 'bg-purple-400',
  hosting: 'bg-green-400',
  domain: 'bg-amber-400',
};

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const items = activities.slice(0, 5);

  return (
    <Card>
      <h3 className="mb-4 text-base font-semibold text-muted-white">
        Recent Activity
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate">No recent activity</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${typeDots[item.type] ?? 'bg-gray-400'}`}
                />
                <span className="text-sm text-muted-white">
                  {item.description}
                </span>
              </div>
              <span className="shrink-0 text-xs text-slate">
                {relativeTime(item.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
