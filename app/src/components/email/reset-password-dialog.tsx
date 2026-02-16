'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/dialog';
import Button from '@/components/ui/button';
import PasswordDisplay from './password-display';

interface ResetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  emailAddress: string;
  domain: string;
}

export default function ResetPasswordDialog({ open, onClose, emailAddress, domain }: ResetPasswordDialogProps) {
  const [resetting, setResetting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleReset() {
    setError('');
    setResetting(true);

    try {
      const res = await fetch(
        `/api/email/domains/${encodeURIComponent(domain)}/mailboxes/${encodeURIComponent(emailAddress)}/password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to reset password');
        return;
      }

      setGeneratedPassword(data.generatedPassword);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setResetting(false);
    }
  }

  function handleClose() {
    setGeneratedPassword(null);
    setError('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Reset Password">
      {generatedPassword ? (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            Password reset for <span className="font-mono text-muted-white">{emailAddress}</span>.
          </p>
          <PasswordDisplay password={generatedPassword} label="New Password" />
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            Generate a new password for <span className="font-mono text-muted-white">{emailAddress}</span>.
            The current password will stop working immediately.
          </p>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset Password'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
