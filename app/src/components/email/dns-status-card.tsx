'use client';

import { useState } from 'react';

interface DnsStatusCardProps {
  domain: string;
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  onVerify: () => Promise<void>;
}

const RECORDS = ['MX', 'SPF', 'DKIM', 'DMARC'] as const;

export default function DnsStatusCard(props: DnsStatusCardProps) {
  const [verifying, setVerifying] = useState(false);

  const statuses: Record<string, boolean> = {
    MX: props.mx,
    SPF: props.spf,
    DKIM: props.dkim,
    DMARC: props.dmarc,
  };

  const allGreen = Object.values(statuses).every(Boolean);

  async function handleVerify() {
    setVerifying(true);
    try {
      await props.onVerify();
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-white">DNS Configuration</h3>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="text-xs text-gold transition-colors hover:text-gold-hover disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Verify DNS'}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {RECORDS.map(rec => (
          <div key={rec} className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                verifying
                  ? 'animate-pulse bg-gold'
                  : statuses[rec]
                    ? 'bg-green-500'
                    : 'border border-red-500'
              }`}
              aria-label={`${rec}: ${statuses[rec] ? 'Verified' : 'Missing'}`}
            />
            <span className="text-xs text-slate">{rec}</span>
          </div>
        ))}
      </div>
      {!allGreen && !verifying && (
        <p className="mt-2 text-xs text-yellow-400">
          Some DNS records need attention. Click Verify to check.
        </p>
      )}
    </div>
  );
}
