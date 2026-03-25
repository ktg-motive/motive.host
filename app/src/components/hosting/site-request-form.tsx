'use client';

import { useState } from 'react';
import Card from '@/components/ui/card';

type AppType = 'wordpress' | 'nodejs' | 'static';

interface SiteRequestFormProps {
  remainingSlots: number;
}

export default function SiteRequestForm({ remainingSlots }: SiteRequestFormProps) {
  const [domain, setDomain] = useState('');
  const [appType, setAppType] = useState<AppType>('wordpress');
  const [description, setDescription] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const showGitRepo = appType === 'nodejs' || appType === 'static';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/hosting/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          app_type: appType,
          description,
          git_repo_url: gitRepoUrl || '',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="py-12 text-center">
        <div className="mx-auto max-w-md">
          <div className="mb-4 text-4xl">&#9745;</div>
          <h2 className="font-display text-xl font-bold text-muted-white">
            Request Submitted
          </h2>
          <p className="mt-3 text-sm text-slate">
            We received your request for <strong className="text-gold">{domain}</strong> and
            will get it set up shortly. You&apos;ll see it on your dashboard once it&apos;s ready.
          </p>
          <a
            href="/hosting"
            className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Back to Hosting
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Domain */}
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-slate">
            Domain <span className="text-red-400">*</span>
          </label>
          <input
            id="domain"
            type="text"
            required
            maxLength={253}
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-border bg-primary-bg px-3 py-2 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <p className="mt-1 text-xs text-slate/70">
            The domain you want this site to live on
          </p>
        </div>

        {/* App Type */}
        <fieldset>
          <legend className="block text-sm font-medium text-slate">
            App Type <span className="text-red-400">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {([
              { value: 'wordpress' as const, label: 'WordPress' },
              { value: 'nodejs' as const, label: 'Node.js' },
              { value: 'static' as const, label: 'Static' },
            ]).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  appType === option.value
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-border text-slate hover:border-gold/40'
                }`}
              >
                <input
                  type="radio"
                  name="app_type"
                  value={option.value}
                  checked={appType === option.value}
                  onChange={() => setAppType(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate">
            Description
          </label>
          <textarea
            id="description"
            maxLength={1000}
            rows={3}
            placeholder="Any details about the site (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-border bg-primary-bg px-3 py-2 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <p className="mt-1 text-right text-xs text-slate/70">
            {description.length}/1000
          </p>
        </div>

        {/* Git Repo URL — shown for Node.js and Static */}
        {showGitRepo && (
          <div>
            <label htmlFor="git_repo_url" className="block text-sm font-medium text-slate">
              Git Repository URL
            </label>
            <input
              id="git_repo_url"
              type="url"
              maxLength={500}
              placeholder="https://github.com/your-org/your-repo"
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-border bg-primary-bg px-3 py-2 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            <p className="mt-1 text-xs text-slate/70">
              Optional — we can connect your repo for deployments
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate/70">
            {remainingSlots} {remainingSlots === 1 ? 'slot' : 'slots'} remaining on your plan
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </Card>
  );
}
