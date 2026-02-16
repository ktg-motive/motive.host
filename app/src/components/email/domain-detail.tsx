'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/button';
import DnsStatusCard from './dns-status-card';
import MailboxRow, { type Mailbox } from './mailbox-row';
import CreateMailboxDialog from './create-mailbox-dialog';

interface EmailDomain {
  id: string;
  domain_name: string;
  opensrs_status: string;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  mailbox_count: number;
  storage_used_bytes: number;
  storage_provisioned_bytes: number;
}

interface DomainDetailProps {
  domain: string;
}

export default function DomainDetail({ domain }: DomainDetailProps) {
  const [emailDomain, setEmailDomain] = useState<EmailDomain | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [domainRes, mailboxRes] = await Promise.all([
        fetch(`/api/email/domains/${encodeURIComponent(domain)}`),
        fetch(`/api/email/domains/${encodeURIComponent(domain)}/mailboxes`),
      ]);

      const domainData = await domainRes.json();
      const mailboxData = await mailboxRes.json();

      setEmailDomain(domainData.emailDomain ?? null);
      setMailboxes(mailboxData.mailboxes ?? []);
    } catch (err) {
      console.error('Error fetching domain data:', err);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleVerifyDns() {
    const res = await fetch(`/api/email/domains/${encodeURIComponent(domain)}/dns-check`, {
      method: 'POST',
    });
    if (res.ok) {
      await fetchData();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  if (!emailDomain) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-slate">Email is not enabled for this domain.</p>
      </div>
    );
  }

  return (
    <>
      {/* DNS Status */}
      <div className="mb-6">
        <DnsStatusCard
          domain={domain}
          mx={emailDomain.mx_verified}
          spf={emailDomain.spf_verified}
          dkim={emailDomain.dkim_verified}
          dmarc={emailDomain.dmarc_verified}
          onVerify={handleVerifyDns}
        />
      </div>

      {/* Mailboxes */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-muted-white">
            Mailboxes ({mailboxes.length})
          </h2>
          <Button onClick={() => setShowCreateDialog(true)}>
            Add Mailbox
          </Button>
        </div>

        {mailboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-alt-bg text-lg text-slate">
              @
            </div>
            <p className="mb-1 text-sm font-medium text-muted-white">No Mailboxes</p>
            <p className="mb-4 text-xs text-slate">
              Create your first mailbox to start sending and receiving email.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              Add Mailbox
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {mailboxes.map(mb => (
              <MailboxRow key={mb.id} mailbox={mb} />
            ))}
          </div>
        )}
      </div>

      <CreateMailboxDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        domain={domain}
        onCreated={fetchData}
      />
    </>
  );
}
