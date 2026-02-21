interface StatusBadgeProps {
  status: 'running' | 'stopped' | 'error' | 'unknown' | null;
  size?: 'sm' | 'md';
}

const config: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-green-400', label: 'Running' },
  stopped: { color: 'bg-red-400', label: 'Stopped' },
  error: { color: 'bg-red-400', label: 'Error' },
  unknown: { color: 'bg-amber-400', label: 'Unknown' },
};

const nullConfig = { color: 'bg-gray-400', label: 'No data' };

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const { color, label } = status ? (config[status] ?? nullConfig) : nullConfig;

  const dotSize = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <span className={`inline-flex items-center ${textSize} text-slate`}>
      <span className={`${dotSize} rounded-full ${color} mr-1.5 inline-block`} />
      {label}
    </span>
  );
}
