'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/button';
import EmailDomainCard, { type EmailDomainSummary } from './email-domain-card';
import EnableEmailModal from './enable-email-modal';
import { formatBytes } from './storage-bar';

export default function EmailOverview() {
  const [domains, setDomains] = useState<EmailDomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnableModal, setShowEnableModal] = useState(false);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email/domains');
      const data = await res.json();
      setDomains(data.domains ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  // Aggregated stats
  const totalMailboxes = domains.reduce((sum, d) => sum + d.mailbox_count, 0);
  const totalUsed = domains.reduce((sum, d) => sum + d.storage_used_bytes, 0);
  const totalProvisioned = domains.reduce((sum, d) => sum + d.storage_provisioned_bytes, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-alt-bg text-xl text-slate">
            @
          </div>
          <h2 className="mb-1 text-lg font-medium text-muted-white">No Email Enabled Yet</h2>
          <p className="mb-6 text-sm text-slate">
            Enable email on a domain to start managing business email.
          </p>
          <Button onClick={() => setShowEnableModal(true)}>
            Enable Email for a Domain
          </Button>
        </div>
        <EnableEmailModal
          open={showEnableModal}
          onClose={() => setShowEnableModal(false)}
          onEnabled={fetchDomains}
        />
      </>
    );
  }

  return (
    <>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-slate">Domains</p>
          <p className="mt-1 text-2xl font-bold text-muted-white">{domains.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-slate">Total Mailboxes</p>
          <p className="mt-1 text-2xl font-bold text-muted-white">{totalMailboxes}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-slate">Total Storage</p>
          <p className="mt-1 text-2xl font-bold text-muted-white">
            {formatBytes(totalUsed)}
            <span className="text-sm font-normal text-slate"> / {formatBytes(totalProvisioned)}</span>
          </p>
        </div>
      </div>

      {/* Domain list */}
      <div className="space-y-3">
        {domains.map(domain => (
          <EmailDomainCard key={domain.id} domain={domain} />
        ))}
      </div>

      {/* Enable another domain */}
      <div className="mt-6">
        <Button variant="secondary" onClick={() => setShowEnableModal(true)}>
          Enable Email for Another Domain
        </Button>
      </div>

      <EnableEmailModal
        open={showEnableModal}
        onClose={() => setShowEnableModal(false)}
        onEnabled={fetchDomains}
      />
    </>
  );
}
