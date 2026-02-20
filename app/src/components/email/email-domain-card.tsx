'use client';

import Link from 'next/link';
import StorageBar from './storage-bar';

interface EmailDomainSummary {
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

interface EmailDomainCardProps {
  domain: EmailDomainSummary;
}

export default function EmailDomainCard({ domain }: EmailDomainCardProps) {
  const dnsRecords = [
    { label: 'MX', ok: domain.mx_verified },
    { label: 'SPF', ok: domain.spf_verified },
    { label: 'DKIM', ok: domain.dkim_verified },
    { label: 'DMARC', ok: domain.dmarc_verified },
  ];

  const allDnsOk = dnsRecords.every(r => r.ok);

  return (
    <Link
      href={`/email/${domain.domain_name}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/50"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-sm font-medium text-muted-white">
          {domain.domain_name}
        </h3>
        <span className="text-xs text-gold">
          {allDnsOk ? 'Manage' : 'Verify DNS →'}
        </span>
      </div>

      {!allDnsOk && (
        <p className="mb-3 text-xs text-yellow-400">
          Action required: open this domain and click Verify DNS to activate email.
        </p>
      )}

      <div className="mb-3 flex items-center gap-4 text-xs text-slate">
        <span>{domain.mailbox_count} mailbox{domain.mailbox_count !== 1 ? 'es' : ''}</span>
      </div>

      {domain.storage_provisioned_bytes > 0 && (
        <div className="mb-3">
          <StorageBar
            usedBytes={domain.storage_used_bytes}
            totalBytes={domain.storage_provisioned_bytes}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate">DNS:</span>
        {dnsRecords.map(rec => (
          <div key={rec.label} className="flex items-center gap-1">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                rec.ok ? 'bg-green-500' : 'border border-red-500'
              }`}
            />
            <span className="text-xs text-slate">{rec.label}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

export type { EmailDomainSummary };
