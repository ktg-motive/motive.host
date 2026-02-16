'use client';

import type { StorageTier } from '@opensrs-email';

const TIERS: Array<{ value: StorageTier; label: string; price: string; storage: string }> = [
  { value: 'basic',    label: 'Basic',    price: '$3/mo', storage: '10 GB' },
  { value: 'standard', label: 'Standard', price: '$5/mo', storage: '25 GB' },
  { value: 'plus',     label: 'Plus',     price: '$8/mo', storage: '50 GB' },
];

interface TierSelectorProps {
  value: StorageTier;
  onChange: (tier: StorageTier) => void;
}

export default function TierSelector({ value, onChange }: TierSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TIERS.map(tier => (
        <button
          key={tier.value}
          type="button"
          onClick={() => onChange(tier.value)}
          className={`rounded-lg border p-3 text-left transition-colors ${
            value === tier.value
              ? 'border-gold bg-gold/10'
              : 'border-border hover:border-gold/50'
          }`}
        >
          <p className="text-sm font-medium text-muted-white">{tier.label}</p>
          <p className="text-xs text-slate">{tier.storage}</p>
          <p className="mt-1 text-sm font-medium text-gold">{tier.price}</p>
        </button>
      ))}
    </div>
  );
}
