'use client';

import Link from 'next/link';
import StorageBar from './storage-bar';

interface Mailbox {
  id: string;
  email_address: string;
  display_name: string | null;
  mailbox_type: string;
  storage_tier: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  status: string;
  forward_to: string | null;
  domain_name: string;
}

interface MailboxRowProps {
  mailbox: Mailbox;
}

const TYPE_ICONS: Record<string, string> = {
  mailbox: 'M',
  forward: 'F',
  filter: 'A',
};

const TYPE_LABELS: Record<string, string> = {
  mailbox: 'Mailbox',
  forward: 'Forward',
  filter: 'Alias',
};

export default function MailboxRow({ mailbox }: MailboxRowProps) {
  const isForward = mailbox.mailbox_type === 'forward';

  return (
    <Link
      href={`/email/${mailbox.domain_name}/${encodeURIComponent(mailbox.email_address)}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-gold/50"
    >
      {/* Type badge */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alt-bg text-xs font-medium text-slate">
        {TYPE_ICONS[mailbox.mailbox_type] ?? 'M'}
      </div>

      {/* Address + name */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-muted-white">{mailbox.email_address}</p>
        <p className="truncate text-xs text-slate">
          {mailbox.display_name ?? TYPE_LABELS[mailbox.mailbox_type]}
          {isForward && mailbox.forward_to && (
            <span className="text-slate"> &rarr; {mailbox.forward_to}</span>
          )}
        </p>
      </div>

      {/* Status */}
      <div className="hidden sm:block">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            mailbox.status === 'active'
              ? 'bg-green-500/10 text-green-400'
              : mailbox.status === 'suspended'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-slate/10 text-slate'
          }`}
        >
          <div className={`h-1.5 w-1.5 rounded-full ${
            mailbox.status === 'active' ? 'bg-green-500' : 'bg-red-500'
          }`} />
          {mailbox.status === 'active' ? 'Active' : 'Suspended'}
        </span>
      </div>

      {/* Storage */}
      {!isForward && (
        <div className="hidden w-32 sm:block">
          <StorageBar
            usedBytes={mailbox.storage_used_bytes}
            totalBytes={mailbox.storage_quota_bytes}
            size="sm"
          />
        </div>
      )}
    </Link>
  );
}

export type { Mailbox };
