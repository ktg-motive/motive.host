'use client';

import { useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/card';

interface Customer {
  id: string;
  email: string;
  name: string;
  plan: string;
}

interface ProvisionFormProps {
  customers: Customer[];
  preselectedCustomerId: string | null;
}

interface ProvisionResult {
  success: boolean;
  app: { id: string; slug: string; domain: string; runcloud_app_id: number; port: number | null; deploy_template: string | null; deploy_method: string | null };
  warnings: string[];
}

interface ProvisionError {
  error: string;
  runcloudAppId?: number;
  details?: unknown;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function ProvisionForm({ customers, preselectedCustomerId }: ProvisionFormProps) {
  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? '');
  const [appType, setAppType] = useState<'wordpress' | 'nodejs'>('wordpress');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [appName, setAppName] = useState('');

  // Node.js fields
  const [deployTemplate, setDeployTemplate] = useState<'nextjs' | 'express' | 'generic'>('nextjs');
  const [gitProvider, setGitProvider] = useState('github');
  const [gitRepository, setGitRepository] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitSubdir, setGitSubdir] = useState('');

  // WordPress fields
  const [wpTitle, setWpTitle] = useState('');
  const [wpAdminUser, setWpAdminUser] = useState('');
  const [wpAdminPassword, setWpAdminPassword] = useState('');
  const [wpAdminEmail, setWpAdminEmail] = useState('');

  const [formState, setFormState] = useState<FormState>('idle');
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [errorInfo, setErrorInfo] = useState<ProvisionError | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setResult(null);
    setErrorInfo(null);

    const payload: Record<string, unknown> = {
      customer_id: customerId,
      app_type: appType,
      primary_domain: primaryDomain.trim().toLowerCase(),
      app_name: appName.trim(),
    };

    if (appType === 'nodejs') {
      payload.deploy_template = deployTemplate;
      payload.deploy_method = gitProvider;
      if (gitRepository.trim()) {
        payload.git_provider = gitProvider;
        payload.git_repository = gitRepository.trim();
        payload.git_branch = gitBranch.trim() || 'main';
      }
      if (gitSubdir.trim()) {
        payload.git_subdir = gitSubdir.trim();
      }
    }

    if (appType === 'wordpress') {
      if (wpTitle.trim()) payload.wp_title = wpTitle.trim();
      if (wpAdminUser.trim()) payload.wp_admin_user = wpAdminUser.trim();
      if (wpAdminPassword) payload.wp_admin_password = wpAdminPassword;
      if (wpAdminEmail.trim()) payload.wp_admin_email = wpAdminEmail.trim();
    }

    try {
      const res = await fetch('/api/admin/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormState('error');
        setErrorInfo(data as ProvisionError);
        return;
      }

      setFormState('success');
      setResult(data as ProvisionResult);
    } catch {
      setFormState('error');
      setErrorInfo({ error: 'Network error — check your connection and try again' });
    }
  }

  function handleProvisionAnother() {
    setFormState('idle');
    setResult(null);
    setErrorInfo(null);
    setPrimaryDomain('');
    setAppName('');
    setGitRepository('');
    setWpTitle('');
    setWpAdminUser('');
    setWpAdminPassword('');
    setWpAdminEmail('');
  }

  // Success state
  if (formState === 'success' && result) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <div className="mb-4 text-4xl">&#10003;</div>
        <h2 className="font-display text-xl font-bold text-muted-white">Site Provisioned</h2>
        <p className="mt-2 text-sm text-slate">
          RunCloud app created (ID: {result.app.runcloud_app_id}) and linked to customer.
          {result.app.port && ` Port: ${result.app.port}.`}
        </p>
        {result.warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-left">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-yellow-400">Warnings</p>
            <ul className="space-y-1">
              {result.warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-300/80">{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={`/hosting/${result.app.slug}`}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            View Site
          </Link>
          <button
            onClick={handleProvisionAnother}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-gold hover:text-muted-white"
          >
            Provision Another
          </button>
        </div>
      </Card>
    );
  }

  const inputClass = 'w-full rounded-lg border border-border bg-primary-bg px-3 py-2 text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';
  const labelClass = 'mb-1 block text-sm font-medium text-slate';

  return (
    <form onSubmit={handleSubmit}>
      <Card className="mx-auto max-w-lg space-y-5">
        {/* Customer */}
        <div>
          <label htmlFor="customer" className={labelClass}>Customer</label>
          <select
            id="customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className={inputClass}
          >
            <option value="">Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}{c.plan ? ` (${c.plan})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* App Type */}
        <div>
          <p className={labelClass}>App Type</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-white">
              <input
                type="radio"
                name="appType"
                value="wordpress"
                checked={appType === 'wordpress'}
                onChange={() => setAppType('wordpress')}
                className="accent-gold"
              />
              WordPress
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-white">
              <input
                type="radio"
                name="appType"
                value="nodejs"
                checked={appType === 'nodejs'}
                onChange={() => setAppType('nodejs')}
                className="accent-gold"
              />
              Node.js
            </label>
          </div>
        </div>

        {/* Primary Domain */}
        <div>
          <label htmlFor="domain" className={labelClass}>Primary Domain</label>
          <input
            id="domain"
            type="text"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="example.com"
            required
            className={inputClass}
          />
        </div>

        {/* App Name */}
        <div>
          <label htmlFor="appName" className={labelClass}>App Name</label>
          <input
            id="appName"
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="My Client's Site"
            required
            className={inputClass}
          />
        </div>

        {/* Node.js Git Config */}
        {appType === 'nodejs' && (
          <div className="space-y-4 rounded-lg border border-border/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate">Deploy Configuration</p>
            <div>
              <label htmlFor="deployTemplate" className={labelClass}>Deploy Template</label>
              <select
                id="deployTemplate"
                value={deployTemplate}
                onChange={(e) => setDeployTemplate(e.target.value as 'nextjs' | 'express' | 'generic')}
                className={inputClass}
              >
                <option value="nextjs">Next.js</option>
                <option value="express">Express</option>
                <option value="generic">Generic Node.js</option>
              </select>
            </div>
            <div>
              <label htmlFor="gitProvider" className={labelClass}>Git Provider</label>
              <select
                id="gitProvider"
                value={gitProvider}
                onChange={(e) => setGitProvider(e.target.value)}
                className={inputClass}
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </div>
            <div>
              <label htmlFor="gitRepo" className={labelClass}>Repository</label>
              <input
                id="gitRepo"
                type="text"
                value={gitRepository}
                onChange={(e) => setGitRepository(e.target.value)}
                placeholder="owner/repo"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gitBranch" className={labelClass}>Branch</label>
              <input
                id="gitBranch"
                type="text"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                placeholder="main"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gitSubdir" className={labelClass}>Subdirectory (monorepo)</label>
              <input
                id="gitSubdir"
                type="text"
                value={gitSubdir}
                onChange={(e) => setGitSubdir(e.target.value)}
                placeholder="e.g. app, packages/web (leave empty if root)"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {/* WordPress Config */}
        {appType === 'wordpress' && (
          <div className="space-y-4 rounded-lg border border-border/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate">WordPress Setup (optional)</p>
            <div>
              <label htmlFor="wpTitle" className={labelClass}>Site Title</label>
              <input
                id="wpTitle"
                type="text"
                value={wpTitle}
                onChange={(e) => setWpTitle(e.target.value)}
                placeholder="My WordPress Site"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wpAdminUser" className={labelClass}>Admin Username</label>
              <input
                id="wpAdminUser"
                type="text"
                value={wpAdminUser}
                onChange={(e) => setWpAdminUser(e.target.value)}
                placeholder="admin"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wpAdminPassword" className={labelClass}>Admin Password</label>
              <input
                id="wpAdminPassword"
                type="password"
                value={wpAdminPassword}
                onChange={(e) => setWpAdminPassword(e.target.value)}
                placeholder="Strong password"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wpAdminEmail" className={labelClass}>Admin Email</label>
              <input
                id="wpAdminEmail"
                type="email"
                value={wpAdminEmail}
                onChange={(e) => setWpAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {formState === 'error' && errorInfo && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-400">{errorInfo.error}</p>
            {errorInfo.runcloudAppId && (
              <p className="mt-1 text-xs text-red-400/70">
                RunCloud App ID: {errorInfo.runcloudAppId}
              </p>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={formState === 'submitting'}
          className="w-full rounded-lg bg-gold px-4 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {formState === 'submitting' ? 'Provisioning... this may take 30-60 seconds' : 'Provision Site'}
        </button>
      </Card>
    </form>
  );
}
