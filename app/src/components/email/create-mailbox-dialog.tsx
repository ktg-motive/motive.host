'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/dialog';
import Input from '@/components/ui/input';
import Button from '@/components/ui/button';
import TierSelector from './tier-selector';
import PasswordDisplay from './password-display';
import type { StorageTier } from '@opensrs-email';

interface CreateMailboxDialogProps {
  open: boolean;
  onClose: () => void;
  domain: string;
  onCreated: () => void;
}

export default function CreateMailboxDialog({ open, onClose, domain, onCreated }: CreateMailboxDialogProps) {
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [storageTier, setStorageTier] = useState<StorageTier>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/email/domains/${encodeURIComponent(domain)}/mailboxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localPart,
          displayName: displayName || undefined,
          storageTier,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to create mailbox');
        return;
      }

      setGeneratedPassword(data.generatedPassword);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (generatedPassword) {
      onCreated();
    }
    setLocalPart('');
    setDisplayName('');
    setStorageTier('standard');
    setError('');
    setGeneratedPassword(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Create Mailbox">
      {generatedPassword ? (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            Mailbox <span className="font-mono text-muted-white">{localPart}@{domain}</span> created successfully.
          </p>
          <PasswordDisplay password={generatedPassword} label="Generated Password" />
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email address */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate">Email Address</label>
            <div className="flex items-center gap-2">
              <Input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="username"
                required
                className="flex-1"
              />
              <span className="text-sm text-slate">@{domain}</span>
            </div>
          </div>

          {/* Display name */}
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Full Name (optional)"
          />

          {/* Storage tier */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate">Storage Tier</label>
            <TierSelector value={storageTier} onChange={setStorageTier} />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !localPart}>
              {submitting ? 'Creating...' : 'Create Mailbox'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
