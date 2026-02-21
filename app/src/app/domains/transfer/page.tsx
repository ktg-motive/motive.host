'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { stripePromise } from '@/lib/stripe-client'
import Card from '@/components/ui/card'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ContactInfo {
  first_name: string
  last_name: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  postal_code: string
  country: string
  org_name: string
}

const emptyContact: ContactInfo = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  org_name: '',
}

// ─── Stripe appearance ─────────────────────────────────────────────────────

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#D4AF37',
    colorBackground: '#23272E',
    colorText: '#E8ECF1',
    colorTextSecondary: '#8892A0',
    colorDanger: '#ef4444',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #3a3f47', backgroundColor: '#23272E' },
    '.Input:focus': { border: '1px solid #D4AF37', boxShadow: 'none', outline: 'none' },
    '.Label': { color: '#8892A0', fontSize: '13px' },
  },
}

// ─── Payment step ──────────────────────────────────────────────────────────

interface PaymentStepProps {
  domain: string
  authCode: string
  period: number
  contact: ContactInfo
  amountCents: number
  paymentIntentId: string
  onBack: () => void
  onSuccess: (orderId: string) => void
}

function PaymentStep({
  domain,
  authCode,
  period,
  contact,
  amountCents,
  paymentIntentId,
  onBack,
  onSuccess,
}: PaymentStepProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleBack() {
    // Cancel the PaymentIntent before going back
    try {
      await fetch('/api/transfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      })
    } catch {
      // Non-fatal — PI will expire on its own
    }
    onBack()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    // Confirm payment client-side
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status !== 'succeeded') {
      setError('Payment was not completed. Please try again.')
      setSubmitting(false)
      return
    }

    // Fulfill transfer
    const res = await fetch('/api/transfers/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId,
        domain,
        period,
        auth_code: authCode,
        contact,
        useForAll: true,
        privacy: true,
        autoRenew: false,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Transfer failed. Please contact support.')
      setSubmitting(false)
      return
    }

    onSuccess(data.orderId)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <p className="mb-1 text-sm text-slate">Transferring</p>
        <p className="font-mono text-lg font-semibold text-muted-white">{domain}</p>
        <p className="mt-1 text-sm text-slate">
          Transfer fee:{' '}
          <span className="text-muted-white">${(amountCents / 100).toFixed(2)}</span>
          {' '}(includes 1-year renewal)
        </p>
      </div>

      <PaymentElement />

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={submitting}
          className="rounded-lg border border-border px-4 py-2.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting || !stripe}
          className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
        >
          {submitting ? 'Processing…' : `Pay & Transfer`}
        </button>
      </div>
    </form>
  )
}

// ─── Input helper ──────────────────────────────────────────────────────────

function Field({
  label,
  id,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  className,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs text-slate">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-white placeholder-slate/50 outline-none transition-colors focus:border-gold"
      />
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

type Step = 'check' | 'details' | 'payment' | 'success'

export default function TransferPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('check')
  const [domain, setDomain] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [contact, setContact] = useState<ContactInfo>(emptyContact)
  const [period] = useState(1)

  // Eligibility / pricing state
  const [checking, setChecking] = useState(false)
  const [eligibilityError, setEligibilityError] = useState<string | null>(null)
  const [priceCents, setPriceCents] = useState<number | null>(null)

  // Payment state
  const [initiating, setInitiating] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [initiateError, setInitiateError] = useState<string | null>(null)

  // Success state
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null)

  function updateContact(field: keyof ContactInfo, value: string) {
    setContact((prev) => ({ ...prev, [field]: value }))
  }

  // Step 1: Check eligibility
  async function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setEligibilityError(null)
    setPriceCents(null)

    try {
      const res = await fetch('/api/transfers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      })

      const data = await res.json()

      if (!res.ok || !data.eligible) {
        setEligibilityError(data.reason ?? data.error ?? 'Domain is not eligible for transfer.')
        return
      }

      setPriceCents(data.price_cents)
      setStep('details')
    } catch {
      setEligibilityError('Network error. Please check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }

  // Step 2 → 3: Initiate PaymentIntent
  async function handleInitiate(e: React.FormEvent) {
    e.preventDefault()
    setInitiating(true)
    setInitiateError(null)

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, period }),
      })

      const data = await res.json()

      if (!res.ok) {
        setInitiateError(data.error ?? 'Failed to set up payment. Please try again.')
        return
      }

      setClientSecret(data.clientSecret)
      setPaymentIntentId(data.paymentIntentId)
      setAmountCents(data.amount)
      setStep('payment')
    } catch {
      setInitiateError('Network error. Please check your connection and try again.')
    } finally {
      setInitiating(false)
    }
  }

  function handlePaymentSuccess(orderId: string) {
    setSuccessOrderId(orderId)
    setStep('success')
  }

  function handlePaymentBack() {
    setClientSecret(null)
    setPaymentIntentId(null)
    setStep('details')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <div className="mb-8">
        <button
          onClick={() => router.push('/domains')}
          className="mb-4 text-sm text-slate transition-colors hover:text-muted-white"
        >
          ← My Domains
        </button>
        <h1 className="font-display text-2xl font-bold text-muted-white sm:text-3xl">
          Transfer a Domain
        </h1>
        <p className="mt-1 text-sm text-slate">
          Bring your domain to Motive Hosting. Transfer fees are passed through at wholesale — no markup.
        </p>
      </div>

      {/* ── Step: Check eligibility ── */}
      {step === 'check' && (
        <Card className="p-6">
          <form onSubmit={handleCheck} className="space-y-4">
            <div>
              <label htmlFor="domain-input" className="mb-1 block text-xs text-slate">
                Domain Name<span className="ml-0.5 text-red-400">*</span>
              </label>
              <input
                id="domain-input"
                type="text"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); setEligibilityError(null) }}
                placeholder="yourdomain.com"
                required
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-muted-white placeholder-slate/50 outline-none transition-colors focus:border-gold"
              />
            </div>

            {eligibilityError && (
              <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {eligibilityError}
              </p>
            )}

            <button
              type="submit"
              disabled={checking || !domain.trim()}
              className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Check Transfer Eligibility'}
            </button>
          </form>
        </Card>
      )}

      {/* ── Step: Details (auth code + contact) ── */}
      {step === 'details' && (
        <Card className="p-6">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              <p className="text-sm text-green-400">
                <span className="font-mono font-medium text-muted-white">{domain}</span> is eligible for transfer
              </p>
            </div>
            {priceCents !== null && (
              <p className="mt-1 text-sm text-slate">
                Transfer fee:{' '}
                <span className="font-medium text-muted-white">${(priceCents / 100).toFixed(2)}</span>
                {' '}— includes 1-year renewal
              </p>
            )}
          </div>

          <form onSubmit={handleInitiate} className="space-y-5">
            <div>
              <label htmlFor="auth-code" className="mb-1 block text-xs text-slate">
                Authorization / EPP Code<span className="ml-0.5 text-red-400">*</span>
              </label>
              <input
                id="auth-code"
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Get this from your current registrar"
                required
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-muted-white placeholder-slate/50 outline-none transition-colors focus:border-gold"
              />
              <p className="mt-1 text-xs text-slate">
                Log in to your current registrar and look for &ldquo;EPP code&rdquo;, &ldquo;Auth code&rdquo;, or &ldquo;Transfer code&rdquo;.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate">
                Registrant Contact
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" id="fn" value={contact.first_name} onChange={(v) => updateContact('first_name', v)} required />
                <Field label="Last name" id="ln" value={contact.last_name} onChange={(v) => updateContact('last_name', v)} required />
                <Field label="Email" id="email" type="email" value={contact.email} onChange={(v) => updateContact('email', v)} required className="col-span-2" />
                <Field label="Phone" id="phone" type="tel" value={contact.phone} onChange={(v) => updateContact('phone', v)} placeholder="+1.8005551234" required className="col-span-2" />
                <Field label="Address" id="addr1" value={contact.address1} onChange={(v) => updateContact('address1', v)} required className="col-span-2" />
                <Field label="City" id="city" value={contact.city} onChange={(v) => updateContact('city', v)} required />
                <Field label="State" id="state" value={contact.state} onChange={(v) => updateContact('state', v)} required />
                <Field label="Postal code" id="zip" value={contact.postal_code} onChange={(v) => updateContact('postal_code', v)} required />
                <Field label="Country" id="country" value={contact.country} onChange={(v) => updateContact('country', v)} required />
                <Field label="Organization (optional)" id="org" value={contact.org_name} onChange={(v) => updateContact('org_name', v)} className="col-span-2" />
              </div>
            </div>

            {initiateError && (
              <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{initiateError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep('check'); setAuthCode('') }}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={initiating || !authCode.trim()}
                className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
              >
                {initiating ? 'Setting up payment…' : 'Continue to Payment'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Step: Payment ── */}
      {step === 'payment' && clientSecret && paymentIntentId && amountCents !== null && (
        <Card className="p-6">
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: stripeAppearance }}
          >
            <PaymentStep
              domain={domain}
              authCode={authCode}
              period={period}
              contact={contact}
              amountCents={amountCents}
              paymentIntentId={paymentIntentId}
              onBack={handlePaymentBack}
              onSuccess={handlePaymentSuccess}
            />
          </Elements>
        </Card>
      )}

      {/* ── Step: Success ── */}
      {step === 'success' && (
        <Card className="p-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-muted-white">Transfer Initiated</h2>
          <p className="mb-1 text-sm text-slate">
            <span className="font-mono text-muted-white">{domain}</span> transfer has been submitted.
          </p>
          <p className="mb-2 text-sm text-slate">
            This typically takes 5–7 days. Your current registrar may email you to approve the transfer.
          </p>
          {successOrderId && (
            <p className="mb-6 text-xs text-slate">
              Order ID: <span className="font-mono text-muted-white">{successOrderId}</span>
            </p>
          )}
          <button
            onClick={() => router.push('/domains')}
            className="rounded-lg bg-gold px-6 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Go to My Domains
          </button>
        </Card>
      )}

    </div>
  )
}
