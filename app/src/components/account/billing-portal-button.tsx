'use client';

import { useState } from 'react';

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/account/portal-session', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to open billing portal');
        return;
      }

      // Redirect to Stripe billing portal
      window.location.href = data.url;
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg border border-border px-5 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Opening...' : 'Manage Billing'}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
