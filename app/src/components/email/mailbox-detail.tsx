'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/button';
import StorageBar from './storage-bar';
import ResetPasswordDialog from './reset-password-dialog';

interface MailboxData {
  id: string;
  email_address: string;
  display_name: string | null;
  mailbox_type: string;
  storage_tier: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  status: string;
  password_change_required: boolean;
  forward_to: string | null;
  domain_name: string;
  last_login_at: string | null;
  created_at: string;
  stripe_price_id: string | null;
}

interface MailboxDetailProps {
  domain: string;
  email: string;
}

const TIER_LABELS: Record<string, string> = {
  basic: 'Motive Mail Basic (10 GB)',
  standard: 'Motive Mail Standard (25 GB)',
  plus: 'Motive Mail Plus (50 GB)',
};

const TIER_PRICES: Record<string, string> = {
  basic: '$3.00/month',
  standard: '$5.00/month',
  plus: '$8.00/month',
};

export default function MailboxDetail({ domain, email }: MailboxDetailProps) {
  const router = useRouter();
  const [mailbox, setMailbox] = useState<MailboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  const fetchMailbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/email/domains/${encodeURIComponent(domain)}/mailboxes/${encodeURIComponent(email)}`
      );
      const data = await res.json();
      setMailbox(data.mailbox ?? null);
    } catch (err) {
      console.error('Error fetching mailbox:', err);
    } finally {
      setLoading(false);
    }
  }, [domain, email]);

  useEffect(() => { fetchMailbox(); }, [fetchMailbox]);

  async function handleToggleSuspend() {
    if (!mailbox) return;
    const newSuspended = mailbox.status === 'active';
    setActionLoading('suspend');

    try {
      await fetch(
        `/api/email/domains/${encodeURIComponent(domain)}/mailboxes/${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suspended: newSuspended }),
        }
      );
      await fetchMailbox();
    } finally {
      setActionLoading('');
    }
  }

  async function handleDelete() {
    if (!mailbox) return;
    if (!confirm(`Delete ${mailbox.email_address}? This cannot be undone.`)) return;
    setActionLoading('delete');

    try {
      await fetch(
        `/api/email/domains/${encodeURIComponent(domain)}/mailboxes/${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );
      router.push(`/email/${domain}`);
    } finally {
      setActionLoading('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  if (!mailbox) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-slate">Mailbox not found.</p>
      </div>
    );
  }

  return (
    <>
      {/* Storage */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">Storage Usage</h2>
        <StorageBar
          usedBytes={mailbox.storage_used_bytes}
          totalBytes={mailbox.storage_quota_bytes}
          size="lg"
        />
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-white">
              {TIER_LABELS[mailbox.storage_tier] ?? mailbox.storage_tier}
            </p>
            <p className="text-xs text-slate">
              {TIER_PRICES[mailbox.storage_tier] ?? ''}
            </p>
          </div>
        </div>
      </div>

      {/* Account status */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">Account Status</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate">Status</span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  mailbox.status === 'active'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${
                  mailbox.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                {mailbox.status === 'active' ? 'Active' : 'Suspended'}
              </span>
              <Button
                variant="ghost"
                onClick={handleToggleSuspend}
                disabled={actionLoading === 'suspend'}
              >
                {mailbox.status === 'active' ? 'Suspend' : 'Reactivate'}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate">Last Login</span>
            <span className="text-sm text-muted-white">
              {mailbox.last_login_at
                ? new Date(mailbox.last_login_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })
                : 'Never'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate">Created</span>
            <span className="text-sm text-muted-white">
              {new Date(mailbox.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Password management */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">Password Management</h2>
        <div className="flex items-center justify-between">
          <div>
            {mailbox.password_change_required && (
              <p className="text-xs text-yellow-400">Password change required on next login</p>
            )}
          </div>
          <Button onClick={() => setShowResetPassword(true)}>
            Reset Password
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => window.open('https://mail.motive.host', '_blank')}
          >
            Open Webmail
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push('/email/server-settings')}
          >
            Device Setup Guide
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-500/30 bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-red-400">Danger Zone</h2>
        <p className="mb-3 text-sm text-slate">
          Permanently delete this mailbox and all its data. This cannot be undone.
        </p>
        <Button
          variant="ghost"
          onClick={handleDelete}
          disabled={actionLoading === 'delete'}
          className="text-red-400 hover:text-red-300"
        >
          {actionLoading === 'delete' ? 'Deleting...' : 'Delete Mailbox'}
        </Button>
      </div>

      <ResetPasswordDialog
        open={showResetPassword}
        onClose={() => setShowResetPassword(false)}
        emailAddress={mailbox.email_address}
        domain={domain}
      />
    </>
  );
}
