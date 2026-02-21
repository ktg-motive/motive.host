'use client';

import { useState } from 'react';
import Card from '@/components/ui/card';

interface ProfileFormProps {
  initialDisplayName: string;
  initialCompanyName: string;
  initialPhone: string;
  email: string;
}

export default function ProfileForm({
  initialDisplayName,
  initialCompanyName,
  initialPhone,
  email,
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    displayName !== initialDisplayName ||
    companyName !== initialCompanyName ||
    phone !== initialPhone;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          company_name: companyName,
          phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save changes');
      } else {
        setMessage('Profile updated');
        // Clear success message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-6 text-lg font-semibold text-muted-white">Profile</h2>
      <form onSubmit={handleSave}>
        <div className="space-y-4">
          <div>
            <label htmlFor="display_name" className="mb-1 block text-sm text-slate">
              Display Name
            </label>
            <input
              id="display_name"
              type="text"
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="company_name" className="mb-1 block text-sm text-slate">
              Company
            </label>
            <input
              id="company_name"
              type="text"
              maxLength={100}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
              placeholder="Company name"
            />
          </div>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm text-slate">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              maxLength={100}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="w-full rounded-lg border border-border bg-card-content/50 px-3 py-2 text-sm text-slate cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate/70">
              Email is managed through your login credentials.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="rounded-lg bg-gold px-5 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {message && <p className="text-sm text-green-400">{message}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </form>
    </Card>
  );
}
