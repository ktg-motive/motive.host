'use client';

interface StorageBarProps {
  usedBytes: number;
  totalBytes: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function StorageBar({ usedBytes, totalBytes, showLabel = true, size = 'sm' }: StorageBarProps) {
  const pct = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const isDanger = pct > 90;
  const isWarning = pct > 70;

  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };

  return (
    <div>
      {showLabel && (
        <div className="mb-1 flex justify-between text-xs text-slate">
          <span>{formatBytes(usedBytes)} / {formatBytes(totalBytes)}</span>
          <span>{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className={`${heights[size]} rounded-full bg-alt-bg`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-gold'
          }`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

export { formatBytes };
