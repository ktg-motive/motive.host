'use client';

import { useState } from 'react';

interface PasswordDisplayProps {
  password: string;
  label?: string;
}

export default function PasswordDisplay({ password, label }: PasswordDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
      {label && <p className="mb-2 text-xs font-medium text-gold">{label}</p>}
      <div className="flex items-center justify-between gap-3">
        <code className="font-mono text-sm text-muted-white">{password}</code>
        <button
          onClick={copy}
          className={`rounded border px-2 py-1 text-xs transition-colors ${
            copied
              ? 'border-gold/30 bg-gold/10 text-gold'
              : 'border-border text-slate hover:text-muted-white'
          }`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate">
        This password will not be shown again. Copy it now and communicate it securely.
      </p>
    </div>
  );
}
