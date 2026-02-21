'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { stripePromise } from '@/lib/stripe-client'
import Card from '@/components/ui/card'

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

interface RegistrationPayload {
  domain: string
  period: number
  contact: ContactInfo
  useForAll: boolean
  privacy: boolean
  autoRenew: boolean
}

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#D4AF37',
    colorBackground: '#23272E',
    colorText: '#E8ECF1',
    colorTextSecondary: '#8892A0',
    colorDanger: '#ef4444',
    colorIconTab: '#8892A0',
    colorIconTabSelected: '#D4AF37',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid #3a3f47',
      backgroundColor: '#23272E',
    },
    '.Input:focus': {
      border: '1px solid #D4AF37',
      boxShadow: 'none',
      outline: 'none',
    },
    '.Label': {
      color: '#8892A0',
      fontSize: '13px',
    },
  },
}

// ─── Payment step (must be inside <Elements>) ──────────────────────────────

interface PaymentStepProps {
  domain: string
  period: number
  totalPrice: number
  paymentIntentId: string
  payload: RegistrationPayload
  onSuccess: () => void
  onBack: () => void
}

function PaymentStep({
  domain,
  period,
  totalPrice,
  paymentIntentId,
  payload,
  onSuccess,
  onBack,
}: PaymentStepProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [paying, setPaying] = useState(false)
  const [registering, setRegistering] = useState(false)
  // Errors before payment is confirmed (card declined, etc.) — user can retry
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // Errors after payment is confirmed — don't let user re-submit, they've already paid
  const [postPaymentError, setPostPaymentError] = useState<string | null>(null)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setPaymentError(null)
    setPaying(true)

    // Confirm payment client-side via Stripe Elements
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/domains`,
      },
      redirect: 'if_required',
    })

    if (error) {
      setPaymentError(error.message ?? 'Payment failed. Please try again.')
      setPaying(false)
      return
    }

    if (paymentIntent?.status !== 'succeeded') {
      setPaymentError('Payment was not completed. Please try again.')
      setPaying(false)
      return
    }

    // Payment succeeded — register the domain.
    // Do NOT bounce the user back to the contact form from here — they've already been charged.
    setPaying(false)
    setRegistering(true)

    try {
      const res = await fetch('/api/domains/register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, ...payload }),
      })

      const data = await res.json()

      if (!res.ok) {
        setPostPaymentError(data.error || 'Registration failed after payment. Please contact support@motive.host.')
        setRegistering(false)
        return
      }

      setRegistering(false)
      onSuccess()
      setTimeout(() => router.push('/domains'), 2500)
    } catch {
      setPostPaymentError('Something went wrong after payment. Please contact support@motive.host.')
      setRegistering(false)
    }
  }

  // Post-payment failure — show a dedicated screen, not the payment form
  if (postPaymentError) {
    return (
      <div className="mt-8">
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="py-4">
            <h2 className="font-display text-lg font-semibold text-red-400">Registration Failed</h2>
            <p className="mt-2 text-sm text-muted-white">{postPaymentError}</p>
            <div className="mt-4 rounded-lg border border-border bg-card-content px-4 py-3 text-sm text-slate">
              <p className="font-medium text-muted-white">Your payment was processed.</p>
              <p className="mt-1">Domain: <span className="font-mono text-gold">{domain}</span></p>
              <p className="mt-1">Please contact <a href="mailto:support@motive.host" className="text-gold hover:underline">support@motive.host</a> and include your domain name. We will complete the registration or issue a full refund.</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const buttonLabel = registering
    ? 'Registering domain...'
    : paying
    ? 'Processing payment...'
    : `Pay $${totalPrice}`

  return (
    <form onSubmit={handlePay} className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {paymentError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {paymentError}
          </div>
        )}

        <Card>
          <h2 className="mb-5 font-display text-lg font-semibold text-muted-white">Payment</h2>
          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />
        </Card>

        <button
          type="button"
          onClick={async () => {
            await fetch('/api/domains/register', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentIntentId }),
            }).catch(() => {/* best-effort */})
            onBack()
          }}
          disabled={paying || registering}
          className="text-sm text-slate hover:text-muted-white disabled:opacity-50"
        >
          ← Back to contact info
        </button>
      </div>

      {/* Order Summary */}
      <div className="lg:col-span-1">
        <Card className="sticky top-20">
          <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Order Summary</h2>

          <div className="space-y-3 border-b border-border pb-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate">Domain</span>
              <span className="font-mono text-muted-white">{domain}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate">Period</span>
              <span className="text-muted-white">{period} year{period > 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate">WHOIS Privacy</span>
              <span className="text-green-400">Included</span>
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <span className="font-medium text-muted-white">Total</span>
            <span className="text-xl font-bold text-gold">${totalPrice}</span>
          </div>

          <button
            type="submit"
            disabled={!stripe || !elements || paying || registering}
            className="mt-6 w-full rounded-lg bg-gold px-4 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
          >
            {buttonLabel}
          </button>

          <p className="mt-3 text-center text-xs text-slate">
            Secured by Stripe
          </p>
        </Card>
      </div>
    </form>
  )
}

// ─── Main register form ────────────────────────────────────────────────────

function RegisterForm() {
  const searchParams = useSearchParams()
  const domain = searchParams.get('domain') || ''

  const [contact, setContact] = useState<ContactInfo>(emptyContact)
  const [useForAll, setUseForAll] = useState(true)
  const [period, setPeriod] = useState(1)
  const [privacy, setPrivacy] = useState(true)
  const [autoRenew, setAutoRenew] = useState(false)

  const [price, setPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Payment step state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  // authorizedAmountCents is set from the POST response — authoritative charge amount
  const [authorizedAmountCents, setAuthorizedAmountCents] = useState<number | null>(null)
  const [step, setStep] = useState<'contact' | 'payment'>('contact')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!domain) return
    async function fetchPrice() {
      try {
        const res = await fetch('/api/domains/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: domain }),
        })
        if (!res.ok) throw new Error('Price fetch failed')
        const data = await res.json()
        if (data.exact?.price) setPrice(data.exact.price)
      } catch {
        setError('Unable to fetch pricing. Please go back and try again.')
      } finally {
        setPriceLoading(false)
      }
    }
    fetchPrice()
  }, [domain])

  function updateContact(field: keyof ContactInfo, value: string) {
    setContact((prev) => ({ ...prev, [field]: value }))
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/domains/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, period, contact, useForAll, privacy, autoRenew }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to initialize payment. Please try again.')
        return
      }

      const data = await res.json()
      setClientSecret(data.clientSecret)
      setPaymentIntentId(data.paymentIntentId)
      setAuthorizedAmountCents(data.amount)
      setStep('payment')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!domain) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-slate">No domain specified.</p>
        <a href="/domains/search" className="mt-4 inline-block text-gold hover:text-gold-hover">
          Search for a domain
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <Card>
          <div className="py-8">
            <div className="mb-4 text-4xl">&#10003;</div>
            <h2 className="font-display text-2xl font-bold text-muted-white">Domain Registered!</h2>
            <p className="mt-2 font-mono text-gold">{domain}</p>
            <p className="mt-4 text-sm text-slate">Redirecting to your domains...</p>
          </div>
        </Card>
      </div>
    )
  }

  const totalPrice = price ? price * period : null
  const payload: RegistrationPayload = { domain, period, contact, useForAll, privacy, autoRenew }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-muted-white">Register Domain</h1>
      <p className="mt-2 text-slate">
        Complete your registration for <span className="font-mono text-gold">{domain}</span>
      </p>

      {/* Step indicator */}
      <div className="mt-6 flex items-center gap-3 text-sm">
        <span className={step === 'contact' ? 'font-medium text-gold' : 'text-slate'}>
          1. Contact Info
        </span>
        <span className="text-border">→</span>
        <span className={step === 'payment' ? 'font-medium text-gold' : 'text-slate'}>
          2. Payment
        </span>
      </div>

      {/* ── Step 1: Contact form ── */}
      {step === 'contact' && (
        <form onSubmit={handleContactSubmit} className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Contact Information</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-slate">First Name *</label>
                  <input
                    type="text" required value={contact.first_name}
                    onChange={(e) => updateContact('first_name', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-slate">Last Name *</label>
                  <input
                    type="text" required value={contact.last_name}
                    onChange={(e) => updateContact('last_name', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-slate">Email *</label>
                  <input
                    type="email" required value={contact.email}
                    onChange={(e) => updateContact('email', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-slate">Phone *</label>
                  <input
                    type="tel" required value={contact.phone}
                    onChange={(e) => updateContact('phone', e.target.value)}
                    placeholder="+1.5551234567"
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm text-slate">Organization (optional)</label>
                <input
                  type="text" value={contact.org_name}
                  onChange={(e) => updateContact('org_name', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm text-slate">Address *</label>
                <input
                  type="text" required value={contact.address1}
                  onChange={(e) => updateContact('address1', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
              <div className="mt-2">
                <input
                  type="text" value={contact.address2}
                  onChange={(e) => updateContact('address2', e.target.value)}
                  placeholder="Apt, Suite, etc. (optional)"
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-slate">City *</label>
                  <input
                    type="text" required value={contact.city}
                    onChange={(e) => updateContact('city', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-slate">State *</label>
                  <input
                    type="text" required value={contact.state}
                    onChange={(e) => updateContact('state', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-slate">ZIP *</label>
                  <input
                    type="text" required value={contact.postal_code}
                    onChange={(e) => updateContact('postal_code', e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm text-slate">Country</label>
                <select
                  value={contact.country}
                  onChange={(e) => updateContact('country', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>

              <label className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox" checked={useForAll}
                  onChange={(e) => setUseForAll(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-slate">Use same contact for admin, tech, and billing</span>
              </label>
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Registration Options</h2>

              <div>
                <label className="mb-1.5 block text-sm text-slate">Registration Period</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => (
                    <option key={y} value={y}>
                      {y} year{y > 1 ? 's' : ''}{price ? ` — $${price * y}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <label className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox" checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-slate">WHOIS Privacy Protection (recommended)</span>
              </label>

              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox" checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-slate">Auto-renew before expiration</span>
              </label>
            </Card>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Order Summary</h2>

              <div className="space-y-3 border-b border-border pb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate">Domain</span>
                  <span className="font-mono text-muted-white">{domain}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate">Period</span>
                  <span className="text-muted-white">{period} year{period > 1 ? 's' : ''}</span>
                </div>
                {privacy && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">WHOIS Privacy</span>
                    <span className="text-green-400">Included</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-between">
                <span className="font-medium text-muted-white">Total</span>
                {priceLoading ? (
                  <span className="text-slate">Loading...</span>
                ) : totalPrice !== null ? (
                  <span className="text-xl font-bold text-gold">${totalPrice}</span>
                ) : (
                  <span className="text-slate">--</span>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !price}
                className="mt-6 w-full rounded-lg bg-gold px-4 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
              >
                {submitting ? 'Preparing payment...' : 'Continue to Payment →'}
              </button>

              <p className="mt-3 text-center text-xs text-slate">
                Payment processed securely via Stripe
              </p>
            </Card>
          </div>
        </form>
      )}

      {/* ── Step 2: Payment (Stripe Elements) ── */}
      {step === 'payment' && clientSecret && paymentIntentId && authorizedAmountCents !== null && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: stripeAppearance,
          }}
        >
          <PaymentStep
            domain={domain}
            period={period}
            totalPrice={authorizedAmountCents / 100}
            paymentIntentId={paymentIntentId}
            payload={payload}
            onSuccess={() => setSuccess(true)}
            onBack={() => {
              setStep('contact')
              setClientSecret(null)
              setPaymentIntentId(null)
              setAuthorizedAmountCents(null)
            }}
          />
        </Elements>
      )}
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}
