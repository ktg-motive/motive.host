'use client';

import { useState } from 'react';
import Link from 'next/link';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${
        copied
          ? 'border-gold/30 bg-gold/10 text-gold'
          : 'border-border text-slate hover:text-muted-white'
      }`}
      aria-label={`Copy ${value}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-slate">{label}</span>
      <div className="flex items-center gap-2">
        <code className="font-mono text-sm text-muted-white">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default function ServerSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate">
        <Link href="/email" className="transition-colors hover:text-muted-white">Email</Link>
        <span className="mx-2">/</span>
        <span className="text-muted-white">Server Settings</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">Email Server Settings</h1>
        <p className="mt-1 text-sm text-slate">
          Configuration for email clients and mobile devices
        </p>
      </div>

      {/* IMAP */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">
          Incoming Mail (IMAP)
        </h2>
        <div className="space-y-0">
          <SettingRow label="Server" value="secure.emailsrvr.com" />
          <SettingRow label="Port" value="993" />
          <SettingRow label="Security" value="SSL/TLS" />
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-sm text-slate">Username</span>
            <span className="text-sm text-muted-white">your-email@yourdomain.com</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate">Password</span>
            <span className="text-sm text-muted-white">Your mailbox password</span>
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">
          Outgoing Mail (SMTP)
        </h2>
        <div className="space-y-0">
          <SettingRow label="Server" value="secure.emailsrvr.com" />
          <SettingRow label="Port" value="465" />
          <SettingRow label="Security" value="SSL/TLS" />
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-sm text-slate">Username</span>
            <span className="text-sm text-muted-white">your-email@yourdomain.com</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate">Password</span>
            <span className="text-sm text-muted-white">Your mailbox password</span>
          </div>
        </div>
      </div>

      {/* POP3 alternative */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">
          Incoming Mail (POP3)
        </h2>
        <p className="mb-3 text-xs text-slate">
          Only use POP3 if IMAP is not available on your device. IMAP is recommended.
        </p>
        <div className="space-y-0">
          <SettingRow label="Server" value="secure.emailsrvr.com" />
          <SettingRow label="Port" value="995" />
          <SettingRow label="Security" value="SSL/TLS" />
        </div>
      </div>

      {/* Help text */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 font-display text-lg font-bold text-muted-white">Need Help?</h2>
        <p className="text-sm text-slate">
          If you need help configuring your email client, contact support at{' '}
          <a href="mailto:support@motive.host" className="text-gold hover:text-gold-hover">
            support@motive.host
          </a>
          .
        </p>
      </div>
    </div>
  );
}
