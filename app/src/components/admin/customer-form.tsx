'use client';

import { useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/card';
import { PLANS } from '@/lib/plans';

interface CreateResult {
  customer: {
    id: string;
    email: string;
    name: string;
    plan: string;
    created_at: string;
  };
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function CustomerForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [plan, setPlan] = useState<string>('harbor');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const [formState, setFormState] = useState<FormState>('idle');
  const [result, setResult] = useState<CreateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setResult(null);
    setErrorMessage('');

    const payload: Record<string, unknown> = {
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      plan,
      send_welcome_email: sendWelcomeEmail,
    };

    if (displayName.trim()) payload.display_name = displayName.trim();
    if (companyName.trim()) payload.company_name = companyName.trim();
    if (phone.trim()) payload.phone = phone.trim();

    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormState('error');
        setErrorMessage(data.error ?? 'An unexpected error occurred');
        return;
      }

      setFormState('success');
      setResult(data as CreateResult);
    } catch {
      setFormState('error');
      setErrorMessage('Network error -- check your connection and try again');
    }
  }

  function handleCreateAnother() {
    setFormState('idle');
    setResult(null);
    setErrorMessage('');
    setEmail('');
    setPassword('');
    setName('');
    setDisplayName('');
    setCompanyName('');
    setPhone('');
    setPlan('harbor');
    setSendWelcomeEmail(true);
  }

  // Success state
  if (formState === 'success' && result) {
    const planInfo = PLANS[result.customer.plan as keyof typeof PLANS];
    const planLabel = planInfo?.name ?? result.customer.plan;

    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <div className="mb-4 text-4xl">&#10003;</div>
        <h2 className="font-display text-xl font-bold text-muted-white">Customer Created</h2>
        <p className="mt-2 text-sm text-slate">
          {result.customer.name} ({result.customer.email}) on {planLabel} plan
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={`/admin/customers/${result.customer.id}`}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            View Customer
          </Link>
          <button
            onClick={handleCreateAnother}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-gold hover:text-muted-white"
          >
            Create Another
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
        {/* Email */}
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            required
            className={inputClass}
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className={labelClass}>Temporary Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            required
            minLength={8}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate/60">Visible to admin. Sent to customer in welcome email.</p>
        </div>

        {/* Full Name */}
        <div>
          <label htmlFor="name" className={labelClass}>Full Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            className={inputClass}
          />
        </div>

        {/* Display Name */}
        <div>
          <label htmlFor="displayName" className={labelClass}>
            Display Name <span className="text-slate/50">(optional)</span>
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane"
            className={inputClass}
          />
        </div>

        {/* Company Name */}
        <div>
          <label htmlFor="companyName" className={labelClass}>
            Company Name <span className="text-slate/50">(optional)</span>
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            className={inputClass}
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone <span className="text-slate/50">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className={inputClass}
          />
        </div>

        {/* Plan */}
        <div>
          <label htmlFor="plan" className={labelClass}>Plan</label>
          <select
            id="plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            required
            className={inputClass}
          >
            <option value="harbor">Harbor ($99/mo)</option>
            <option value="gulf">Gulf ($179/mo)</option>
            <option value="horizon">Horizon ($249/mo)</option>
            <option value="captain">Captain ($499/mo) -- Internal</option>
          </select>
        </div>

        {/* Send Welcome Email */}
        <div>
          <label className="flex items-center gap-2 text-sm text-muted-white">
            <input
              type="checkbox"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
              className="accent-gold"
            />
            Send welcome email with login credentials
          </label>
        </div>

        {/* Error display */}
        {formState === 'error' && errorMessage && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={formState === 'submitting'}
          className="w-full rounded-lg bg-gold px-4 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {formState === 'submitting' ? 'Creating Customer...' : 'Create Customer'}
        </button>
      </Card>
    </form>
  );
}
