'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/card';
import { PLANS } from '@/lib/plans';

interface CustomerData {
  id: string;
  email: string;
  name: string | null;
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
  plan: string | null;
  is_admin: boolean;
  disabled_at: string | null;
  created_at: string;
  plan_started_at: string | null;
}

interface Domain {
  id: string;
  domain_name: string;
  status: string | null;
  registered_at: string | null;
  expires_at: string | null;
  auto_renew: boolean | null;
}

interface HostingApp {
  id: string;
  app_slug: string;
  app_name: string;
  app_type: string;
  primary_domain: string;
  cached_status: string | null;
  created_at: string;
}

interface EmailDomain {
  id: string;
  domain_name: string;
  opensrs_status: string | null;
  mailbox_count: number | null;
}

interface CustomerDetailProps {
  customer: CustomerData;
  domains: Domain[];
  hostingApps: HostingApp[];
  emailDomains: EmailDomain[];
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export default function CustomerDetail({ customer, domains, hostingApps, emailDomains }: CustomerDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');

  // Editable fields
  const [name, setName] = useState(customer.name ?? '');
  const [displayName, setDisplayName] = useState(customer.display_name ?? '');
  const [companyName, setCompanyName] = useState(customer.company_name ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [plan, setPlan] = useState(customer.plan ?? 'harbor');

  // Baseline tracks last-saved values for dirty checks and cancel
  const baseline = useRef({
    name: customer.name ?? '',
    display_name: customer.display_name ?? '',
    company_name: customer.company_name ?? '',
    phone: customer.phone ?? '',
    plan: customer.plan ?? 'harbor',
  });

  // Track disable state locally for optimistic UI
  const [disabledAt, setDisabledAt] = useState<string | null>(customer.disabled_at);
  const [disableLoading, setDisableLoading] = useState(false);

  const isDisabled = disabledAt !== null;
  const planInfo = plan ? PLANS[plan as keyof typeof PLANS] : null;

  async function handleSave() {
    setSaveState('saving');
    setSaveError('');

    const payload: Record<string, unknown> = {};
    if (name.trim() !== baseline.current.name) payload.name = name.trim();
    if (displayName.trim() !== baseline.current.display_name) payload.display_name = displayName.trim() || null;
    if (companyName.trim() !== baseline.current.company_name) payload.company_name = companyName.trim() || null;
    if (phone.trim() !== baseline.current.phone) payload.phone = phone.trim() || null;
    if (plan !== baseline.current.plan) payload.plan = plan;

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      setSaveState('idle');
      return;
    }

    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveState('error');
        setSaveError(data.error ?? 'Failed to save changes');
        return;
      }

      setSaveState('success');
      setIsEditing(false);
      // Update baseline to reflect saved values
      baseline.current = {
        name: name.trim(),
        display_name: displayName.trim(),
        company_name: companyName.trim(),
        phone: phone.trim(),
        plan,
      };
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setSaveError('Network error -- check your connection and try again');
    }
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setSaveState('idle');
    setSaveError('');
    // Reset to last-saved values
    setName(baseline.current.name);
    setDisplayName(baseline.current.display_name);
    setCompanyName(baseline.current.company_name);
    setPhone(baseline.current.phone);
    setPlan(baseline.current.plan);
  }

  async function handleToggleDisable() {
    setDisableLoading(true);
    const newDisabled = !isDisabled;

    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: newDisabled }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(`Failed to ${newDisabled ? 'disable' : 'enable'} account: ${data.error}`);
        return;
      }

      setDisabledAt(newDisabled ? new Date().toISOString() : null);
    } catch {
      alert('Network error -- check your connection and try again');
    } finally {
      setDisableLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-border bg-primary-bg px-3 py-2 text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';
  const labelClass = 'mb-1 block text-sm font-medium text-slate';

  const memberSince = new Date(customer.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-muted-white">Profile</h2>
          <div className="flex items-center gap-2">
            {saveState === 'success' && (
              <span className="text-xs text-green-400">Saved</span>
            )}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-gold hover:text-muted-white"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-red-500 hover:text-red-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveState === 'saving'}
                  className="rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
                >
                  {saveState === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {saveState === 'error' && saveError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{saveError}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Email (always read-only) */}
          <div>
            <p className={labelClass}>Email</p>
            <p className="text-sm text-muted-white">{customer.email}</p>
          </div>

          {/* Name */}
          <div>
            <p className={labelClass}>Full Name</p>
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-muted-white">{name || '--'}</p>
            )}
          </div>

          {/* Display Name */}
          <div>
            <p className={labelClass}>Display Name</p>
            {isEditing ? (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-muted-white">{displayName || '--'}</p>
            )}
          </div>

          {/* Company */}
          <div>
            <p className={labelClass}>Company</p>
            {isEditing ? (
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-muted-white">{companyName || '--'}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <p className={labelClass}>Phone</p>
            {isEditing ? (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-muted-white">{phone || '--'}</p>
            )}
          </div>

          {/* Plan */}
          <div>
            <p className={labelClass}>Plan</p>
            {isEditing ? (
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className={inputClass}
              >
                <option value="harbor">Harbor ($99/mo)</option>
                <option value="gulf">Gulf ($179/mo)</option>
                <option value="horizon">Horizon ($249/mo)</option>
                <option value="captain">Captain ($499/mo) -- Internal</option>
              </select>
            ) : (
              <div className="flex items-center gap-2">
                {planInfo ? (
                  <span className="inline-block rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                    {planInfo.name}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                    No Plan
                  </span>
                )}
                {customer.is_admin && (
                  <span className="inline-block rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                    Admin
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Member Since */}
          <div>
            <p className={labelClass}>Member Since</p>
            <p className="text-sm text-muted-white">{memberSince}</p>
          </div>

          {/* Status */}
          <div>
            <p className={labelClass}>Status</p>
            <div className="flex items-center gap-3">
              {isDisabled ? (
                <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                  Disabled
                </span>
              ) : (
                <span className="inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  Active
                </span>
              )}
              <button
                onClick={handleToggleDisable}
                disabled={disableLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  isDisabled
                    ? 'border border-green-500/30 text-green-400 hover:border-green-500 hover:bg-green-500/10'
                    : 'border border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-500/10'
                }`}
              >
                {disableLoading
                  ? 'Processing...'
                  : isDisabled
                    ? 'Enable Account'
                    : 'Disable Account'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions Card */}
      <Card>
        <h2 className="mb-4 font-display text-lg font-bold text-muted-white">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/provision?customer_id=${customer.id}`}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Provision New Site
          </Link>
        </div>
      </Card>

      {/* Domains Section */}
      <Card className="overflow-hidden p-0">
        <div className="p-6 pb-0">
          <h2 className="font-display text-lg font-bold text-muted-white">
            Domains ({domains.length})
          </h2>
        </div>
        {domains.length === 0 ? (
          <div className="p-6 pt-4">
            <p className="text-sm text-slate">No domains registered</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-slate">
                  <th className="px-6 py-3 font-medium">Domain Name</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Registered</th>
                  <th className="px-6 py-3 font-medium">Expires</th>
                  <th className="px-6 py-3 font-medium">Auto-Renew</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domains.map((d) => {
                  const registered = d.registered_at
                    ? new Date(d.registered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '--';
                  const expires = d.expires_at
                    ? new Date(d.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '--';

                  return (
                    <tr key={d.id} className="transition-colors hover:bg-card-content/50">
                      <td className="px-6 py-3">
                        <Link
                          href={`/domains/${d.domain_name}/dns`}
                          className="font-medium text-gold transition-colors hover:text-gold-hover"
                        >
                          {d.domain_name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.status === 'active'
                            ? 'bg-green-500/10 text-green-400'
                            : d.status === 'expired'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {d.status ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate">{registered}</td>
                      <td className="px-6 py-3 text-slate">{expires}</td>
                      <td className="px-6 py-3 text-slate">{d.auto_renew ? 'Yes' : 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Hosting Apps Section */}
      <Card className="overflow-hidden p-0">
        <div className="p-6 pb-0">
          <h2 className="font-display text-lg font-bold text-muted-white">
            Hosting Apps ({hostingApps.length})
          </h2>
        </div>
        {hostingApps.length === 0 ? (
          <div className="p-6 pt-4">
            <p className="text-sm text-slate">No hosting apps</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-slate">
                  <th className="px-6 py-3 font-medium">App Name</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Primary Domain</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Provisioned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hostingApps.map((app) => {
                  const typeLabel = app.app_type === 'nodejs' ? 'Node.js' : app.app_type === 'wordpress' ? 'WordPress' : app.app_type;
                  const provisioned = new Date(app.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={app.id} className="transition-colors hover:bg-card-content/50">
                      <td className="px-6 py-3">
                        <Link
                          href={`/hosting/${app.app_slug}`}
                          className="font-medium text-gold transition-colors hover:text-gold-hover"
                        >
                          {app.app_name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          app.app_type === 'nodejs'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-slate">{app.primary_domain}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          app.cached_status === 'running'
                            ? 'bg-green-500/10 text-green-400'
                            : app.cached_status === 'stopped'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-slate/10 text-slate'
                        }`}>
                          {app.cached_status ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate">{provisioned}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Email Domains Section */}
      <Card className="overflow-hidden p-0">
        <div className="p-6 pb-0">
          <h2 className="font-display text-lg font-bold text-muted-white">
            Email Domains ({emailDomains.length})
          </h2>
        </div>
        {emailDomains.length === 0 ? (
          <div className="p-6 pt-4">
            <p className="text-sm text-slate">No email domains</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-slate">
                  <th className="px-6 py-3 font-medium">Domain</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Mailboxes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emailDomains.map((ed) => (
                  <tr key={ed.id} className="transition-colors hover:bg-card-content/50">
                    <td className="px-6 py-3">
                      <Link
                        href={`/email/${ed.domain_name}`}
                        className="font-medium text-gold transition-colors hover:text-gold-hover"
                      >
                        {ed.domain_name}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        ed.opensrs_status === 'active'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {ed.opensrs_status ?? 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate">{ed.mailbox_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
